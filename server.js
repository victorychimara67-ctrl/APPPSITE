import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";
import { URL } from "node:url";

const root = process.cwd();
const dataDir = join(root, "data");
const dbPath = join(dataDir, "store.json");

loadEnv();

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const FILE_DB_WRITES = String(process.env.FILE_DB_WRITES || (process.env.VERCEL ? "false" : "true")).toLowerCase() === "true";
const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
const PRINTFUL_STORE_ID = process.env.PRINTFUL_STORE_ID || "";
const PRINTFUL_AUTO_CONFIRM = String(process.env.PRINTFUL_AUTO_CONFIRM).toLowerCase() === "true";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const SITE_URL = normalizeSiteUrl(process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "");
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "echimara98@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const localProducts = [
  { id: "hoodie", name: "ECI Essential Hoodie", price: 89.99, image: "assets/product-hoodie.png", printfulVariantId: process.env.PRINTFUL_VARIANT_hoodie || "" },
  { id: "tee", name: "ECI Minimal Tee", price: 49.99, image: "assets/product-tee.png", printfulVariantId: process.env.PRINTFUL_VARIANT_tee || "" },
  { id: "jacket", name: "ECI Puffer Jacket", price: 129.99, image: "assets/product-jacket.png", printfulVariantId: process.env.PRINTFUL_VARIANT_jacket || "" },
  { id: "cap", name: "ECI Minimal Cap", price: 29.99, image: "assets/product-cap.png", printfulVariantId: process.env.PRINTFUL_VARIANT_cap || "" },
  { id: "pants", name: "ECI Cargo Pants", price: 79.99, image: "assets/product-pants.png", printfulVariantId: process.env.PRINTFUL_VARIANT_pants || "" },
  { id: "sneakers", name: "ECI Core Sneakers", price: 119.99, image: "assets/product-sneakers.png", printfulVariantId: process.env.PRINTFUL_VARIANT_sneakers || "" }
];

let productCache = { expiresAt: 0, products: null, source: "", connected: false, warning: "" };
let memoryDb = loadDbFile();

const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

/* ---------------- ENV + DB ---------------- */

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  const rows = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...parts] = line.split("=");
    const cleanKey = key.replace(/^\uFEFF/, "");
    if (!process.env[cleanKey]) process.env[cleanKey] = parts.join("=").trim();
  }
}

function normalizeSiteUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function loadDbFile() {
  try {
    if (existsSync(dbPath)) return migrateDb(JSON.parse(readFileSync(dbPath, "utf8")));
  } catch (error) {
    console.warn(`Could not read ${dbPath}; using in-memory store. ${error.message}`);
  }
  return emptyDb();
}

function readDb() {
  return migrateDb(memoryDb);
}

function writeDb(db, options = {}) {
  memoryDb = migrateDb(db);
  const persist = options.persist ?? FILE_DB_WRITES;
  if (!persist) return false;
  try {
    if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
    writeFileSync(dbPath, JSON.stringify(memoryDb, null, 2));
    return true;
  } catch (error) {
    console.warn(`Could not persist ${dbPath}; continuing in memory. ${error.message}`);
    return false;
  }
}

function emptyDb() {
  return { users: [], sessions: [], orders: [], hiddenProducts: [], discountCodes: [], productOverrides: {} };
}

function migrateDb(db) {
  db.users ||= [];
  db.sessions ||= [];
  db.orders ||= [];
  db.hiddenProducts ||= [];
  db.discountCodes ||= [];
  db.productOverrides ||= {};
  db.users.forEach((user) => {
    if (ADMIN_EMAILS.has(String(user.email || "").toLowerCase())) user.role = "admin";
  });
  return db;
}

/* ---------------- AUTH + HELPERS ---------------- */

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload));
}

/* ---------------- STRIPE ---------------- */

const Stripe = require("stripe");

async function createStripeCheckoutSession(req, order) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Stripe secret key is not configured on the server.");
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const amount = stripeAmount(order.total);
  if (amount <= 0) {
    throw new Error("Stripe requires an order total greater than zero.");
  }

  const origin = SITE_URL || getRequestOrigin(req);

  return await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.recipient.email,
    client_reference_id: order.id,
    line_items: [
      {
        price_data: {
          currency: order.currency.toLowerCase(),
          product_data: {
            name: "ECI Custom Order",
            description: `${order.items.length} item(s)`
          },
          unit_amount: amount
        },
        quantity: 1
      }
    ],
    success_url: `${origin}/?payment=success&order=${order.id}`,
    cancel_url: `${origin}/?payment=cancelled&order=${order.id}#cart`
  });
}

/* ---------------- FIXED AREA (REMOVED BAD CODE) ---------------- */
/* ❌ The broken fetch Stripe block was removed completely here */
/* --------------------------------------------------------------- */

/* ---------------- WEB SERVER ---------------- */

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname.startsWith("/api/")) {
    await routeApi(req, res, url.pathname);
    return;
  }

  serveStatic(req, res, url.pathname);
}).listen(PORT, () => {
  console.log(`Emmanuel CI Universe running at http://localhost:${PORT}`);
});