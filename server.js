import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";
import { URL } from "node:url";
import Stripe from "stripe";

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
  (process.env.ADMIN_EMAILS || "victorychimara67@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

function mapOrderStatus(status, isAdmin) {
  const s = String(status || "pending").toLowerCase();
  if (!isAdmin) {
    if (s === "pending" || s === "pending_payment") return "Awaiting Payment";
    if (s === "paid") return "Order Confirmed";
    if (s === "draft" || s.includes("printful")) return "In Preparation";
    if (s === "shipped") return "Dispatched";
    if (s === "problem") return "Action Required";
    return s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ");
  }
  return s.toUpperCase().replace(/_/g, " ");
}

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

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return;
  const rows = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const [key, ...parts] = line.split("=");
    const cleanKey = key.replace(/^\uFEFF/, "").trim();
    if (!process.env[cleanKey]) {
      // Strip quotes if present
      let value = parts.join("=").trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[cleanKey] = value;
    }
  }
}

function normalizeSiteUrl(value) {
  let raw = String(value || "").trim();
  // Strip quotes
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1);
  }
  raw = raw.trim().replace(/\/+$/, "");
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
    console.log(`Database persisted to ${dbPath} (${memoryDb.users.length} users, ${memoryDb.orders.length} orders)`);
    return true;
  } catch (error) {
    console.warn(`Could not persist ${dbPath}; continuing in memory. ${error.message}`);
    return false;
  }
}

function emptyDb() {
  return { 
    users: [], 
    sessions: [], 
    orders: [], 
    hiddenProducts: [], 
    discountCodes: [], 
    productOverrides: {},
    messages: [],
    popupConfig: {
      enabled: true,
      title: "Join the Universe",
      text: "Take 10% OFF your first custom piece.",
      code: "ECI10",
      targetProductId: ""
    },
    analytics: {
      totalVisits: 0,
      referrers: {}
    }
  };
}

function migrateDb(db) {
  db.users ||= [];
  db.sessions ||= [];
  db.orders ||= [];
  db.hiddenProducts ||= [];
  db.discountCodes ||= [];
  db.productOverrides ||= {};
  db.messages ||= [];
  db.popupConfig ||= { enabled: true, title: "Join the Universe", text: "Take 10% OFF your first custom piece.", code: "ECI10", targetProductId: "" };
  db.analytics ||= { totalVisits: 0, referrers: {} };
  db.users.forEach((user) => {
    if (ADMIN_EMAILS.has(String(user.email || "").toLowerCase())) user.role = "admin";
  });
  return db;
}

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolveBody, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 8_000_000) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

function parseRawBody(req, limit = 2_000_000) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let length = 0;
    req.on("data", (chunk) => {
      chunks.push(chunk);
      length += chunk.length;
      if (length > limit) {
        reject(new Error("Request body is too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, isAdmin: isAdmin(user) };
}

function isAdmin(user) {
  return user?.role === "admin" || ADMIN_EMAILS.has(String(user?.email || "").toLowerCase());
}

function requireAdmin(req, res) {
  const active = requireUser(req, res);
  if (!active) return null;
  if (!isAdmin(active.user)) {
    json(res, 403, { error: "Admin access required." });
    return null;
  }
  return active;
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) {
    console.warn("Password verification failed: invalid hash format", { salt: Boolean(salt), hash: Boolean(hash) });
    return false;
  }
  const candidate = hashPassword(password, salt).split(":")[1];
  if (!candidate) {
    console.warn("Password verification failed: candidate hash generation failed");
    return false;
  }
  if (hash.length !== candidate.length) {
    console.warn("Password verification failed: hash length mismatch", { expected: hash.length, got: candidate.length });
    return false;
  }
  try {
    const result = timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
    if (!result) {
      console.warn("Password verification failed: hashes don't match");
    }
    return result;
  } catch (error) {
    console.error("Password verification error:", error.message);
    return false;
  }
}

function toBase64Url(value) {
  const raw = Buffer.isBuffer(value) ? value.toString("base64") : Buffer.from(String(value)).toString("base64");
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hmacBase64Url(value) {
  return createHmac("sha256", SESSION_SECRET)
    .update(value)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function makeAuthToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = toBase64Url(
    JSON.stringify({
      sub: user.id,
      email: user.email,
      name: user.name,
      role: isAdmin(user) ? "admin" : "customer",
      iat: now,
      exp: now + 60 * 60 * 24 * 14
    })
  );
  const body = `${header}.${payload}`;
  return `${body}.${hmacBase64Url(body)}`;
}

function verifyAuthToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = hmacBase64Url(`${header}.${payload}`);
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) return null;
  try {
    const claims = JSON.parse(decodeBase64Url(payload));
    if (!claims?.sub || Number(claims.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

function secureCookieSuffix() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL ? "; Secure" : "";
}

function makeCookie(user) {
  return `session=${makeAuthToken(user)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 14}${secureCookieSuffix()}`;
}

function clearCookie() {
  return `session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookieSuffix()}`;
}

function getCookie(req, key) {
  const cookie = req.headers.cookie || "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${key}=`))
    ?.slice(key.length + 1);
}

function getSession(req) {
  const raw = getCookie(req, "session");
  const claims = verifyAuthToken(raw);
  if (!claims) return null;
  const db = readDb();
  const user = db.users.find((item) => item.id === claims.sub || item.email === claims.email);
  return user ? { db, user, claims } : null;
}

function requireUser(req, res) {
  const session = getSession(req);
  if (!session) {
    json(res, 401, { error: "Please sign in first." });
    return null;
  }
  return session;
}

async function printful(path, options = {}) {
  if (!PRINTFUL_TOKEN) throw new Error("Printful token is not configured.");
  const headers = {
    Authorization: `Bearer ${PRINTFUL_TOKEN}`,
    "Content-Type": "application/json",
    ...(PRINTFUL_STORE_ID ? { "X-PF-Store-Id": PRINTFUL_STORE_ID } : {}),
    ...(options.headers || {})
  };
  const response = await fetch(`https://api.printful.com${path}`, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || payload?.result || `Printful request failed with ${response.status}`;
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }
  return payload;
}

async function getProducts() {
  const db = readDb();
  const hidden = new Set(db.hiddenProducts || []);
  if (!PRINTFUL_TOKEN) return { source: "local", products: applyProductOverrides(localProducts, db).filter((product) => !hidden.has(product.id)) };
  if (productCache.products && productCache.expiresAt > Date.now()) {
    return {
      source: productCache.source || "printful",
      connected: productCache.connected,
      warning: productCache.warning || "",
      products: applyProductOverrides(productCache.products, db).filter((product) => !hidden.has(product.id))
    };
  }

  try {
    const payload = await printful("/store/products?limit=100");
    const summaries = (payload.result || []).filter((item) => item.synced !== false);
    const detailed = await Promise.all(
      summaries.map(async (item) => {
        try {
          const detail = await printful(`/store/products/${item.id}`);
          return mapPrintfulProduct(item, detail.result);
        } catch {
          return mapPrintfulProduct(item, null);
        }
      })
    );

    const products = detailed.filter(Boolean);
    productCache = {
      expiresAt: Date.now() + 1000 * 60 * 5,
      products,
      source: "printful",
      connected: true,
      warning: ""
    };
    return { source: "printful", connected: true, products: applyProductOverrides(productCache.products, db).filter((product) => !hidden.has(product.id)) };
  } catch (error) {
    console.warn(`Printful API error: ${error.message}`);
    productCache = {
      expiresAt: Date.now() + 1000 * 60,
      products: applyProductOverrides(localProducts, db).filter((product) => !hidden.has(product.id)),
      source: "local_fallback",
      connected: false,
      warning: `Printful temporarily unavailable, showing local products: ${error.message}`
    };
    return {
      source: productCache.source,
      connected: productCache.connected,
      warning: productCache.warning,
      products: productCache.products
    };
  }
}

async function getProduct(productId) {
  const { products } = await getProducts();
  return products.find((product) => product.id === productId) || null;
}

function mapPrintfulProduct(summary, detail) {
  const rawVariants = detail?.sync_variants || [];
  const variants = rawVariants.filter((variant) => variant.is_ignored === false);
  const firstVariant = variants.find((variant) => variant.is_ignored === false) || variants[0];
  if (!firstVariant) return null;
  const price = Number(firstVariant?.retail_price || summary.retail_price || 0);
  const previewImages = unique([
    summary.thumbnail_url,
    firstVariant?.thumbnail_url,
    ...variants.map((variant) => variant.thumbnail_url),
    ...variants.flatMap((variant) => (variant.files || []).filter((file) => file.type === "preview").map((file) => file.preview_url || file.thumbnail_url))
  ]).filter(Boolean);
  return {
    id: `printful-${summary.id}`,
    name: summary.name || firstVariant?.name || "Printful Product",
    price: Number.isFinite(price) && price > 0 ? price : null,
    currency: firstVariant?.currency || "USD",
    image: summary.thumbnail_url || firstVariant?.thumbnail_url || "assets/reference-showroom.png",
    printfulProductId: summary.id,
    printfulVariantId: firstVariant?.id ? String(firstVariant.id) : "",
    synced: summary.synced,
    description: detail?.sync_product?.description || "",
    images: previewImages.length ? previewImages : [summary.thumbnail_url || firstVariant?.thumbnail_url || "assets/reference-showroom.png"],
    variants: variants.map((variant) => ({
      id: String(variant.id),
      name: variant.name,
      price: Number(variant.retail_price || 0) || null,
      currency: variant.currency || "USD",
      image: variant.thumbnail_url || summary.thumbnail_url || "assets/reference-showroom.png"
    }))
  };
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function applyProductOverrides(productList, db) {
  const overrides = db.productOverrides || {};
  return productList.map((product) => {
    const override = overrides[product.id] || {};
    const customImageItems = normalizeImageItems(override.customImages || []);
    const customImages = customImageItems.map((item) => item.url);
    const image = normalizeImage(override.image) || product.image;
    return {
      ...product,
      name: String(override.name || product.name || "").trim(),
      price: override.price === null || override.price === undefined || override.price === "" ? product.price : Number(override.price),
      currency: String(override.currency || product.currency || "USD").trim().toUpperCase(),
      description: String(override.description || product.description || "").trim(),
      image,
      images: unique([image, ...(product.images || []), ...customImages]),
      customImages,
      customImageItems,
      mockup3d: normalizeMockup3d(override.mockup3d || null),
      overrideUpdatedAt: override.updatedAt || ""
    };
  });
}

function normalizeImage(value = "") {
  const image = String(value || "").trim();
  if (!image) return "";
  if (/^https?:\/\//i.test(image) || /^assets\//i.test(image)) return image;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(image) && image.length <= 700000) return image;
  return "";
}

function normalizeImages(raw = []) {
  return normalizeImageItems(raw).map((item) => item.url);
}

function normalizeImageItems(raw = []) {
  const values = Array.isArray(raw) ? raw : String(raw || "").split(/\r?\n|,/);
  const items = values
    .map((item) => {
      if (item && typeof item === "object") {
        const url = normalizeImage(item.url || item.dataUrl || item.value || "");
        if (!url) return null;
        return {
          url,
          name: String(item.name || imageDisplayName(url)).trim().slice(0, 140),
          type: String(item.type || "").trim().slice(0, 80)
        };
      }
      const url = normalizeImage(item);
      return url ? { url, name: imageDisplayName(url), type: "" } : null;
    })
    .filter(Boolean);
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  }).slice(0, 12);
}

function imageDisplayName(url = "") {
  if (!url) return "Custom image";

  if (url.startsWith("data:")) {
    return "Uploaded custom image";
  }

  // ✅ Only parse as URL if it's actually a full URL
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      return decodeURIComponent(
        new URL(url).pathname.split("/").filter(Boolean).pop()
      ) || "Custom image";
    } catch {
      return "Custom image";
    }
  }

  // ✅ Handle normal strings safely (like filenames, zip codes, etc.)
  return url.split("/").pop() || "Custom image";
}

function normalizeMockup3d(raw = null) {
  if (!raw || typeof raw !== "object") return null;
  const url = normalizeMockupUrl(raw.url || raw.dataUrl || "");
  if (!url) return null;
  return {
    url,
    name: String(raw.name || "ECI 3D mockup").trim().slice(0, 140),
    type: String(raw.type || "").trim().slice(0, 100),
    updatedAt: raw.updatedAt || ""
  };
}

function normalizeMockupUrl(value = "") {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || /^assets\//i.test(url)) return url;
  if (/^data:(model\/gltf-binary|model\/gltf\+json|model\/vnd\.usdz\+zip|application\/octet-stream|application\/zip|);base64,/i.test(url) && url.length <= 3_500_000) return url;
  return "";
}

function normalizeProductOverride(body = {}, existing = {}) {
  const rawPrice = body.price === "" || body.price === null || body.price === undefined ? existing.price : Number(body.price);
  const mockup3d = normalizeMockup3d(body.mockup3d || existing.mockup3d || null);
  return {
    ...existing,
    name: String(body.name || existing.name || "").trim().slice(0, 120),
    price: Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : existing.price,
    currency: String(body.currency || existing.currency || "").trim().toUpperCase().slice(0, 3),
    description: String(body.description || "").trim().slice(0, 1200),
    image: normalizeImage(body.image) || "",
    customImages: normalizeImageItems(body.customImages || []),
    mockup3d: mockup3d ? { ...mockup3d, updatedAt: new Date().toISOString() } : null,
    updatedAt: new Date().toISOString()
  };
}

async function routeApi(req, res, pathname) {
  try {
    if (req.method === "GET" && pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        printfulConfigured: Boolean(PRINTFUL_TOKEN),
        autoConfirm: PRINTFUL_AUTO_CONFIRM,
        stripeConfigured: Boolean(STRIPE_SECRET_KEY),
        stripePublishableConfigured: Boolean(STRIPE_PUBLISHABLE_KEY),
        stripeWebhookConfigured: Boolean(STRIPE_WEBHOOK_SECRET),
        fileDbWrites: FILE_DB_WRITES,
        siteUrl: SITE_URL
      });
    }

    if (req.method === "GET" && pathname === "/api/stripe/test") {
      try {
        const stripe = Stripe(STRIPE_SECRET_KEY);
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer_email: "test@example.com",
          line_items: [
            {
              price_data: {
                currency: "usd",
                product_data: {
                  name: "Test Product"
                },
                unit_amount: 1000
              },
              quantity: 1
            }
          ],
          success_url: `${SITE_URL || getRequestOrigin(req)}/?test=success`,
          cancel_url: `${SITE_URL || getRequestOrigin(req)}/?test=cancel`
        });
        return json(res, 200, {
          success: true,
          sessionId: session.id,
          url: session.url,
          hasUrl: Boolean(session.url),
          sessionKeys: Object.keys(session)
        });
      } catch (error) {
        return json(res, 400, {
          success: false,
          error: error.message,
          stack: error.stack
        });
      }
    }

    if (req.method === "POST" && pathname === "/api/stripe/test-checkout") {
      try {
        const active = requireUser(req, res);
        if (!active) return;
        
        const body = await parseBody(req);
        const testOrder = {
          id: randomBytes(12).toString("hex"),
          userId: active.user.id,
          recipient: {
            name: "Test User",
            email: "test@example.com",
            address1: "123 Test St",
            city: "Test City",
            country_code: "US",
            zip: "12345"
          },
          items: [
            { productId: "test", name: "Test Item", price: 29.99, quantity: 1, currency: "USD" }
          ],
          discount: { subtotal: 29.99, discountAmount: 0, total: 29.99, currency: "USD" },
          customOrder: {},
          total: 29.99,
          currency: "USD",
          status: "pending_payment",
          createdAt: new Date().toISOString()
        };
        
        const session = await createStripeCheckoutSession(req, testOrder);
        return json(res, 200, {
          success: true,
          testOrder,
          session: {
            id: session.id,
            url: session.url,
            hasUrl: Boolean(session.url),
            paymentStatus: session.payment_status
          }
        });
      } catch (error) {
        return json(res, 400, {
          success: false,
          error: error.message,
          errorDetails: {
            name: error.name,
            code: error.code,
            type: error.type
          }
        });
      }
    }

    if (req.method === "POST" && pathname === "/api/stripe/webhook") {
      const rawBody = await parseRawBody(req);
      verifyStripeSignature(rawBody, req.headers["stripe-signature"]);
      const event = JSON.parse(rawBody);
      await handleStripeEvent(event);
      return json(res, 200, { received: true });
    }

    if (req.method === "GET" && pathname === "/api/admin/debug-db") {
      const active = requireAdmin(req, res);
      if (!active) return;
      return json(res, 200, { 
        memoryUsers: active.db.users.length, 
        fileUsers: JSON.parse(readFileSync(dbPath, "utf8")).users.length,
        memoryDb: active.db
      });
    }

    if (req.method === "POST" && pathname === "/api/auth/signup") {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      console.log("Signup attempt:", { name, email, passwordLength: password.length });
      
      if (!name || !email.includes("@") || password.length < 8) {
        return json(res, 400, { error: "Use a name, valid email, and password with at least 8 characters." });
      }
      const db = readDb();
      if (db.users.some((user) => user.email === email)) {
        return json(res, 409, { error: "An account already exists for that email." });
      }
      const user = {
        id: randomBytes(12).toString("hex"),
        name,
        email,
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString(),
        ...(ADMIN_EMAILS.has(email) ? { role: "admin" } : {})
      };
      db.users.push(user);
      const success = writeDb(db);
      console.log("Signup success:", { email, persisted: success, totalUsers: db.users.length });
      return json(res, 201, { user: publicUser(user) }, { "Set-Cookie": makeCookie(user) });
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const db = readDb();
      
      console.log("Login attempt:", { email, usersCount: db.users.length });
      
      const user = db.users.find((item) => item.email === email);
      
      if (!user) {
        console.warn("Login failed: user not found in DB", { email, availableEmails: db.users.map(u => u.email) });
        return json(res, 401, { error: "Email or password is incorrect." });
      }
      
      const passwordValid = verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        console.warn("Login failed: password hash mismatch for", email);
        return json(res, 401, { error: "Email or password is incorrect." });
      }
      
      console.log("Login success:", email);
      return json(res, 200, { user: publicUser(user) }, { "Set-Cookie": makeCookie(user) });
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      return json(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
    }

    if (req.method === "GET" && pathname === "/api/auth/me") {
      const active = getSession(req);
      return json(res, 200, { user: active ? publicUser(active.user) : null });
    }

    if (req.method === "GET" && pathname === "/api/products") {
      const db = readDb();
      const products = await getProducts();
      return json(res, 200, { ...products, popupConfig: db.popupConfig });
    }

    if (req.method === "GET" && pathname.startsWith("/api/products/")) {
      const productId = decodeURIComponent(pathname.split("/").pop());
      const product = await getProduct(productId);
      if (!product) return json(res, 404, { error: "Product not found." });
      return json(res, 200, { product });
    }

    if (req.method === "POST" && pathname === "/api/discounts/preview") {
      const body = await parseBody(req);
      const items = normalizeItems(body.items);
      const discount = applyDiscount(items, String(body.discountCode || "").trim(), readDb());
      return json(res, 200, { discount, valid: Boolean(discount.code) });
    }

    if (req.method === "POST" && pathname === "/api/checkout/session") {
      const active = requireUser(req, res);
      if (!active) return;
      const body = await parseBody(req);
      const recipient = normalizeRecipient(body.recipient);
      const items = normalizeItems(body.items);
      if (!recipient || !items.length) {
        return json(res, 400, { error: "Complete the custom order form and add at least one cart item." });
      }
      const discount = applyDiscount(items, String(body.discountCode || "").trim(), active.db);
      if (discount.total <= 0) {
        return json(res, 400, { error: "Cart total must be greater than 0. Please ensure all items have valid pricing." });
      }
      const customOrder = normalizeCustomOrder(body.customOrder);
      const localOrder = createLocalOrder({ user: active.user, recipient, items, discount, customOrder });
      const session = await createStripeCheckoutSession(req, localOrder);
      localOrder.stripe = {
        sessionId: session.id,
        url: session.url,
        paymentStatus: session.payment_status || "unpaid",
        createdAt: new Date().toISOString()
      };
      active.db.orders.push(localOrder);
      writeDb(active.db);
      return json(res, 201, { order: localOrder, checkoutUrl: session.url, sessionId: session.id });
    }

    if (req.method === "GET" && pathname === "/api/checkout/verify") {
      const sessionId = url.searchParams.get("sessionId");
      const orderId = url.searchParams.get("orderId");
      const db = readDb();
      
      let finalSessionId = sessionId;
      if (!finalSessionId && orderId) {
        const order = db.orders.find(o => o.id === orderId);
        finalSessionId = order?.stripe?.sessionId;
      }
      
      if (!finalSessionId) return json(res, 400, { error: "Missing session identification" });
      
      const stripe = Stripe(STRIPE_SECRET_KEY.trim().replace(/[^\x20-\x7E]/g, ""));
      const session = await stripe.checkout.sessions.retrieve(finalSessionId);
      
      if (session.payment_status === "paid") {
        const order = await finalizePaidOrder(session, db);
        return json(res, 200, { ok: true, order });
      }
      
      return json(res, 200, { ok: false, status: session.payment_status });
    }

    if (req.method === "POST" && pathname === "/api/orders") {
      return json(res, 409, { error: "Use the custom order form to create a Stripe Checkout session before fulfillment." });
    }

    if (req.method === "GET" && pathname === "/api/orders") {
      const active = requireUser(req, res);
      if (!active) return;
      
      const userEmail = String(active.user.email || "").toLowerCase();

      // Match by userId OR by recipient email (for metadata reconstruction cases)
      const userOrders = active.db.orders.filter((order) => {
        return order.userId === active.user.id || 
               String(order.recipient?.email || "").toLowerCase() === userEmail;
      });

      // Sync and map
      await Promise.all(userOrders.slice(-5).map(order => {
        if (order.printfulOrder?.id) return syncOrderWithPrintful(order);
        return Promise.resolve();
      }));
      
      const orders = userOrders.slice().reverse().map(order => ({
        ...order,
        statusLabel: mapOrderStatus(order.status, false)
      }));
      
      return json(res, 200, { orders });
    }

    if (req.method === "POST" && pathname === "/api/contact") {
      const body = await parseBody(req);
      const db = readDb();
      const message = {
        id: crypto.randomUUID(),
        name: String(body.name || "Anonymous").trim(),
        email: String(body.email || "").trim(),
        subject: String(body.subject || "No Subject").trim(),
        text: String(body.message || "").trim(),
        createdAt: new Date().toISOString(),
        read: false
      };
      if (!message.email || !message.text) return json(res, 400, { error: "Email and message are required." });
      db.messages.push(message);
      writeDb(db);
      return json(res, 201, { success: true });
    }

    if (pathname.startsWith("/api/admin/")) {
      return await routeAdmin(req, res, pathname);
    }

    return json(res, 404, { error: "API route not found." });
  } catch (error) {
    return json(res, 500, { error: error.message || "Server error" });
  }
}

function normalizeRecipient(raw = {}) {
  const country = normalizeCountry(raw.country_code || raw.country);
  const recipient = {
    name: String(raw.name || "").trim(),
    email: String(raw.email || "").trim(),
    phone: String(raw.phone || "").trim(),
    address1: String(raw.address1 || "").trim(),
    city: String(raw.city || "").trim(),
    state_code: String(raw.state_code || "").trim().toUpperCase(),
    country_code: country,
    zip: String(raw.zip || "").trim()
  };
  if (!recipient.phone) delete recipient.phone;
  if (!["US", "CA", "AU"].includes(recipient.country_code)) delete recipient.state_code;
  return recipient.name && recipient.email.includes("@") && recipient.address1 && recipient.city && recipient.country_code && recipient.zip ? recipient : null;
}

function normalizeCountry(value = "US") {
  const raw = String(value || "US").trim().toUpperCase();
  const aliases = {
    UK: "GB",
    "U.K.": "GB",
    "UNITED KINGDOM": "GB",
    ENGLAND: "GB",
    SCOTLAND: "GB",
    WALES: "GB",
    USA: "US",
    "UNITED STATES": "US"
  };
  return aliases[raw] || raw;
}

function applyDiscount(items, code, db) {
  const subtotal = items.reduce((sum, item) => sum + (Number(item.price || 0) * item.quantity), 0);
  const currency = items.find((item) => item.currency)?.currency || "USD";
  const match = db.discountCodes.find((discount) => discount.code.toLowerCase() === code.toLowerCase() && discount.active !== false);
  if (!match || !subtotal) {
    return { code: "", type: "", value: 0, subtotal, discountAmount: 0, total: subtotal, currency };
  }
  const rawAmount = match.type === "fixed" ? Number(match.value) : subtotal * (Number(match.value) / 100);
  const discountAmount = Math.max(0, Math.min(subtotal, rawAmount));
  return { code: match.code, type: match.type, value: match.value, subtotal, discountAmount, total: subtotal - discountAmount, currency };
}

function normalizeItems(raw = []) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const quantity = Number(item.quantity || 1);
      return {
        productId: String(item.productId || "").trim(),
        quantity: Math.max(1, Math.min(20, Number.isFinite(quantity) ? quantity : 1)),
        printfulVariantId: String(item.printfulVariantId || "").trim(),
        name: String(item.name || item.productId || "Product").trim(),
        price: Number(item.price || 0),
        currency: String(item.currency || "USD").trim().toUpperCase(),
        customImages: Array.isArray(item.customImages) ? item.customImages : []
      };
    })
    .filter(Boolean)
    .filter((item) => item.productId);
}

function normalizeCustomOrder(raw = {}) {
  return {
    sizeNotes: String(raw.sizeNotes || raw.size_notes || "").trim().slice(0, 500),
    designNotes: String(raw.designNotes || raw.design_notes || "").trim().slice(0, 1000),
    requestedDeadline: String(raw.requestedDeadline || raw.requested_deadline || "").trim().slice(0, 80)
  };
}

function createLocalOrder({ user, recipient, items, discount, customOrder, status = "pending_payment" }) {
  return {
    id: randomBytes(12).toString("hex"),
    userId: user.id,
    recipient,
    customOrder,
    items,
    discount,
    subtotal: discount.subtotal,
    discountAmount: discount.discountAmount,
    total: discount.total,
    currency: discount.currency,
    status,
    createdAt: new Date().toISOString()
  };
}

function stripeAmount(value) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function getRequestOrigin(req) {
  // Use the same nuclear cleaning logic for consistency
  const clean = (val) => String(val || "").replace(/[^\x20-\x7E]/g, "").trim();
  const rawSiteUrl = clean(SITE_URL);
  
  if (rawSiteUrl && rawSiteUrl.startsWith("http")) {
    try {
      return new URL(rawSiteUrl).origin;
    } catch (e) {
      // If it's still broken, fall through to auto-detection
    }
  }

  const proto = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function orderMetadata(order) {
  const payload = JSON.stringify({
    id: order.id,
    userId: order.userId,
    recipient: order.recipient,
    customOrder: order.customOrder,
    items: order.items,
    discount: order.discount,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    total: order.total,
    currency: order.currency,
    createdAt: order.createdAt
  });
  const metadata = {
    brand: "Emmanuel CI Universe",
    orderId: order.id,
    userId: order.userId,
    customerEmail: order.recipient.email,
    itemCount: String(order.items.reduce((sum, item) => sum + item.quantity, 0)),
    currency: order.currency,
    total: String(order.total)
  };
  const chunks = payload.match(/.{1,450}/g) || [];
  chunks.slice(0, 40).forEach((chunk, index) => {
    metadata[`orderPayload${index}`] = chunk;
  });
  metadata.orderPayloadChunks = String(Math.min(chunks.length, 40));
  return metadata;
}

function orderFromMetadata(metadata = {}) {
  const chunkCount = Number(metadata.orderPayloadChunks || 0);
  const chunks = Array.from({ length: chunkCount }, (_, index) => metadata[`orderPayload${index}`] || "").join("");
  if (!chunks) return null;
  try {
    const parsed = JSON.parse(chunks);
    return {
      id: parsed.id || metadata.orderId || randomBytes(12).toString("hex"),
      userId: parsed.userId || metadata.userId || "stripe-metadata",
      recipient: parsed.recipient,
      customOrder: parsed.customOrder || {},
      items: parsed.items || [],
      discount: parsed.discount || {},
      subtotal: Number(parsed.subtotal || 0),
      discountAmount: Number(parsed.discountAmount || 0),
      total: Number(parsed.total || 0),
      currency: String(parsed.currency || "USD").toUpperCase(),
      status: "paid_from_stripe_metadata",
      createdAt: parsed.createdAt || new Date().toISOString()
    };
  } catch {
    return null;
  }
}



async function createStripeCheckoutSession(req, order) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("Stripe secret key is not configured on the server.");
  }

  const stripe = Stripe(STRIPE_SECRET_KEY.trim().replace(/[^\x20-\x7E]/g, ""));

  const amount = stripeAmount(order.total);
  if (amount <= 0) {
    throw new Error("Stripe requires an order total greater than zero.");
  }

  // NUCLEAR CLEANUP: Remove ANY non-printable or invisible characters
  const clean = (val) => String(val || "").replace(/[^\x20-\x7E]/g, "").trim();
  
  // Determine base origin: 
  // If request is from localhost, use that. Otherwise use SITE_URL.
  const reqOrigin = getRequestOrigin(req);
  let baseOrigin = reqOrigin;
  
  if (!reqOrigin.includes("localhost") && !reqOrigin.includes("127.0.0.1")) {
    try {
      const rawSiteUrl = clean(SITE_URL);
      if (rawSiteUrl && rawSiteUrl.startsWith("http")) {
        const parsed = new URL(rawSiteUrl);
        baseOrigin = parsed.origin;
      }
    } catch (e) {
      console.warn("SITE_URL is malformed, using request origin");
    }
  }

  try {
    // Final safety check: ensure baseOrigin is a valid URL string for the constructor
    const successUrl = new URL("/", baseOrigin);
    successUrl.searchParams.set("payment", "success");
    successUrl.searchParams.set("order", order.id);
    successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");

    const cancelUrl = new URL("/", baseOrigin);
    cancelUrl.searchParams.set("payment", "cancelled");
    cancelUrl.searchParams.set("order", order.id);
    
    console.log("Stripe Checkout Ready:", { 
      success: successUrl.toString(), 
      cancel: cancelUrl.toString() 
    });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: order.recipient.email,
      client_reference_id: order.id,
      metadata: orderMetadata(order),

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

      success_url: successUrl.toString(),
      cancel_url: cancelUrl.toString()
    });

    if (!session.url) {
      throw new Error("Stripe session was created but checkout URL is missing.");
    }

    return session;
  } catch (error) {
    console.error("STRIPE SESSION ERROR:", {
      message: error.message,
      type: error.type,
      code: error.code,
      param: error.param,
      detail: error.raw || error
    });
    
    // Throw the raw error so the user can see the exact Stripe message
    throw error;
  }
}

function verifyStripeSignature(rawBody, signatureHeader) {
  if (!STRIPE_WEBHOOK_SECRET) throw new Error("Stripe webhook secret is not configured.");
  const parts = Object.fromEntries(
    String(signatureHeader || "")
      .split(",")
      .map((part) => part.split("="))
      .filter((part) => part.length === 2)
  );
  if (!parts.t || !parts.v1) throw new Error("Missing Stripe signature.");
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (age > 300) throw new Error("Stripe webhook timestamp is outside tolerance.");
  const expected = createHmac("sha256", STRIPE_WEBHOOK_SECRET).update(`${parts.t}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const signatureBuffer = Buffer.from(parts.v1, "hex");
  if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
    throw new Error("Stripe webhook signature verification failed.");
  }
}

async function submitOrderToPrintful(order) {
  if (!PRINTFUL_TOKEN) {
    order.status = "paid_pending_printful_configuration";
    console.warn(`Printful token missing for order ${order.id}`);
    return order;
  }
  if (order.printfulOrder?.id) return order;
  
  console.log(`Submitting order ${order.id} to Printful...`);

  // Back to Manual Draft Mode: change to true if you want auto-production
  const shouldConfirm = String(process.env.PRINTFUL_AUTO_CONFIRM).toLowerCase() === "true"; 
  const query = shouldConfirm ? "?confirm=1" : "?confirm=0";
  
  const printfulItems = await Promise.all(order.items.map(async (item) => {
    // 1. Try ID from the order item itself (if it was a synced product)
    let syncVariantId = item.printfulVariantId;
    
    // 2. Try the localProducts mapping or direct .env variable
    if (!syncVariantId) {
      const product = localProducts.find((p) => p.id === item.productId || p.name === item.name);
      syncVariantId = product?.printfulVariantId || process.env[`PRINTFUL_VARIANT_${item.productId}`] || process.env[`PRINTFUL_VARIANT_${item.id}`];
    }
    
    // 3. SUPER-AGGRESSIVE SEARCH: If still missing, look through synced products with fallback logic
    if (!syncVariantId) {
      console.log(`Aggressive Search in Printful for: "${item.name}" (Product ID: ${item.productId})`);
      const synced = await getProducts();
      
      // Stage A: Exact name match
      let match = synced.products.find(p => p.name === item.name);
      
      // Stage B: Fuzzy name match (case insensitive)
      if (!match) {
        match = synced.products.find(p => p.name.toLowerCase().includes(item.name.toLowerCase()) || 
                                         item.name.toLowerCase().includes(p.name.toLowerCase()));
      }
      
      // Stage C: Keyword match (e.g., find ANY hoodie if name is 'ECI Hoodie')
      if (!match) {
        const keywords = item.name.toLowerCase().split(" ").filter(k => k.length > 3);
        match = synced.products.find(p => {
          const pName = p.name.toLowerCase();
          return keywords.some(k => pName.includes(k));
        });
      }

      syncVariantId = match?.printfulVariantId || match?.variants?.[0]?.id;
    }

    if (!syncVariantId) {
      console.error(`FAILED to find Printful Variant for item: "${item.name}"`);
      throw new Error(`Variant ID missing for "${item.name}". Please ensure this product is synced in Printful and has a matching name.`);
    }
    
    console.log(`Found Variant ID ${syncVariantId} for item "${item.name}"`);

    const files = [];
    // If there are custom images (from the 3D builder or upload), send them to Printful
    if (Array.isArray(item.customImages) && item.customImages.length > 0) {
      item.customImages.forEach(imgUrl => {
        if (imgUrl.startsWith("http")) {
          files.push({ type: "default", url: imgUrl });
        }
      });
    }

    return { 
      sync_variant_id: Number(syncVariantId), 
      quantity: item.quantity,
      files: files.length > 0 ? files : undefined
    };
  }));

  try {
    const payload = await printful(`/orders${query}`, {
      method: "POST",
      body: JSON.stringify({
        external_id: order.id,
        recipient: order.recipient,
        items: printfulItems,
        notes: formatOrderNotes(order)
      })
    });
    
    order.status = shouldConfirm ? "submitted_to_printful" : "draft_in_printful";
    order.printfulOrder = payload.result;
    order.fulfilledAt = new Date().toISOString();
    console.log(`Order ${order.id} pushed to Printful: ${payload.result?.id}`);
    return order;
  } catch (error) {
    console.error(`Printful API Error for order ${order.id}:`, error.message);
    throw error;
  }
}

function formatOrderNotes(order) {
  const notes = [];
  if (order.customOrder?.sizeNotes) notes.push(`Size/fit: ${order.customOrder.sizeNotes}`);
  if (order.customOrder?.designNotes) notes.push(`Custom details: ${order.customOrder.designNotes}`);
  if (order.customOrder?.requestedDeadline) notes.push(`Requested deadline: ${order.customOrder.requestedDeadline}`);
  notes.push(`Stripe order: ${order.stripe?.sessionId || order.id}`);
  return notes.join("\n");
}

async function syncOrderWithPrintful(order) {
  if (!PRINTFUL_TOKEN || !order.printfulOrder?.id) return order;
  try {
    const payload = await printful(`/orders/${order.printfulOrder.id}`);
    const result = payload.result;
    if (result) {
      order.printfulOrder = result;
      if (result.status === "fulfilled" || result.status === "shipped") {
        order.status = "shipped";
      } else if (result.status === "failed" || result.status === "canceled") {
        order.status = "problem";
      }
      // Extract tracking if available
      const shipment = result.shipments?.[0];
      if (shipment) {
        order.tracking = {
          number: shipment.tracking_number,
          url: shipment.tracking_url,
          carrier: shipment.carrier,
          shippedAt: shipment.ship_date
        };
      }
    }
  } catch (error) {
    console.warn(`Could not sync order ${order.id} with Printful: ${error.message}`);
  }
  return order;
}

// SHARED Logic to finalize a paid order
async function finalizePaidOrder(session, db) {
  let order = db.orders.find((item) => item.id === session.client_reference_id || item.stripe?.sessionId === session.id);
  
  if (!order) {
    order = orderFromMetadata(session.metadata);
    if (!order) {
      console.error("ERROR: Could not reconstruct order from metadata", session.id);
      return null;
    }
    db.orders.push(order);
  }

  // Already processed?
  if (order.status === "paid" || order.printfulOrder?.id) {
    return order;
  }

  // Update status
  order.status = "paid";
  order.stripe = {
    ...order.stripe,
    sessionId: session.id,
    paymentIntent: session.payment_intent || "",
    paymentStatus: session.payment_status || "paid",
    amountTotal: Number(session.amount_total || 0) / 100,
    currency: String(session.currency || order.currency || "USD").toUpperCase(),
    paidAt: new Date().toISOString()
  };
  
  writeDb(db);
  console.log("Finalized Order as PAID:", order.id);

  // AUTOMATIC SYNC: Push to Printful
  try {
    await submitOrderToPrintful(order);
    writeDb(db);
    console.log("SUCCESS: Order pushed to Printful automatically:", order.id);
  } catch (error) {
    console.error("PRINTFUL AUTO-SYNC FAILED:", error.message);
  }
  
  return order;
}

async function handleStripeEvent(event) {
  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(event.type)) return;
  const session = event.data?.object || {};
  const db = readDb();
  await finalizePaidOrder(session, db);
}

async function routeAdmin(req, res, pathname) {
  const active = requireAdmin(req, res);
  if (!active) return;
  const db = active.db;

  if (req.method === "GET" && pathname === "/api/admin/overview") {
    const users = db.users.map((user) => ({
      ...publicUser(user),
      orderCount: db.orders.filter((order) => order.userId === user.id).length
    }));
    
    // Sync all pending/recent orders for the admin
    const recentOrders = db.orders.filter(o => o.status !== "shipped" && o.status !== "cancelled").slice(-20);
    await Promise.all(recentOrders.map(order => syncOrderWithPrintful(order)));
    
    const orders = db.orders.slice().reverse().map(order => ({
      ...order,
      statusLabel: mapOrderStatus(order.status, true)
    }));
    
    const revenue = db.orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const products = await getProducts();
    return json(res, 200, {
      analytics: {
        users: db.users.length,
        orders: db.orders.length,
        products: products.products.length,
        revenue,
        currency: db.orders.find((order) => order.currency)?.currency || "GBP",
        totalVisits: db.analytics.totalVisits,
        referrers: db.analytics.referrers,
        liveUsers: liveUsers.size
      },
      users,
      orders,
      discountCodes: db.discountCodes,
      hiddenProducts: db.hiddenProducts,
      productOverrides: db.productOverrides,
      popupConfig: db.popupConfig,
      messages: db.messages.slice().reverse(),
      productSource: products.source,
      productWarning: products.warning || "",
      printfulConnected: Boolean(products.connected),
      products: products.products
    });
  }

  if (req.method === "POST" && pathname === "/api/admin/products/sync-printful") {
    productCache = { expiresAt: 0, products: null, source: "", connected: false, warning: "" };
    const products = await getProducts();
    return json(res, 200, { source: products.source, products: products.products });
  }

  if (req.method === "POST" && pathname === "/api/admin/discounts") {
    const body = await parseBody(req);
    const code = String(body.code || "").trim().toUpperCase();
    const type = String(body.type || "percent").trim() === "fixed" ? "fixed" : "percent";
    const value = Math.max(0, Number(body.value || 0));
    if (!code || !value) return json(res, 400, { error: "Discount code and value are required." });
    db.discountCodes = db.discountCodes.filter((discount) => discount.code !== code);
    db.discountCodes.push({
      code,
      type,
      value,
      active: true,
      isGiftCard: Boolean(body.isGiftCard),
      recipientEmail: String(body.recipientEmail || "").trim(),
      message: String(body.message || "").trim(),
      createdAt: new Date().toISOString()
    });
    writeDb(db);
    return json(res, 201, { discountCodes: db.discountCodes });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/admin/discounts/")) {
    const code = decodeURIComponent(pathname.split("/").pop()).toUpperCase();
    db.discountCodes = db.discountCodes.filter((discount) => discount.code !== code);
    writeDb(db);
    return json(res, 200, { discountCodes: db.discountCodes });
  }

  if (req.method === "PUT" && pathname.startsWith("/api/admin/products/")) {
    const productId = decodeURIComponent(pathname.replace("/api/admin/products/", ""));
    const body = await parseBody(req);
    db.productOverrides[productId] = normalizeProductOverride(body, db.productOverrides[productId]);
    productCache = { ...productCache, expiresAt: 0 };
    writeDb(db);
    const product = await getProduct(productId);
    return json(res, 200, { product, productOverrides: db.productOverrides });
  }

  if (req.method === "POST" && pathname.startsWith("/api/admin/products/") && pathname.endsWith("/restore")) {
    const productId = decodeURIComponent(pathname.replace("/api/admin/products/", "").replace(/\/restore$/, ""));
    db.hiddenProducts = db.hiddenProducts.filter((id) => id !== productId);
    writeDb(db);
    return json(res, 200, { hiddenProducts: db.hiddenProducts });
  }

  if (req.method === "DELETE" && pathname.startsWith("/api/admin/products/")) {
    const productId = decodeURIComponent(pathname.split("/").pop());
    if (!db.hiddenProducts.includes(productId)) db.hiddenProducts.push(productId);
    productCache = { expiresAt: 0, products: null, source: "", connected: false, warning: "" };
    writeDb(db);
    return json(res, 200, { hiddenProducts: db.hiddenProducts });
  }

  if (req.method === "POST" && pathname === "/api/admin/popup-config") {
    const body = await parseBody(req);
    db.popupConfig = {
      enabled: Boolean(body.enabled),
      title: String(body.title || "").trim().slice(0, 100),
      text: String(body.text || "").trim().slice(0, 200),
      code: String(body.code || "").trim().toUpperCase().slice(0, 20),
      targetProductId: String(body.targetProductId || "").trim()
    };
    writeDb(db);
    return json(res, 200, { popupConfig: db.popupConfig });
  }

  if (req.method === "GET" && pathname === "/api/admin/diagnostics") {
    const status = {
      stripe: { ok: false, message: "Not configured" },
      printful: { ok: false, message: "Not configured", storeName: "" },
      database: { ok: true, orders: db.orders.length, users: db.users.length },
      ready: false
    };

    if (STRIPE_SECRET_KEY) {
      try {
        const stripe = Stripe(STRIPE_SECRET_KEY);
        await stripe.balance.retrieve(); // Quick ping
        status.stripe = { ok: true, message: "Connected & Ready" };
      } catch (e) {
        status.stripe = { ok: false, message: e.message };
      }
    }

    if (PRINTFUL_TOKEN) {
      try {
        const response = await printful("/stores");
        const store = response.result?.[0];
        if (store) {
          status.printful = { ok: true, message: "Connected", storeName: store.name };
        } else {
          status.printful = { ok: false, message: "Token valid, but no store found" };
        }
      } catch (e) {
        status.printful = { ok: false, message: e.message };
      }
    }

    status.ready = status.stripe.ok && status.printful.ok;
    return json(res, 200, status);
  }

  if (req.method === "POST" && pathname.startsWith("/api/admin/orders/") && pathname.endsWith("/push-printful")) {
    const orderId = pathname.replace("/api/admin/orders/", "").replace("/push-printful", "");
    const order = db.orders.find(o => o.id === orderId);
    
    if (!order) return json(res, 404, { error: "Order not found" });
    
    console.log(`ADMIN MANUAL PUSH: Attempting to push order ${orderId} to Printful...`);
    
    try {
      // Force status update if it was stuck
      if (order.status === "pending_payment") {
        console.warn(`ADMIN WARNING: Pushing order ${orderId} despite PENDING_PAYMENT status.`);
      }
      
      await submitOrderToPrintful(order);
      writeDb(db);
      
      console.log(`ADMIN MANUAL PUSH SUCCESS: Order ${orderId} is now in Printful (ID: ${order.printfulOrder?.id})`);
      return json(res, 200, { success: true, order });
    } catch (e) {
      console.error(`ADMIN MANUAL PUSH FAILED for order ${orderId}:`, e.message);
      return json(res, 500, { error: `Printful Error: ${e.message}` });
    }
  }
  
  return json(res, 404, { error: "Admin route not found" });
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" || pathname.startsWith("/product/") ? "/index.html" : pathname;
  if (requested.startsWith("/data/") || requested === "/.env" || requested === "/.env.example") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const safePath = normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = resolve(root, `.${safePath}`);
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": mime[extname(filePath).toLowerCase()] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
}

const liveUsers = new Map();

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  
  // Basic Analytics & Live Users
  if (!url.pathname.startsWith("/api/")) {
    const db = readDb();
    db.analytics.totalVisits++;
    const ref = req.headers.referer || "Direct";
    db.analytics.referrers[ref] = (db.analytics.referrers[ref] || 0) + 1;
    writeDb(db);
  }

  // Heartbeat for live users
  const sessionToken = getCookie(req, "session") || req.socket.remoteAddress;
  liveUsers.set(sessionToken, Date.now());
  
  // Cleanup old heartbeats
  for (const [token, time] of liveUsers.entries()) {
    if (Date.now() - time > 60000) liveUsers.delete(token);
  }

  if (url.pathname.startsWith("/api/")) {
    await routeApi(req, res, url.pathname);
    return;
  }
  serveStatic(req, res, url.pathname);
}

// Vercel serverless function export
export default handleRequest;

// Local development server
if (!process.env.VERCEL) {
  createServer(handleRequest).listen(PORT, () => {
    console.log(`Emmanuel CI Universe running at http://localhost:${PORT}`);
    console.log(`Stripe integration: ${STRIPE_SECRET_KEY ? "configured" : "waiting for STRIPE_SECRET_KEY"}`);
    console.log(`Printful integration: ${PRINTFUL_TOKEN ? "configured" : "waiting for PRINTFUL_TOKEN"}`);
  });
}
