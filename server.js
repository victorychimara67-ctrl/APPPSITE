import { createHmac, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { createServer } from "node:http";
import { URL } from "node:url";

const root = process.cwd();
const dataDir = join(root, "data");
const dbPath = join(dataDir, "store.json");

loadEnv();
mkdirSync(dataDir, { recursive: true });

const PORT = Number(process.env.PORT || 3000);
const SESSION_SECRET = process.env.SESSION_SECRET || "dev-secret-change-me";
const PRINTFUL_TOKEN = process.env.PRINTFUL_TOKEN || "";
const PRINTFUL_STORE_ID = process.env.PRINTFUL_STORE_ID || "";
const PRINTFUL_AUTO_CONFIRM = String(process.env.PRINTFUL_AUTO_CONFIRM).toLowerCase() === "true";
const ADMIN_EMAILS = new Set(
  (process.env.ADMIN_EMAILS || "echimara98@gmail.com")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
);

const localProducts = [
  { id: "hoodie", name: "Essential Hoodie", price: 89.99, image: "assets/product-hoodie.png", printfulVariantId: process.env.PRINTFUL_VARIANT_hoodie || "" },
  { id: "tee", name: "Minimal Tee", price: 49.99, image: "assets/product-tee.png", printfulVariantId: process.env.PRINTFUL_VARIANT_tee || "" },
  { id: "jacket", name: "Puffer Jacket", price: 129.99, image: "assets/product-jacket.png", printfulVariantId: process.env.PRINTFUL_VARIANT_jacket || "" },
  { id: "cap", name: "Minimal Cap", price: 29.99, image: "assets/product-cap.png", printfulVariantId: process.env.PRINTFUL_VARIANT_cap || "" },
  { id: "pants", name: "Cargo Pants", price: 79.99, image: "assets/product-pants.png", printfulVariantId: process.env.PRINTFUL_VARIANT_pants || "" },
  { id: "sneakers", name: "Core Sneakers", price: 119.99, image: "assets/product-sneakers.png", printfulVariantId: process.env.PRINTFUL_VARIANT_sneakers || "" }
];

let productCache = { expiresAt: 0, products: null };

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
    const cleanKey = key.replace(/^\uFEFF/, "");
    if (!process.env[cleanKey]) process.env[cleanKey] = parts.join("=").trim();
  }
}

function readDb() {
  if (!existsSync(dbPath)) {
    writeFileSync(dbPath, JSON.stringify(emptyDb(), null, 2));
  }
  return migrateDb(JSON.parse(readFileSync(dbPath, "utf8")));
}

function writeDb(db) {
  writeFileSync(dbPath, JSON.stringify(db, null, 2));
}

function emptyDb() {
  return { users: [], sessions: [], orders: [], hiddenProducts: [], discountCodes: [] };
}

function migrateDb(db) {
  db.users ||= [];
  db.sessions ||= [];
  db.orders ||= [];
  db.hiddenProducts ||= [];
  db.discountCodes ||= [];
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
      if (raw.length > 1_000_000) {
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
  const candidate = hashPassword(password, salt).split(":")[1];
  return timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(candidate, "hex"));
}

function sign(value) {
  return createHmac("sha256", SESSION_SECRET).update(value).digest("hex");
}

function makeCookie(sessionId) {
  const value = `${sessionId}.${sign(sessionId)}`;
  return `session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 14}`;
}

function clearCookie() {
  return "session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
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
  if (!raw || !raw.includes(".")) return null;
  const [sessionId, signature] = raw.split(".");
  if (sign(sessionId) !== signature) return null;
  const db = readDb();
  const session = db.sessions.find((item) => item.id === sessionId && item.expiresAt > Date.now());
  if (!session) return null;
  const user = db.users.find((item) => item.id === session.userId);
  return user ? { db, user, session } : null;
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
  if (!PRINTFUL_TOKEN) return { source: "local", products: localProducts.filter((product) => !hidden.has(product.id)) };
  if (productCache.products && productCache.expiresAt > Date.now()) {
    return { source: "printful", products: productCache.products.filter((product) => !hidden.has(product.id)) };
  }

  const payload = await printful("/store/products?limit=100");
  const summaries = payload.result || [];
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
    products: products.length ? products : localProducts
  };
  return { source: products.length ? "printful" : "local", products: productCache.products };
}

async function getProduct(productId) {
  const { products } = await getProducts();
  return products.find((product) => product.id === productId) || null;
}

function mapPrintfulProduct(summary, detail) {
  const variants = detail?.sync_variants || [];
  const firstVariant = variants.find((variant) => variant.is_ignored === false) || variants[0];
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

async function routeApi(req, res, pathname) {
  try {
    if (req.method === "GET" && pathname === "/api/health") {
      return json(res, 200, { ok: true, printfulConfigured: Boolean(PRINTFUL_TOKEN), autoConfirm: PRINTFUL_AUTO_CONFIRM });
    }

    if (req.method === "POST" && pathname === "/api/auth/signup") {
      const body = await parseBody(req);
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!name || !email.includes("@") || password.length < 8) {
        return json(res, 400, { error: "Use a name, valid email, and password with at least 8 characters." });
      }
      const db = readDb();
      if (db.users.some((user) => user.email === email)) {
        return json(res, 409, { error: "An account already exists for that email." });
      }
      const user = { id: randomBytes(12).toString("hex"), name, email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
      const session = { id: randomBytes(24).toString("hex"), userId: user.id, expiresAt: Date.now() + 60 * 60 * 24 * 14 * 1000 };
      db.users.push(user);
      db.sessions.push(session);
      writeDb(db);
      return json(res, 201, { user: publicUser(user) }, { "Set-Cookie": makeCookie(session.id) });
    }

    if (req.method === "POST" && pathname === "/api/auth/login") {
      const body = await parseBody(req);
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      const db = readDb();
      const user = db.users.find((item) => item.email === email);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        return json(res, 401, { error: "Email or password is incorrect." });
      }
      const session = { id: randomBytes(24).toString("hex"), userId: user.id, expiresAt: Date.now() + 60 * 60 * 24 * 14 * 1000 };
      db.sessions.push(session);
      writeDb(db);
      return json(res, 200, { user: publicUser(user) }, { "Set-Cookie": makeCookie(session.id) });
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      const active = getSession(req);
      if (active) {
        active.db.sessions = active.db.sessions.filter((session) => session.id !== active.session.id);
        writeDb(active.db);
      }
      return json(res, 200, { ok: true }, { "Set-Cookie": clearCookie() });
    }

    if (req.method === "GET" && pathname === "/api/auth/me") {
      const active = getSession(req);
      return json(res, 200, { user: active ? publicUser(active.user) : null });
    }

    if (req.method === "GET" && pathname === "/api/products") {
      return json(res, 200, await getProducts());
    }

    if (req.method === "GET" && pathname.startsWith("/api/products/")) {
      const productId = decodeURIComponent(pathname.split("/").pop());
      const product = await getProduct(productId);
      if (!product) return json(res, 404, { error: "Product not found." });
      return json(res, 200, { product });
    }

    if (req.method === "POST" && pathname === "/api/orders") {
      const active = requireUser(req, res);
      if (!active) return;
      const body = await parseBody(req);
      const recipient = normalizeRecipient(body.recipient);
      const items = normalizeItems(body.items);
      if (!recipient || !items.length) {
        return json(res, 400, { error: "Recipient and at least one cart item are required." });
      }
      const discount = applyDiscount(items, String(body.discountCode || "").trim(), active.db);

      const localOrder = {
        id: randomBytes(12).toString("hex"),
        userId: active.user.id,
        recipient,
        items,
        discount,
        subtotal: discount.subtotal,
        discountAmount: discount.discountAmount,
        total: discount.total,
        currency: discount.currency,
        status: PRINTFUL_TOKEN ? "submitting_to_printful" : "pending_printful_configuration",
        createdAt: new Date().toISOString()
      };

      if (PRINTFUL_TOKEN) {
        const query = PRINTFUL_AUTO_CONFIRM ? "?confirm=1" : "?confirm=0";
        const printfulItems = items.map((item) => {
          const product = localProducts.find((candidate) => candidate.id === item.productId);
          const syncVariantId = item.printfulVariantId || product?.printfulVariantId;
          if (!syncVariantId) throw new Error(`Missing Printful sync variant ID for ${item.productId}. Add it to .env.`);
          return { sync_variant_id: Number(syncVariantId), quantity: item.quantity };
        });
        const payload = await printful(`/orders${query}`, {
          method: "POST",
          body: JSON.stringify({
            recipient,
            items: printfulItems
          })
        });
        localOrder.status = PRINTFUL_AUTO_CONFIRM ? "submitted_to_printful" : "draft_in_printful";
        localOrder.printfulOrder = payload.result;
      }

      active.db.orders.push(localOrder);
      writeDb(active.db);
      return json(res, 201, { order: localOrder });
    }

    if (req.method === "GET" && pathname === "/api/orders") {
      const active = requireUser(req, res);
      if (!active) return;
      const orders = active.db.orders.filter((order) => order.userId === active.user.id).reverse();
      return json(res, 200, { orders });
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
    address1: String(raw.address1 || "").trim(),
    city: String(raw.city || "").trim(),
    state_code: String(raw.state_code || "").trim().toUpperCase(),
    country_code: country,
    zip: String(raw.zip || "").trim()
  };
  if (!["US", "CA", "AU"].includes(recipient.country_code)) delete recipient.state_code;
  return recipient.name && recipient.address1 && recipient.city && recipient.country_code && recipient.zip ? recipient : null;
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
        currency: String(item.currency || "USD").trim().toUpperCase()
      };
    })
    .filter(Boolean)
    .filter((item) => item.productId);
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
    const orders = db.orders.slice().reverse();
    const revenue = db.orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const products = await getProducts();
    return json(res, 200, {
      analytics: {
        users: db.users.length,
        orders: db.orders.length,
        products: products.products.length,
        revenue,
        currency: db.orders.find((order) => order.currency)?.currency || "GBP"
      },
      users,
      orders,
      discountCodes: db.discountCodes,
      hiddenProducts: db.hiddenProducts
    });
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

  if (req.method === "DELETE" && pathname.startsWith("/api/admin/products/")) {
    const productId = decodeURIComponent(pathname.split("/").pop());
    if (!db.hiddenProducts.includes(productId)) db.hiddenProducts.push(productId);
    productCache = { expiresAt: 0, products: null };
    writeDb(db);
    return json(res, 200, { hiddenProducts: db.hiddenProducts });
  }

  return json(res, 404, { error: "Admin route not found." });
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

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/api/")) {
    await routeApi(req, res, url.pathname);
    return;
  }
  serveStatic(req, res, url.pathname);
}).listen(PORT, () => {
  console.log(`Minimal Atelier running at http://localhost:${PORT}`);
  console.log(`Printful integration: ${PRINTFUL_TOKEN ? "configured" : "waiting for PRINTFUL_TOKEN"}`);
});
