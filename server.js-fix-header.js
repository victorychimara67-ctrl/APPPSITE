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

// --- Configuration Constants ---
const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = (process.env.SESSION_SECRET || "dev-secret-change-me").trim();
const FILE_DB_WRITES = String(process.env.FILE_DB_WRITES || (process.env.VERCEL ? "false" : "true")).toLowerCase().trim() === "true";
const PRINTFUL_TOKEN = (process.env.PRINTFUL_TOKEN || "").trim();
const PRINTFUL_STORE_ID = (process.env.PRINTFUL_STORE_ID || "").trim();
const PRINTFUL_AUTO_CONFIRM = String(process.env.PRINTFUL_AUTO_CONFIRM || "false").toLowerCase().trim() === "true";
const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || "").trim();
const STRIPE_PUBLISHABLE_KEY = (process.env.STRIPE_PUBLISHABLE_KEY || "").trim();
const STRIPE_WEBHOOK_SECRET = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();
const SITE_URL = (process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "").trim().replace(/\/+$/, "");

const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "victorychimara67@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

// --- Self-Check on Startup ---
(function selfCheck() {
  console.log("ECI UNIVERSE: Starting Self-Check...");
  const checks = {
    PORT,
    DATA_DIR: existsSync(dataDir),
    DB_FILE: existsSync(dbPath),
    PRINTFUL: PRINTFUL_TOKEN.length > 10 ? "TOKEN OK" : "MISSING TOKEN",
    PRINTFUL_STORE: !!PRINTFUL_STORE_ID,
    STRIPE: !!STRIPE_SECRET_KEY,
    NODE_VERSION: process.version
  };
  console.table(checks);
  if (!checks.DATA_DIR) {
    console.warn("WARNING: data directory missing. Creating it now...");
    try { mkdirSync(dataDir, { recursive: true }); } catch(e) {}
  }
})();
