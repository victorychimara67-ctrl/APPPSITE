const nav = document.querySelector(".nav");
const stage = document.querySelector("[data-parallax]");
const reveals = document.querySelectorAll(".reveal");
const canvas = document.getElementById("particles");
const ctx = canvas?.getContext("2d");

const profileButton = document.getElementById("profileButton");
const cartButton = document.getElementById("cartButton");
const cartCount = document.getElementById("cartCount");
const authModal = document.getElementById("authModal");
const cartModal = document.getElementById("cartModal");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const accountPanel = document.getElementById("accountPanel");
const accountName = document.getElementById("accountName");
const logoutButton = document.getElementById("logoutButton");
const cartItems = document.getElementById("cartItems");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutSummary = document.getElementById("checkoutSummary");
const toast = document.getElementById("toast");
const productGrid = document.getElementById("productGrid");
const adminButton = document.getElementById("adminButton");
const productModal = document.getElementById("productModal");
const adminModal = document.getElementById("adminModal");
const detailTitle = document.getElementById("detailTitle");
const detailPrice = document.getElementById("detailPrice");
const detailDescription = document.getElementById("detailDescription");
const detailMainImage = document.getElementById("detailMainImage");
const detailVariant = document.getElementById("detailVariant");
const detailAddButton = document.getElementById("detailAddButton");
const detailSpinButton = document.getElementById("detailSpinButton");
const detailModelLink = document.getElementById("detailModelLink");
const detailViewer = document.getElementById("detailViewer");
const galleryPrev = document.getElementById("galleryPrev");
const galleryNext = document.getElementById("galleryNext");
const mockupStrip = document.getElementById("mockupStrip");
const discountForm = document.getElementById("discountForm");
const adminStats = document.getElementById("adminStats");
const adminUsers = document.getElementById("adminUsers");
const adminOrders = document.getElementById("adminOrders");
const adminDiscounts = document.getElementById("adminDiscounts");
const adminProducts = document.getElementById("adminProducts");
const syncPrintfulButton = document.getElementById("syncPrintfulButton");
const adminProductHint = document.getElementById("adminProductHint");
const searchButton = document.getElementById("searchButton");
const searchModal = document.getElementById("searchModal");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const generateCodeButton = document.getElementById("generateCodeButton");
const printGiftCode = document.getElementById("printGiftCode");
const printGiftValue = document.getElementById("printGiftValue");
const printGiftMessage = document.getElementById("printGiftMessage");

// --- Utilities ---
function shouldUseLiteMotion() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const isSlow = connection?.saveData || ["slow-2g", "2g", "3g"].includes(connection?.effectiveType);
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return isSlow || prefersReduced;
}

function escapeHtml(str) {
  if (typeof str !== "string") return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function money(amount, currency = "USD") {
  if (amount === null || amount === undefined) return "---";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "USD").toUpperCase(),
  }).format(amount);
}

function productAlt(name) {
  return `Emmanuel CI Universe - ECI ${name} - Luxury Streetwear`;
}

function compactFileName(path, fallback = "File") {
  if (!path) return fallback;
  const parts = path.split("/");
  return parts[parts.length - 1].split("?")[0] || fallback;
}

const liteMotion = shouldUseLiteMotion();
if (liteMotion) document.documentElement.classList.add("network-lite");

let productsPromise = null;
function getProductsData() {
  if (!productsPromise) {
    productsPromise = api("/api/products").catch(err => {
      console.warn("Global products fetch failed", err);
      productsPromise = null; 
      throw err;
    });
  }
  return productsPromise;
}

// --- Cart & Session State ---
let cart = loadCart();
let currentUser = null;
let currentProduct = null;
let allProducts = [];
let products = {
  hoodie: { id: "hoodie", name: "ECI Essential Hoodie", price: 89.99, image: "assets/product-hoodie.png" },
  tee: { id: "tee", name: "ECI Minimal Tee", price: 49.99, image: "assets/product-tee.png" },
  jacket: { id: "jacket", name: "ECI Puffer Jacket", price: 129.99, image: "assets/product-jacket.png" },
  cap: { id: "cap", name: "ECI Minimal Cap", price: 29.99, image: "assets/product-cap.png" },
  pants: { id: "pants", name: "ECI Cargo Pants", price: 79.99, image: "assets/product-pants.png" },
  sneakers: { id: "sneakers", name: "ECI Core Sneakers", price: 119.99, image: "assets/product-sneakers.png" }
};

function saveCart() {
  localStorage.setItem("eci_cart", JSON.stringify(cart));
}

function loadCart() {
  try {
    const saved = localStorage.getItem("eci_cart");
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function persistCart() {
  saveCart();
  if (cartCount) cartCount.textContent = cart.reduce((total, item) => total + item.quantity, 0);
}

// --- Core API & Auth ---
async function api(path, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 25000);
  try {
    const response = await fetch(path, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      credentials: "same-origin",
      signal: controller.signal,
      ...options
    });
    clearTimeout(id);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function loadSession() {
  try {
    const payload = await api("/api/auth/me");
    currentUser = payload.user;
    updateAuthUi();
  } catch (e) {
    currentUser = null;
    updateAuthUi();
  }
}

function updateAuthUi() {
  if (!accountPanel || !adminButton) return;
  const isAdmin = currentUser && currentUser.role === "admin";
  adminButton.classList.toggle("hidden", !isAdmin);
  
  if (currentUser) {
    loginForm?.classList.add("hidden");
    signupForm?.classList.add("hidden");
    document.querySelector(".auth-tabs")?.classList.add("hidden");
    accountPanel.classList.remove("hidden");
    accountName.innerHTML = `Signed in as <strong>${escapeHtml(currentUser.name)}</strong>`;
    profileButton?.classList.add("logged-in");
    
    // Auto-fill checkout
    if (checkoutForm) {
      checkoutForm.email.value = currentUser.email || "";
      checkoutForm.name.value = currentUser.name || "";
    }
  } else {
    accountPanel.classList.add("hidden");
    loginForm?.classList.remove("hidden");
    document.querySelector(".auth-tabs")?.classList.remove("hidden");
    profileButton?.classList.remove("logged-in");
  }
}

// --- Product Logic ---
function renderProducts(productList) {
  console.log("renderProducts: Rendering", productList.length, "items");
  if (!productGrid) return;
  
  allProducts = productList;
  const indexed = {};
  productList.forEach(p => { if (p && p.id) indexed[p.id] = p; });
  Object.assign(products, indexed);

  if (!productList.length) {
    productGrid.innerHTML = '<div class="product-empty">No ECI products found.</div>';
    return;
  }

  try {
    productGrid.innerHTML = productList
      .map((product) => `
        <article class="product-card reveal" onclick="openProductDetail('${product.id}')" role="button" aria-label="View ${escapeHtml(product.name)}">
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(productAlt(product.name))}" loading="lazy" decoding="async" />
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <p>${money(product.price, product.currency)}</p>
            ${renderVariantSelect(product)}
          </div>
          <div class="product-actions">
            <button class="button primary mini" onclick="event.stopPropagation(); addToCart('${product.id}')">ADD TO CART</button>
          </div>
        </article>
      `)
      .join("");
    enableLazyImages(productGrid);
  } catch (err) {
    console.error("Rendering failure", err);
    productGrid.innerHTML = '<div class="product-empty">Error loading collection.</div>';
  }
}

function renderVariantSelect(product) {
  if (!product.variants || product.variants.length <= 1) return "";
  return `
    <select class="variant-select" onchange="event.stopPropagation()" onclick="event.stopPropagation()">
      ${product.variants.map(v => `<option value="${v.id}">${escapeHtml(v.name.replace(product.name + " / ", ""))}</option>`).join("")}
    </select>
  `;
}

async function loadProducts() {
  try {
    const payload = await getProductsData();
    renderProducts(payload.products || []);
    
    // Popup logic
    if (payload.popupConfig?.enabled) {
      setTimeout(() => {
        if (!localStorage.getItem("eci_discount_shown")) openPopup(payload.popupConfig);
      }, 4000);
    }
  } catch (error) {
    console.warn("API failed, using local products.");
    renderProducts(Object.values(products));
  }
}

// --- Product Detail Sub-logic ---
let detailGalleryIndex = 0;
let detailGalleryImages = [];

function setDetailImage(index) {
  if (!detailGalleryImages.length || !detailMainImage) return;
  detailGalleryIndex = (index + detailGalleryImages.length) % detailGalleryImages.length;
  detailMainImage.src = detailGalleryImages[detailGalleryIndex];
  
  // Highlight active thumbnail if it exists
  mockupStrip?.querySelectorAll("button").forEach((btn, i) => {
    btn.classList.toggle("active", i === detailGalleryIndex);
  });
}

galleryPrev?.addEventListener("click", () => setDetailImage(detailGalleryIndex - 1));
galleryNext?.addEventListener("click", () => setDetailImage(detailGalleryIndex + 1));

detailAddButton?.addEventListener("click", () => {
  if (currentProduct) {
    addToCart(currentProduct.id, detailVariant?.value);
    closeModal(productModal);
  }
});

detailSpinButton?.addEventListener("click", () => {
  if (detailViewer) detailViewer.classList.toggle("spinning");
});

const detailBuyButton = document.getElementById("detailBuyButton");
detailBuyButton?.addEventListener("click", () => {
  if (currentProduct) {
    addToCart(currentProduct.id, detailVariant?.value);
    renderCart();
    openModal(cartModal);
    closeModal(productModal);
  }
});

// Update openProductDetail to handle gallery
async function openProductDetail(id) {
  const product = allProducts.find(p => p.id === id) || products[id];
  if (!product) return;
  
  currentProduct = product;
  if (detailTitle) detailTitle.textContent = product.name;
  if (detailPrice) detailPrice.textContent = money(product.price, product.currency);
  if (detailDescription) detailDescription.textContent = product.description || "Premium ECI silhouette.";
  
  detailGalleryImages = product.images || [product.image];
  detailGalleryIndex = 0;
  if (detailMainImage) detailMainImage.src = detailGalleryImages[0];
  
  if (mockupStrip) {
    mockupStrip.innerHTML = detailGalleryImages.map((img, i) => `
      <button class="${i === 0 ? 'active' : ''}" onclick="setDetailImage(${i})">
        <img src="${escapeHtml(img)}" />
      </button>
    `).join("");
  }

  if (detailVariant) {
    detailVariant.innerHTML = (product.variants || [])
      .map(v => `<option value="${v.id}">${escapeHtml(v.name.replace(product.name + " / ", ""))}</option>`)
      .join("");
    detailVariant.classList.toggle("hidden", !product.variants?.length);
  }
  
  openModal(productModal);
}

window.setDetailImage = setDetailImage;

function addToCart(id, variantId = "") {
  const product = allProducts.find(p => p.id === id) || products[id];
  if (!product) return;
  
  const vId = variantId || product.printfulVariantId || "";
  const existing = cart.find(item => item.productId === id && item.variantId === vId);
  
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({
      productId: product.id,
      variantId: vId,
      name: product.name,
      price: product.price,
      currency: product.currency || "USD",
      image: product.image,
      quantity: 1
    });
  }
  persistCart();
  showToast(`${product.name} added to cart`);
}

// --- UI Helpers ---
function openModal(modal) {
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3000);
}

function enableLazyImages(scope = document) {
  scope.querySelectorAll("img").forEach(img => {
    img.loading = "lazy";
    img.decoding = "async";
  });
}

function setNavState() {
  if (nav) nav.classList.toggle("scrolled", window.scrollY > 20);
}

// --- Initialization ---
async function initApp() {
  setNavState();
  persistCart();
  
  await Promise.all([
    loadSession(),
    loadProducts()
  ]);
  
  setupReveals(liteMotion);
  setupParallax(liteMotion);
  setupIntro(liteMotion);
}

function setupReveals(lite) {
  const reveals = document.querySelectorAll(".reveal");
  if (lite) {
    reveals.forEach(r => r.classList.add("visible"));
    return;
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add("visible"); });
  }, { threshold: 0.1 });
  reveals.forEach(r => observer.observe(r));
}

function setupParallax(lite) {
  if (lite || !stage) return;
  window.addEventListener("mousemove", e => {
    const x = (e.clientX / window.innerWidth - 0.5) * 10;
    const y = (e.clientY / window.innerHeight - 0.5) * 10;
    stage.style.transform = `rotateY(${x}deg) rotateX(${-y}deg)`;
  }, { passive: true });
}

function setupIntro(lite) {
  const intro = document.querySelector(".intro");
  if (!intro) return;
  if (lite) {
    intro.remove();
    return;
  }
  setTimeout(() => intro.classList.add("fade-out"), 2500);
  setTimeout(() => intro.remove(), 3000);
}

// Global Handlers
window.addEventListener("scroll", setNavState, { passive: true });

// Modal Closing
document.querySelectorAll("[data-close]").forEach(btn => {
  btn.addEventListener("click", () => closeModal(document.getElementById(btn.dataset.close)));
});

[authModal, cartModal, productModal, adminModal, searchModal].forEach(modal => {
  modal?.addEventListener("click", (e) => { if (e.target === modal) closeModal(modal); });
});

// Navigation Buttons
searchButton?.addEventListener("click", () => openModal(searchModal));
profileButton?.addEventListener("click", () => openModal(authModal));
cartButton?.addEventListener("click", () => { renderCart(); openModal(cartModal); });
adminButton?.addEventListener("click", () => { loadAdmin(); openModal(adminModal); });

// Auth Tabs
document.querySelectorAll("[data-auth-tab]").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach(t => t.classList.remove("active"));
    btn.classList.add("active");
    loginForm?.classList.toggle("hidden", btn.dataset.authTab !== "login");
    signupForm?.classList.toggle("hidden", btn.dataset.authTab !== "signup");
  });
});

// --- Auth Operations ---
loginForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: loginForm.email.value, password: loginForm.password.value })
    });
    currentUser = payload.user;
    updateAuthUi();
    closeModal(authModal);
    showToast("Welcome back, " + currentUser.name);
  } catch (err) { showToast(err.message); }
});

signupForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const payload = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ name: signupForm.name.value, email: signupForm.email.value, password: signupForm.password.value })
    });
    currentUser = payload.user;
    updateAuthUi();
    closeModal(authModal);
    showToast("Account created!");
  } catch (err) { showToast(err.message); }
});

logoutButton?.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  currentUser = null;
  updateAuthUi();
  showToast("Signed out");
});

// --- Cart Logic ---
function renderCart() {
  if (!cartItems) return;
  if (!cart.length) {
    cartItems.innerHTML = '<div class="cart-empty">Your cart is empty.</div>';
    if (checkoutForm) checkoutForm.style.display = "none";
    return;
  }
  if (checkoutForm) checkoutForm.style.display = "grid";
  cartItems.innerHTML = cart.map((item, i) => `
    <div class="cart-row">
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" />
      <div class="cart-details">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${money(item.price, item.currency)}</span>
      </div>
      <div class="cart-actions">
        <button onclick="updateQuantity(${i}, -1)">-</button>
        <span>${item.quantity}</span>
        <button onclick="updateQuantity(${i}, 1)">+</button>
      </div>
    </div>
  `).join("");
  renderCheckoutSummary();
}

window.updateQuantity = (index, delta) => {
  cart[index].quantity += delta;
  if (cart[index].quantity <= 0) cart.splice(index, 1);
  persistCart();
  renderCart();
};

async function renderCheckoutSummary() {
  if (!checkoutSummary) return;
  const subtotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
  const currency = cart[0]?.currency || "USD";
  checkoutSummary.innerHTML = `
    <div class="summary-line"><span>Subtotal</span><strong>${money(subtotal, currency)}</strong></div>
    <div class="summary-line total"><span>Total</span><strong>${money(subtotal, currency)}</strong></div>
  `;
}

checkoutForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = checkoutForm.querySelector("button[type='submit']");
  btn.disabled = true;
  btn.textContent = "Processing...";
  try {
    const payload = await api("/api/checkout", {
      method: "POST",
      body: JSON.stringify({ items: cart, email: checkoutForm.email.value, name: checkoutForm.name.value })
    });
    if (payload.url) window.location.href = payload.url;
  } catch (err) {
    showToast(err.message);
    btn.disabled = false;
    btn.textContent = "CHECKOUT NOW";
  }
});

// --- Search Logic ---
searchInput?.addEventListener("input", (e) => {
  const query = e.target.value.toLowerCase().trim();
  if (!query) {
    searchResults.innerHTML = "";
    return;
  }
  const filtered = allProducts.filter(p => p.name.toLowerCase().includes(query) || p.description?.toLowerCase().includes(query));
  searchResults.innerHTML = filtered.map(p => `
    <div class="search-result-item" onclick="openProductDetail('${p.id}'); closeModal(searchModal)">
      <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" />
      <div>
        <strong>${escapeHtml(p.name)}</strong>
        <span>${money(p.price, p.currency)}</span>
      </div>
    </div>
  `).join("") || '<p style="padding: 20px; text-align: center;">No results found.</p>';
});

// --- Admin Logic ---
async function loadAdmin() {
  try {
    const stats = await api("/api/admin/stats");
    if (adminStats) adminStats.innerHTML = `
      <div class="stat-card"><h3>Orders</h3><p>${stats.totalOrders}</p></div>
      <div class="stat-card"><h3>Revenue</h3><p>${money(stats.totalRevenue)}</p></div>
      <div class="stat-card"><h3>Users</h3><p>${stats.totalUsers}</p></div>
    `;
  } catch (e) { console.warn("Admin load failed", e); }
}

syncPrintfulButton?.addEventListener("click", async () => {
  syncPrintfulButton.disabled = true;
  syncPrintfulButton.textContent = "Syncing...";
  try {
    await api("/api/admin/sync-printful", { method: "POST" });
    showToast("Printful sync triggered! Products will refresh shortly.");
    loadProducts();
  } catch (err) { showToast(err.message); }
  finally {
    syncPrintfulButton.disabled = false;
    syncPrintfulButton.textContent = "SYNC PRINTFUL";
  }
});

// Start the app
initApp();
