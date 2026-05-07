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

let cart = loadCart();
let currentUser = null;
let currentProduct = null;

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
let currentDetailProduct = null;
let detailGalleryImages = [];
let detailGalleryIndex = 0;
let allProducts = [];

let products = {
  hoodie: { id: "hoodie", name: "ECI Essential Hoodie", price: 89.99, image: "assets/product-hoodie.png" },
  tee: { id: "tee", name: "ECI Minimal Tee", price: 49.99, image: "assets/product-tee.png" },
  jacket: { id: "jacket", name: "ECI Puffer Jacket", price: 129.99, image: "assets/product-jacket.png" },
  cap: { id: "cap", name: "ECI Minimal Cap", price: 29.99, image: "assets/product-cap.png" },
  pants: { id: "pants", name: "ECI Cargo Pants", price: 79.99, image: "assets/product-pants.png" },
  sneakers: { id: "sneakers", name: "ECI Core Sneakers", price: 119.99, image: "assets/product-sneakers.png" }
};

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    credentials: "same-origin",
    ...options
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function setNavState() {
  nav.classList.toggle("scrolled", window.scrollY > 18);
}

function openModal(modal) {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove("show"), 3200);
}

function persistCart() {
  saveCart();
  cartCount.textContent = cart.reduce((total, item) => total + item.quantity, 0);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function productAlt(productName) {
  return `Emmanuel CI Universe - ECI ${productName} - Shine the Fit`;
}

function enableLazyImages(scope = document) {
  scope.querySelectorAll("img").forEach((image) => {
    if (!image.hasAttribute("fetchpriority") && !image.closest(".hero")) image.loading ||= "lazy";
    image.decoding = "async";
    if (!image.alt) image.alt = "Emmanuel CI Universe - ECI Brand Clothing - Shine the Fit";
  });
}

function shouldUseLiteMotion() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const slowConnection = connection?.saveData || ["slow-2g", "2g", "3g"].includes(connection?.effectiveType);
  const lowMemoryMobile = window.innerWidth <= 640 && Number(navigator.deviceMemory || 4) <= 4;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches || slowConnection || lowMemoryMobile;
}

function money(value, currency = "USD") {
  if (value === null || value === undefined) return "Price on Printful";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function compactFileName(name, fallback = "Uploaded file") {
  const clean = String(name || fallback).split(/[\\/]/).pop();
  return clean.length > 46 ? `${clean.slice(0, 22)}...${clean.slice(-16)}` : clean;
}

function isDataUrl(value = "") {
  return String(value).startsWith("data:");
}

function normalizeCustomImageItem(item) {
  if (item && typeof item === "object") return item;
  return { url: String(item || ""), name: isDataUrl(item) ? "Uploaded custom image" : compactFileName(item, "Custom image"), type: "" };
}

function normalizeCheckoutCountry(value) {
  const raw = String(value || "").trim().toUpperCase();
  const aliases = { UK: "GB", "U.K.": "GB", "UNITED KINGDOM": "GB", ENGLAND: "GB", SCOTLAND: "GB", WALES: "GB" };
  return aliases[raw] || raw;
}

function renderProducts(productList) {
  allProducts = productList;
  products = Object.fromEntries(productList.map((product) => [product.id, product]));
  if (!productList.length) {
    productGrid.innerHTML = '<div class="product-empty">No ECI products are available right now.</div>';
    return;
  }
  productGrid.innerHTML = productList
    .map(
      (product) => `
        <article class="product-card reveal visible" data-product-id="${product.id}">
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(productAlt(product.name))}" title="Emmanuel CI Universe ECI Brand" loading="lazy" decoding="async" />
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <p>${money(product.price, product.currency)}</p>
            ${renderVariantSelect(product)}
          </div>
          <div class="product-actions">
            <button class="btn-buy" aria-label="Buy ${escapeHtml(product.name)} now">BUY NOW</button>
            <button class="btn-add" aria-label="Add ${escapeHtml(product.name)} to cart">+</button>
          </div>
        </article>
      `
    )
    .join("");
  enableLazyImages(productGrid);
}

function renderVariantSelect(product) {
  if (!product.variants || product.variants.length <= 1) return "";
  const options = product.variants
    .map((variant) => `<option value="${escapeHtml(variant.id)}">${escapeHtml(variant.name.replace(`${product.name} / `, ""))}</option>`)
    .join("");
  return `<select class="variant-select" aria-label="${escapeHtml(product.name)} variant">${options}</select>`;
}

async function loadProducts() {
  try {
    const payload = await api("/api/products");
    renderProducts(payload.products);
    const productPath = location.pathname.match(/^\/product\/(.+)$/);
    if (productPath) openProductDetail(decodeURIComponent(productPath[1]), false);
  } catch (error) {
    console.warn("Product API failed, using local storefront fallback.", error);
    const fallbackProducts = Object.values(products || {});
    if (fallbackProducts.length) {
      renderProducts(fallbackProducts);
      showToast("Using local ECI products while the API is unavailable.");
    } else {
      productGrid.innerHTML = '<div class="product-empty">The ECI collection could not load. Please try again shortly.</div>';
    }
  }
}

function renderCart() {
  persistCart();
  if (!cart.length) {
    cartItems.innerHTML = '<div class="cart-empty">Your cart is empty. Add a piece from the collection first.</div>';
    checkoutForm.style.display = "none";
    checkoutSummary.innerHTML = "";
    return;
  }
  checkoutForm.style.display = "grid";
  cartItems.innerHTML = cart
    .map((item, index) => {
      const product = products[item.productId] || item;
      const displayName = item.name || product.name;
      const price = item.price ?? product.price;
      const currency = item.currency || product.currency || "USD";
      const image = item.image || product.image;
      const linePrice = price ? money(price * item.quantity, currency) : "Printful item";
      return `
        <div class="cart-row" data-index="${index}">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(productAlt(displayName))}" loading="lazy" decoding="async" />
          <div>
            <strong>${escapeHtml(displayName)}</strong>
            <span>${money(price, currency)} - ${linePrice}</span>
          </div>
          <div class="quantity-tools">
            <button type="button" data-action="remove" aria-label="Remove ${escapeHtml(displayName)}">×</button>
            <span>${item.quantity}</span>
          </div>
        </div>
      `;
    })
    .join("");
  enableLazyImages(cartItems);
  renderCheckoutSummary();
}

function cartSubtotal() {
  return cart.reduce((sum, item) => sum + Number(item.price || 0) * item.quantity, 0);
}

function cartCurrency() {
  return cart.find((item) => item.currency)?.currency || "USD";
}

async function renderCheckoutSummary() {
  if (!checkoutSummary || !cart.length) return;
  const discountCode = checkoutForm.discountCode?.value?.trim() || "";
  const subtotal = cartSubtotal();
  const currency = cartCurrency();
  checkoutSummary.innerHTML = `
    <div><span>Subtotal</span><strong>${money(subtotal, currency)}</strong></div>
    <div><span>Total</span><strong>${money(subtotal, currency)}</strong></div>
  `;
  if (!discountCode) return;
  try {
    const payload = await api("/api/discounts/preview", {
      method: "POST",
      body: JSON.stringify({ items: cart, discountCode })
    });
    const discount = payload.discount;
    checkoutSummary.innerHTML = `
      <div><span>Subtotal</span><strong>${money(discount.subtotal, discount.currency)}</strong></div>
      <div><span>Discount${discount.code ? ` (${escapeHtml(discount.code)})` : ""}</span><strong>-${money(discount.discountAmount, discount.currency)}</strong></div>
      <div><span>Total</span><strong>${money(discount.total, discount.currency)}</strong></div>
      <p>${payload.valid ? "Discount code applied." : "Discount code not found."}</p>
    `;
  } catch {
    checkoutSummary.innerHTML += "<p>Discount will be checked at secure payment.</p>";
  }
}

function updateAuthUi() {
  adminButton.classList.toggle("hidden", !currentUser?.isAdmin);
  if (currentUser) {
    loginForm.classList.add("hidden");
    signupForm.classList.add("hidden");
    document.querySelector(".auth-tabs").classList.add("hidden");
    accountPanel.classList.remove("hidden");
    accountName.innerHTML = `Signed in as <strong>${currentUser.name}</strong><br>${currentUser.email}`;
    checkoutForm.email.value = currentUser.email;
    checkoutForm.name.value = currentUser.name;
    loadUserOrders();
  } else {
    document.querySelector(".auth-tabs").classList.remove("hidden");
    accountPanel.classList.add("hidden");
    loginForm.classList.remove("hidden");
  }
}

async function loadUserOrders() {
  const userOrdersList = document.getElementById("userOrdersList");
  if (!userOrdersList) return;
  try {
    const payload = await api("/api/orders");
    renderUserOrders(payload.orders);
  } catch (error) {
    console.warn("Failed to load user orders", error);
  }
}

function renderUserOrders(orders) {
  const userOrdersList = document.getElementById("userOrdersList");
  if (!userOrdersList) return;
  if (!orders || !orders.length) {
    userOrdersList.innerHTML = '<p class="empty-orders">No orders found.</p>';
    return;
  }
  userOrdersList.innerHTML = orders.map(order => `
    <div class="user-order-card">
      <div class="user-order-header">
        <strong>Order #${order.id.slice(-6).toUpperCase()}</strong>
        <span class="user-order-status status-${order.status}">${order.statusLabel || order.status.replace(/_/g, " ")}</span>
      </div>
      <div class="user-order-details">
        <div class="user-order-items">
          ${order.items.map(item => `
            <div class="order-item-mini">
              <span>${item.quantity}x ${escapeHtml(item.name)}</span>
              <span>${money(item.price * item.quantity, order.currency)}</span>
            </div>
          `).join("")}
        </div>
        <div class="order-footer-mini">
          <strong>Total: ${money(order.total, order.currency)}</strong>
          <small>${new Date(order.createdAt).toLocaleDateString()}</small>
        </div>
        ${order.tracking ? `
          <a href="${order.tracking.url}" target="_blank" class="tracking-link">
            Track with ${order.tracking.carrier}: ${order.tracking.number}
          </a>
        ` : order.status === "shipped" ? '<p class="tracking-link">Tracking info coming soon...</p>' : ""}
      </div>
    </div>
  `).join("");
}

async function loadSession() {
  try {
    const payload = await api("/api/auth/me");
    currentUser = payload.user;
    updateAuthUi();
  } catch (e) {
    console.warn("Session check failed, proceeding as guest", e);
    currentUser = null;
    updateAuthUi();
  }
}

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    loginForm.classList.toggle("hidden", button.dataset.authTab !== "login");
    signupForm.classList.toggle("hidden", button.dataset.authTab !== "signup");
  });
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    closeModal(document.getElementById(button.dataset.close));
    if (button.dataset.close === "productModal" && location.pathname.startsWith("/product/")) {
      history.pushState({}, "", "/#shop");
    }
  });
});

[authModal, cartModal, productModal, adminModal, searchModal].forEach((modal) => {
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal(modal);
      if (modal === productModal && location.pathname.startsWith("/product/")) history.pushState({}, "", "/#shop");
    }
  });
});

adminButton.addEventListener("click", () => {
  loadAdmin();
  openModal(adminModal);
  startAdminPolling();
});

profileButton.addEventListener("click", () => openModal(authModal));
const contactLink = document.getElementById("contactLink");
if (contactLink) {
  contactLink.addEventListener("click", (e) => {
    e.preventDefault();
    openModal(document.getElementById("contactModal"));
  });
}
cartButton.addEventListener("click", () => {
  renderCart();
  openModal(cartModal);
});

productGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".product-card");
  if (!card) return;
  
  const productId = card.dataset.productId;
  const variantId = card.querySelector(".variant-select")?.value || "";
  
  if (event.target.closest("button")) {
    const isBuyNow = event.target.textContent.includes("BUY");
    if (isBuyNow) {
      handleBuyNow(productId, variantId);
    } else {
      addToCart(productId, variantId);
    }
    return;
  }
  
  if (!event.target.closest("select")) {
    openProductDetail(productId);
  }
});

function addToCart(productId, selectedVariantId = "") {
  if (!currentUser) {
    closeModal(cartModal);
    closeModal(productModal);
    openModal(authModal);
    showToast("Please log in to add items to your cart");
    return;
  }
  const product = products[productId];
  if (!product) return;
  
  const variantId = selectedVariantId || product.printfulVariantId || "";
  const selectedVariant = product.variants?.find((variant) => variant.id === variantId);
  
  const existing = cart.find((item) => item.productId === productId && item.printfulVariantId === variantId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.push({
      productId,
      quantity: 1,
      printfulVariantId: variantId,
      name: selectedVariant?.name || product.name || "Product",
      price: selectedVariant?.price ?? product.price ?? null,
      currency: selectedVariant?.currency || product.currency || "USD",
      image: selectedVariant?.image || product.image || "assets/product-hoodie.png"
    });
  }
  renderCart();
  showToast(`${selectedVariant?.name || product.name} added to cart`);
}

async function handleBuyNow(productId, variantId = "") {
  addToCart(productId, variantId);
  renderCart();
  openModal(cartModal);
}

async function openProductDetail(productId, pushUrl = true) {
  try {
    const payload = await api(`/api/products/${encodeURIComponent(productId)}`);
    currentDetailProduct = payload.product;
    const images = currentDetailProduct.images?.length ? currentDetailProduct.images : [currentDetailProduct.image];
    detailGalleryImages = images;
    detailGalleryIndex = 0;
    detailTitle.textContent = currentDetailProduct.name;
    detailPrice.textContent = money(currentDetailProduct.price, currentDetailProduct.currency);
    detailDescription.textContent = currentDetailProduct.description || "Premium ECI piece with selectable variants and custom showroom imagery.";
    detailVariant.innerHTML = (currentDetailProduct.variants || [])
      .map((variant) => `<option value="${escapeHtml(variant.id)}">${escapeHtml(variant.name.replace(`${currentDetailProduct.name} / `, ""))}</option>`)
      .join("");
    detailVariant.disabled = !currentDetailProduct.variants?.length;
    mockupStrip.innerHTML = images
      .map((image, index) => `<button class="${index === 0 ? "active" : ""}" data-image-index="${index}"><img src="${escapeHtml(image)}" alt="${escapeHtml(productAlt(`${currentDetailProduct.name} Mockup ${index + 1}`))}" loading="lazy" decoding="async" /></button>`)
      .join("");
    enableLazyImages(mockupStrip);
    setDetailImage(0);
    const hasMultipleImages = images.length > 1;
    galleryPrev.classList.toggle("hidden", !hasMultipleImages);
    galleryNext.classList.toggle("hidden", !hasMultipleImages);
    detailModelLink.classList.toggle("hidden", !currentDetailProduct.mockup3d?.url);
    if (currentDetailProduct.mockup3d?.url) {
      detailModelLink.href = currentDetailProduct.mockup3d.url;
      detailModelLink.download = currentDetailProduct.mockup3d.name || "eci-3d-mockup";
    }
    detailViewer.classList.remove("spinning");
    if (pushUrl && location.pathname !== `/product/${encodeURIComponent(productId)}`) {
      history.pushState({ productId }, "", `/product/${encodeURIComponent(productId)}`);
    }
    openModal(productModal);
  } catch (error) {
    showToast(error.message);
  }
}

function setDetailImage(index) {
  if (!detailGalleryImages.length) return;
  detailGalleryIndex = (index + detailGalleryImages.length) % detailGalleryImages.length;
  const image = detailGalleryImages[detailGalleryIndex];
  detailMainImage.src = image;
  detailMainImage.alt = productAlt(`${currentDetailProduct?.name || "Product"} photo ${detailGalleryIndex + 1}`);
  mockupStrip.querySelectorAll("button").forEach((button, buttonIndex) => {
    button.classList.toggle("active", buttonIndex === detailGalleryIndex);
  });
  mockupStrip.querySelector(`[data-image-index="${detailGalleryIndex}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
}

function moveDetailImage(step) {
  setDetailImage(detailGalleryIndex + step);
}

mockupStrip.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  setDetailImage(Number(button.dataset.imageIndex || 0));
});

galleryPrev.addEventListener("click", () => moveDetailImage(-1));
galleryNext.addEventListener("click", () => moveDetailImage(1));

let galleryTouchX = 0;
detailViewer.addEventListener("pointerdown", (event) => {
  galleryTouchX = event.clientX;
});
detailViewer.addEventListener("pointerup", (event) => {
  const delta = event.clientX - galleryTouchX;
  if (Math.abs(delta) > 44) moveDetailImage(delta < 0 ? 1 : -1);
});

window.addEventListener("popstate", () => {
  const productPath = location.pathname.match(/^\/product\/(.+)$/);
  if (productPath) openProductDetail(decodeURIComponent(productPath[1]), false);
  else closeModal(productModal);
});

detailAddButton.addEventListener("click", () => {
  if (!currentDetailProduct) return;
  addToCart(currentDetailProduct.id, detailVariant.value || currentDetailProduct.printfulVariantId);
  closeModal(productModal);
});

const detailBuyButton = document.getElementById("detailBuyButton");
if (detailBuyButton) {
  detailBuyButton.addEventListener("click", () => {
    if (!currentDetailProduct) return;
    handleBuyNow(currentDetailProduct.id, detailVariant.value || currentDetailProduct.printfulVariantId);
    closeModal(productModal);
  });
}

detailSpinButton.addEventListener("click", () => {
  detailViewer.classList.toggle("spinning");
});

searchButton.addEventListener("click", () => {
  openModal(searchModal);
  searchInput.focus();
  renderSearchResults(searchInput.value);
});

searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));

function renderSearchResults(query) {
  const needle = query.trim().toLowerCase();
  const matches = allProducts.filter((product) => !needle || product.name.toLowerCase().includes(needle));
  searchResults.innerHTML = matches
    .map((product) => `
      <button type="button" data-search-product="${escapeHtml(product.id)}">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(productAlt(product.name))}" loading="lazy" decoding="async" />
        <span><strong>${escapeHtml(product.name)}</strong><small>${money(product.price, product.currency)}</small></span>
      </button>
    `)
    .join("") || '<p class="cart-empty">No products found.</p>';
  enableLazyImages(searchResults);
}

searchResults.addEventListener("click", (event) => {
  const result = event.target.closest("[data-search-product]");
  if (!result) return;
  closeModal(searchModal);
  openProductDetail(result.dataset.searchProduct);
});

cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action='remove']");
  if (!button) return;
  const row = button.closest(".cart-row");
  const index = Number(row.dataset.index);
  cart.splice(index, 1);
  renderCart();
});

checkoutForm.discountCode?.addEventListener("input", () => {
  clearTimeout(renderCheckoutSummary.timeout);
  renderCheckoutSummary.timeout = setTimeout(renderCheckoutSummary, 350);
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(loginForm));
    const payload = await api("/api/auth/login", { method: "POST", body: JSON.stringify(data) });
    currentUser = payload.user;
    updateAuthUi();
    showToast("Logged in");
  } catch (error) {
    showToast(error.message);
  }
});

const contactForm = document.getElementById("contactForm");
if (contactForm) {
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = contactForm.querySelector('button[type="submit"]');
    try {
      submitBtn.disabled = true;
      submitBtn.textContent = "Sending...";
      const data = Object.fromEntries(new FormData(contactForm));
      await api("/api/contact", { method: "POST", body: JSON.stringify(data) });
      showToast("Message sent to the Universe");
      contactForm.reset();
      closeModal(document.getElementById("contactModal"));
    } catch (error) {
      showToast(error.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Send Message";
    }
  });
}

signupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = Object.fromEntries(new FormData(signupForm));
    const payload = await api("/api/auth/signup", { method: "POST", body: JSON.stringify(data) });
    currentUser = payload.user;
    updateAuthUi();
    showToast("Account created");
  } catch (error) {
    showToast(error.message);
  }
});

logoutButton.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST", body: "{}" });
  currentUser = null;
  updateAuthUi();
  showToast("Logged out");
});
function normalizeCheckoutCountry(value = "US") {
  const raw = String(value || "US").trim().toUpperCase();
  const aliases = {
    UK: "GB", "U.K.": "GB", "UNITED KINGDOM": "GB",
    USA: "US", "UNITED STATES": "US"
  };
  return aliases[raw] || raw;
}

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!checkoutForm.reportValidity()) return;
  if (!currentUser) {
    closeModal(cartModal);
    openModal(authModal);
    showToast("Create an account or log in before checkout");
    return;
  }
  if (!cart.length) {
    showToast("Your cart is empty");
    return;
  }
  
  const invalidItems = cart.filter(item => !item.price || item.price <= 0);
  if (invalidItems.length > 0) {
    showToast("Some items in your cart don't have pricing. Please remove them or refresh the page.");
    return;
  }

  const submitButton = checkoutForm.querySelector('button[type="submit"]');
  let checkoutPayload = null;
  
  try {
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Opening Secure Payment...";
    }
    
    const formData = Object.fromEntries(new FormData(checkoutForm));
    const { discountCode, ...recipient } = formData;
    
    // Use the local normalization helper
    recipient.country_code = normalizeCheckoutCountry(recipient.country_code);
    if (!["US", "CA", "AU"].includes(recipient.country_code)) {
      recipient.state_code = "";
    }
    
    checkoutPayload = await api("/api/checkout/session", {
      method: "POST",
      body: JSON.stringify({
        recipient,
        items: cart,
        discountCode,
        customOrder: {}
      })
    });
    
    if (!checkoutPayload || !checkoutPayload.checkoutUrl) {
      console.error("Missing checkout URL in response:", checkoutPayload);
      throw new Error("Stripe checkout URL was not generated. Please try again.");
    }
    
    // Redirect to Stripe
    showToast("Redirecting to Stripe secure payment...");
    window.location.href = checkoutPayload.checkoutUrl;
    
  } catch (error) {
    console.error("Checkout error:", error, { checkoutPayload });
    showToast(error.message || "Checkout failed. Please try again.");
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "Continue To Secure Payment";
    }
  }
});

adminButton.addEventListener("click", async () => {
  openModal(adminModal);
  await loadAdmin();
});

async function loadAdmin() {
  try {
    const payload = await api("/api/admin/overview");
    const currency = payload.analytics.currency || "GBP";
    if (payload.products?.length) {
      allProducts = payload.products;
      products = Object.fromEntries(payload.products.map((product) => [product.id, product]));
    }
    adminStats.innerHTML = `
      <div><strong>${payload.analytics.users}</strong><span>Users</span></div>
      <div><strong>${payload.analytics.orders}</strong><span>Orders</span></div>
      <div><strong>${payload.analytics.products}</strong><span>Live Products</span></div>
      <div><strong>${money(payload.analytics.revenue, currency)}</strong><span>Earnings</span></div>
    `;

    const adminAnalytics = document.getElementById("adminAnalytics");
    if (adminAnalytics) {
      adminAnalytics.innerHTML = `
        <div class="live-badge"><strong>${payload.analytics.liveUsers}</strong> Live Browsing</div>
        <p>Total Site Visits: <strong>${payload.analytics.totalVisits}</strong></p>
      `;
    }

    const adminReferrers = document.getElementById("adminReferrers");
    if (adminReferrers) {
      const refs = Object.entries(payload.analytics.referrers || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      adminReferrers.innerHTML = refs.map(([name, count]) => `
        <div class="referrer-row">
          <span>${escapeHtml(name)}</span>
          <strong>${count}</strong>
        </div>
      `).join("") || "<p>No traffic data yet.</p>";
    }

    const popupForm = document.getElementById("adminPopupForm");
    if (popupForm && payload.popupConfig) {
      popupForm.enabled.checked = payload.popupConfig.enabled;
      popupForm.title.value = payload.popupConfig.title;
      popupForm.text.value = payload.popupConfig.text;
      popupForm.code.value = payload.popupConfig.code;
      popupForm.targetProductId.value = payload.popupConfig.targetProductId;
    }

    const adminMessages = document.getElementById("adminMessages");
    if (adminMessages) {
      adminMessages.innerHTML = payload.messages.map(msg => `
        <article class="admin-message-card">
          <div class="admin-message-header">
            <strong>${escapeHtml(msg.name)}</strong>
            <span>${new Date(msg.createdAt).toLocaleString()}</span>
          </div>
          <h4>${escapeHtml(msg.subject)}</h4>
          <p>${escapeHtml(msg.text)}</p>
          <div class="admin-message-actions">
            <a href="mailto:${encodeURIComponent(msg.email)}?subject=${encodeURIComponent("Re: " + msg.subject)}&body=${encodeURIComponent("\n\n--- Original Message from " + msg.name + " ---\n" + msg.text)}" class="button primary">Reply via Gmail</a>
            <small>${escapeHtml(msg.email)}</small>
          </div>
        </article>
      `).join("") || "<p>No messages yet.</p>";
    }

    adminUsers.innerHTML = payload.users.map((user) => `<article><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.email)} - ${user.orderCount} orders${user.isAdmin ? " - admin" : ""}</span></article>`).join("") || "<p>No users yet.</p>";
    adminOrders.innerHTML = payload.orders.map((order) => `<article><strong>${escapeHtml(order.statusLabel || order.status)}</strong><span>${escapeHtml(order.recipient?.email || "")} - ${money(order.total || 0, order.currency || currency)}</span></article>`).join("") || "<p>No orders yet.</p>";
    adminDiscounts.innerHTML = payload.discountCodes.map((discount) => `
      <article>
        <strong>${escapeHtml(discount.code)}${discount.isGiftCard ? " - gift card" : ""}</strong>
        <span>${discount.type} - ${discount.value}${discount.recipientEmail ? ` - ${escapeHtml(discount.recipientEmail)}` : ""}</span>
        <button data-print-gift="${escapeHtml(discount.code)}">Print</button>
        <button data-send-gift="${escapeHtml(discount.code)}">Send</button>
        <button data-delete-code="${escapeHtml(discount.code)}">Delete</button>
      </article>
    `).join("") || "<p>No discount codes yet.</p>";
    adminProductHint.textContent = payload.printfulConnected
      ? `Printful connected. ${payload.products?.length || 0} synced product${payload.products?.length === 1 ? "" : "s"} loaded for this store.`
      : payload.productWarning || "Printful is not connected. Add PRINTFUL_TOKEN and PRINTFUL_STORE_ID in .env.";
    renderAdminProducts(payload.products || Object.values(products), payload.hiddenProducts || []);
  } catch (error) {
    showToast(error.message);
  }
}

function renderAdminProducts(productList, hiddenProducts = []) {
  const hidden = new Set(hiddenProducts);
  adminProducts.innerHTML = productList
    .map((product) => {
      const customImageItems = (product.customImageItems || product.customImages || []).map(normalizeCustomImageItem);
      const urlImages = customImageItems.filter((item) => !isDataUrl(item.url)).map((item) => item.url).join("\n");
      const previewImages = customImageItems
        .map(
          (item) => `
            <figure>
              <img src="${escapeHtml(item.url)}" alt="${escapeHtml(productAlt(`${product.name} admin upload`))}" loading="lazy" decoding="async" />
            </figure>
          `
        )
        .join("");
      const fileNames = [
        ...customImageItems.map((item) => item.name || "Custom image"),
        ...(product.mockup3d?.name ? [`3D: ${product.mockup3d.name}`] : [])
      ];
      const hiddenLabel = hidden.has(product.id) ? "Restore" : "Hide";
      const hiddenAttr = hidden.has(product.id) ? `data-restore-product="${escapeHtml(product.id)}"` : `data-delete-product="${escapeHtml(product.id)}"`;
      return `
        <article class="admin-product-editor">
          <form class="admin-product-form" data-admin-product="${escapeHtml(product.id)}">
            <div class="admin-product-preview">
              <img src="${escapeHtml(product.image)}" alt="${escapeHtml(productAlt(product.name))}" loading="lazy" decoding="async" />
              <span>${escapeHtml(product.id)}</span>
            </div>
            <label>Name<input name="name" value="${escapeHtml(product.name)}" /></label>
            <label>Price<input name="price" type="number" min="0" step="0.01" value="${product.price ?? ""}" /></label>
            <label>Currency<input name="currency" maxlength="3" value="${escapeHtml(product.currency || "USD")}" /></label>
            <label>Description<textarea name="description" rows="3">${escapeHtml(product.description || "")}</textarea></label>
            <label>Primary Image URL<input name="image" value="${escapeHtml(product.image || "")}" placeholder="https://..." /></label>
            <label>Additional Image URLs<textarea name="customImages" rows="3" placeholder="One image URL per line">${escapeHtml(urlImages)}</textarea></label>
            <div class="admin-upload-field">
              <span>Custom Image Uploads</span>
              <label class="file-pick">Add Images<input class="file-input" name="imageFiles" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple /></label>
              <div class="admin-upload-previews" data-upload-preview>${previewImages || "<p>No custom image uploads yet.</p>"}</div>
            </div>
            <div class="admin-upload-field">
              <span>3D Mockup File</span>
              <label class="file-pick">Upload 3D Mockup<input class="file-input" name="mockup3dFile" type="file" accept=".glb,.gltf,.usdz,model/gltf-binary,model/gltf+json,application/octet-stream" /></label>
              <p class="mockup-status" data-model-preview>${product.mockup3d?.name ? `Current: ${escapeHtml(compactFileName(product.mockup3d.name))}` : "No 3D mockup uploaded."}</p>
            </div>
            <details class="file-name-details">
              <summary>View file names</summary>
              <ul>${fileNames.map((name) => `<li>${escapeHtml(name)}</li>`).join("") || "<li>No uploaded files yet.</li>"}</ul>
            </details>
            <div class="admin-product-controls">
              <button class="button primary" type="submit">Save Product</button>
              <button class="button ghost" type="button" ${hiddenAttr}>${hiddenLabel}</button>
            </div>
          </form>
        </article>
      `;
    })
    .join("") || "<p>No products loaded.</p>";
  enableLazyImages(adminProducts);
}

discountForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/admin/discounts", { method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(discountForm))) });
    discountForm.reset();
    showToast("Discount code created");
    await loadAdmin();
  } catch (error) {
    showToast(error.message);
  }
});

const adminPopupForm = document.getElementById("adminPopupForm");
if (adminPopupForm) {
  adminPopupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(adminPopupForm));
      data.enabled = adminPopupForm.enabled.checked;
      await api("/api/admin/popup-config", { method: "POST", body: JSON.stringify(data) });
      showToast("Popup configuration updated");
      await loadAdmin();
    } catch (error) {
      showToast(error.message);
    }
  });
}

syncPrintfulButton?.addEventListener("click", async () => {
  syncPrintfulButton.disabled = true;
  syncPrintfulButton.textContent = "Fetching...";
  try {
    const payload = await api("/api/admin/products/sync-printful", { method: "POST", body: "{}" });
    renderProducts(payload.products);
    showToast(payload.source === "printful" ? "Printful products refreshed" : "Printful could not refresh");
    await loadAdmin();
  } catch (error) {
    showToast(error.message);
  } finally {
    syncPrintfulButton.disabled = false;
    syncPrintfulButton.textContent = "Fetch Printful Products";
  }
});

adminProducts.addEventListener("change", async (event) => {
  const input = event.target.closest('input[type="file"]');
  if (!input) return;
  const form = input.closest(".admin-product-form");
  if (!form) return;
  if (input.name === "imageFiles") {
    const preview = form.querySelector("[data-upload-preview]");
    const files = Array.from(input.files || []).filter((file) => file.type.startsWith("image/"));
    preview.innerHTML = files.length
      ? files
          .map((file) => `<figure><img src="${URL.createObjectURL(file)}" alt="${escapeHtml(compactFileName(file.name))}" /></figure>`)
          .join("")
      : "<p>No custom image uploads selected.</p>";
  }
  if (input.name === "mockup3dFile") {
    const status = form.querySelector("[data-model-preview]");
    const file = input.files?.[0];
    status.textContent = file ? "3D mockup selected. Save product to attach." : "No 3D mockup selected.";
  }
});

adminProducts.addEventListener("submit", async (event) => {
  const form = event.target.closest(".admin-product-form");
  if (!form) return;
  event.preventDefault();
  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) submitButton.disabled = true;
  try {
    const data = Object.fromEntries(new FormData(form));
    const existingProduct = products[form.dataset.adminProduct] || {};
    const preservedUploads = (existingProduct.customImageItems || [])
      .map(normalizeCustomImageItem)
      .filter((item) => isDataUrl(item.url));
    const customImages = String(data.customImages || "")
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
    const uploadedImages = await filesToDataUrls(form.elements.imageFiles?.files || []);
    const mockup3d = await fileToDataUrl(form.elements.mockup3dFile?.files?.[0], { maxSize: 3_000_000 });
    await api(`/api/admin/products/${encodeURIComponent(form.dataset.adminProduct)}`, {
      method: "PUT",
      body: JSON.stringify({
        name: data.name,
        price: data.price,
        currency: data.currency,
        description: data.description,
        image: data.image,
        customImages: [...customImages, ...preservedUploads, ...uploadedImages],
        mockup3d: mockup3d || existingProduct.mockup3d || null
      })
    });
    showToast("Product synced to storefront");
    await loadProducts();
    await loadAdmin();
  } catch (error) {
    showToast(error.message);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

function filesToDataUrls(fileList) {
  const files = Array.from(fileList).filter((file) => file.type.startsWith("image/") && file.size <= 900000).slice(0, 6);
  return Promise.all(files.map((file) => fileToDataUrl(file, { maxSize: 900000 })));
}

function fileToDataUrl(file, { maxSize }) {
  if (!file) return Promise.resolve(null);
  if (file.size > maxSize) {
    return Promise.reject(new Error(`${file.name} is too large. Use a smaller optimized file.`));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ url: reader.result, name: file.name, type: file.type });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

generateCodeButton.addEventListener("click", () => {
  const code = `ECI-${randomChunk()}-${randomChunk()}`;
  discountForm.code.value = code;
});

function randomChunk() {
  return Math.random().toString(36).slice(2, 6).toUpperCase();
}

adminModal.addEventListener("click", async (event) => {
  const codeButton = event.target.closest("[data-delete-code]");
  const productButton = event.target.closest("[data-delete-product]");
  const restoreButton = event.target.closest("[data-restore-product]");
  const printButton = event.target.closest("[data-print-gift]");
  const sendButton = event.target.closest("[data-send-gift]");
  try {
    if (printButton || sendButton) {
      const code = (printButton || sendButton).dataset.printGift || (printButton || sendButton).dataset.sendGift;
      const payload = await api("/api/admin/overview");
      const gift = payload.discountCodes.find((discount) => discount.code === code);
      if (!gift) return;
      if (printButton) {
        const printSection = document.getElementById("printSection");
        const printAmount = document.getElementById("printAmount");
        const printCode = document.getElementById("printCode");
        
        printCode.textContent = gift.code;
        printAmount.textContent = gift.type === "fixed" ? money(gift.value, payload.analytics.currency || "GBP") : `${gift.value}% OFF`;
        
        // Populate and print
        window.print();
      }
      if (sendButton) {
        const subject = encodeURIComponent(`Your ECI UNIVERSE Gift Card`);
        const body = encodeURIComponent(`Hello! You've received a gift card from Emmanuel CI Universe.\n\nCode: ${gift.code}\nValue: ${gift.type === "fixed" ? money(gift.value, payload.analytics.currency || "GBP") : `${gift.value}% OFF`}\n\nRedeem it at: ${location.origin}`);
        const mailtoUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(gift.recipientEmail || "")}&su=${subject}&body=${body}`;
        
        // Try to open Gmail directly if it's a browser, or fallback to mailto
        const win = window.open(mailtoUrl, "_blank");
        if (!win || win.closed || typeof win.closed === "undefined") {
          location.href = `mailto:${encodeURIComponent(gift.recipientEmail || "")}?subject=${subject}&body=${body}`;
        }
      }
      return;
    }
    if (codeButton) {
      await api(`/api/admin/discounts/${encodeURIComponent(codeButton.dataset.deleteCode)}`, { method: "DELETE" });
      showToast("Discount code deleted");
      await loadAdmin();
    }
    if (productButton) {
      await api(`/api/admin/products/${encodeURIComponent(productButton.dataset.deleteProduct)}`, { method: "DELETE" });
      showToast("Product hidden from storefront");
      await loadProducts();
      await loadAdmin();
    }
    if (restoreButton) {
      await api(`/api/admin/products/${encodeURIComponent(restoreButton.dataset.restoreProduct)}/restore`, { method: "POST", body: "{}" });
      showToast("Product restored to storefront");
      await loadProducts();
      await loadAdmin();
    }
  } catch (error) {
    showToast(error.message);
  }
});

function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get("payment");
  if (!payment) return;
  if (payment === "success") {
    cart = [];
    persistCart();
    showToast("Payment received. Your ECI order is being prepared.");
  }
  if (payment === "cancelled") {
    showToast("Payment cancelled. Your cart is still saved.");
    if (cartModal) openModal(cartModal);
  }
  history.replaceState({}, "", `${location.pathname}${location.hash || ""}`);
}

function setupReveals(liteMotion) {
  if (!("IntersectionObserver" in window) || liteMotion) {
    reveals.forEach((item) => item.classList.add("visible"));
    return;
  }
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );

  reveals.forEach((item, index) => {
    item.style.transitionDelay = `${Math.min(index * 55, 220)}ms`;
    revealObserver.observe(item);
  });
}

function setupParallax(liteMotion) {
  if (!stage || liteMotion || !window.matchMedia("(pointer: fine)").matches) return;
  let ticking = false;
  window.addEventListener(
    "pointermove",
    (event) => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * 2;
        const y = (event.clientY / window.innerHeight - 0.5) * 2;
        stage.style.transform = `translate3d(0,0,0) rotateY(${x * 3.6}deg) rotateX(${-y * 2.4}deg)`;
        ticking = false;
      });
    },
    { passive: true }
  );
}

function setupIntro(liteMotion) {
  const intro = document.querySelector(".intro");
  if (!intro) return;
  
  // Skip intro for bots (like Vercel screenshot bot) or if lite motion is active
  const isBot = /bot|googlebot|crawler|spider|robot|crawling|vercel/i.test(navigator.userAgent);
  
  if (liteMotion || isBot) {
    document.documentElement.classList.add("network-lite");
    canvas?.remove();
    intro.remove();
    return;
  }
  setupParticles();
  setTimeout(() => intro.remove(), 3100);
}

function setupParticles() {
  if (!canvas || !ctx) return;
  const particleTotal = window.innerWidth < 760 ? 28 : 64;
  const particles = Array.from({ length: particleTotal }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: Math.random() * 1.2 + 0.25,
    s: Math.random() * 0.18 + 0.04,
    a: Math.random() * 0.34 + 0.1
  }));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);

  function resizeCanvas() {
    canvas.width = Math.ceil(window.innerWidth * pixelRatio);
    canvas.height = Math.ceil(window.innerHeight * pixelRatio);
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  function drawParticles() {
    if (!document.hidden) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      particles.forEach((particle) => {
        particle.y -= particle.s / window.innerHeight;
        if (particle.y < -0.02) particle.y = 1.02;
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,255,255,${particle.a})`;
        ctx.arc(particle.x * window.innerWidth, particle.y * window.innerHeight, particle.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    requestAnimationFrame(drawParticles);
  }

  resizeCanvas();
  drawParticles();
  window.addEventListener("resize", resizeCanvas, { passive: true });
}

const liteMotion = shouldUseLiteMotion();
if (liteMotion) document.documentElement.classList.add("network-lite");

setNavState();
persistCart();
handlePaymentReturn();
enableLazyImages(document);
let adminPollInterval = null;
function startAdminPolling() {
  if (adminPollInterval) clearInterval(adminPollInterval);
  adminPollInterval = setInterval(loadAdmin, 30000); // 30 seconds
}

// Dynamic Pop-up Logic
async function initPopup() {
  try {
    const payload = await api("/api/products"); // Get general info which includes config fallback? No, let's use auth/me or a new endpoint.
    // Actually, let's just fetch admin overview if admin, but for normal users we need the config.
    // I'll add the config to the /api/products response in server.js.
    const config = payload.popupConfig;
    if (!config || !config.enabled || localStorage.getItem("eci_discount_shown")) return;

    setTimeout(() => {
      const popup = document.getElementById("discountPopupModal");
      if (!popup) return;
      
      popup.querySelector("h2").textContent = config.title;
      popup.querySelector("p").innerHTML = config.text;
      popup.querySelector(".discount-display span").textContent = config.code;
      
      const popupBtn = popup.querySelector(".popup-actions button");
      if (config.targetProductId) {
        popupBtn.textContent = "Claim Offer & Shop";
        popupBtn.addEventListener("click", () => {
          handleBuyNow(config.targetProductId);
          closeModal(popup);
        });
      }

      openModal(popup);
      localStorage.setItem("eci_discount_shown", "true");
    }, 5000);
  } catch (e) {
    console.warn("Popup init failed", e);
  }
}
initPopup();

const copyDiscountBtn = document.getElementById("copyDiscountBtn");
if (copyDiscountBtn) {
  copyDiscountBtn.addEventListener("click", () => {
    navigator.clipboard.writeText("ECI10").then(() => {
      copyDiscountBtn.textContent = "Copied!";
      setTimeout(() => copyDiscountBtn.textContent = "Copy", 2000);
      showToast("Discount code copied to clipboard");
    });
  });
}

loadSession();
loadProducts();
setupReveals(liteMotion);
setupParallax(liteMotion);
setupIntro(liteMotion);
window.addEventListener("scroll", setNavState, { passive: true });

// --- Gift Card & Scanner Logic ---
let scannerStream = null;
async function openScanner(target = "checkout") {
  const modal = document.getElementById("scannerModal");
  const video = document.getElementById("scannerVideo");
  openModal(modal);

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = scannerStream;
    
    // Simulate auto-capture for pro feel
    setTimeout(() => {
      if (modal.classList.contains("open")) {
        const mockCode = "ECI-" + Math.random().toString(36).substr(2, 4).toUpperCase();
        if (target === "profile") {
          document.getElementById("profileRedeemInput").value = mockCode;
        } else {
          checkoutForm.discountCode.value = mockCode;
        }
        showToast("Code captured successfully!");
        closeScanner();
      }
    }, 3500);
  } catch (err) {
    showToast("Camera access denied or unavailable.");
  }
}

function closeScanner() {
  const modal = document.getElementById("scannerModal");
  closeModal(modal);
  if (scannerStream) {
    scannerStream.getTracks().forEach(track => track.stop());
    scannerStream = null;
  }
}

async function applyGiftCard(source) {
  const input = source === "profile" ? document.getElementById("profileRedeemInput") : checkoutForm.discountCode;
  const code = input.value.trim();
  if (!code) return;
  
  try {
    const payload = await api("/api/discounts/preview", {
      method: "POST",
      body: JSON.stringify({ items: cart, discountCode: code })
    });
    if (payload.valid) {
      showToast(`Success! ${payload.discount.code} applied.`);
      if (source !== "profile") updateCheckoutSummary(code);
    } else {
      showToast("Invalid or expired gift card.");
    }
  } catch (e) {
    showToast("Check failed. Please try again.");
  }
}

// Global scope for HTML onclicks
window.openScanner = openScanner;
window.applyGiftCard = applyGiftCard;
