const nav = document.querySelector(".nav");
const stage = document.querySelector("[data-parallax]");
const reveals = document.querySelectorAll(".reveal");
const canvas = document.getElementById("particles");
const ctx = canvas.getContext("2d");

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
const detailViewer = document.getElementById("detailViewer");
const mockupStrip = document.getElementById("mockupStrip");
const discountForm = document.getElementById("discountForm");
const adminStats = document.getElementById("adminStats");
const adminUsers = document.getElementById("adminUsers");
const adminOrders = document.getElementById("adminOrders");
const adminDiscounts = document.getElementById("adminDiscounts");
const adminProducts = document.getElementById("adminProducts");
const searchButton = document.getElementById("searchButton");
const searchModal = document.getElementById("searchModal");
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
const generateCodeButton = document.getElementById("generateCodeButton");
const printGiftCode = document.getElementById("printGiftCode");
const printGiftValue = document.getElementById("printGiftValue");
const printGiftMessage = document.getElementById("printGiftMessage");

let currentUser = null;
let cart = JSON.parse(localStorage.getItem("minimal-cart") || "[]");
let currentDetailProduct = null;
let allProducts = [];

let products = {
  hoodie: { id: "hoodie", name: "Essential Hoodie", price: 89.99, image: "assets/product-hoodie.png" },
  tee: { id: "tee", name: "Minimal Tee", price: 49.99, image: "assets/product-tee.png" },
  jacket: { id: "jacket", name: "Puffer Jacket", price: 129.99, image: "assets/product-jacket.png" },
  cap: { id: "cap", name: "Minimal Cap", price: 29.99, image: "assets/product-cap.png" },
  pants: { id: "pants", name: "Cargo Pants", price: 79.99, image: "assets/product-pants.png" },
  sneakers: { id: "sneakers", name: "Core Sneakers", price: 119.99, image: "assets/product-sneakers.png" }
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
  localStorage.setItem("minimal-cart", JSON.stringify(cart));
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

function money(value, currency = "USD") {
  if (value === null || value === undefined) return "Price on Printful";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

function normalizeCheckoutCountry(value) {
  const raw = String(value || "").trim().toUpperCase();
  const aliases = { UK: "GB", "U.K.": "GB", "UNITED KINGDOM": "GB", ENGLAND: "GB", SCOTLAND: "GB", WALES: "GB" };
  return aliases[raw] || raw;
}

function renderProducts(productList) {
  allProducts = productList;
  products = Object.fromEntries(productList.map((product) => [product.id, product]));
  productGrid.innerHTML = productList
    .map(
      (product) => `
        <article class="product-card reveal visible" data-product-id="${product.id}">
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <p>${money(product.price, product.currency)}</p>
            ${renderVariantSelect(product)}
          </div>
          <button aria-label="Add ${escapeHtml(product.name)} to cart">+</button>
        </article>
      `
    )
    .join("");
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
    if (payload.source === "printful") showToast("Live Printful products loaded");
    const productPath = location.pathname.match(/^\/product\/(.+)$/);
    if (productPath) openProductDetail(decodeURIComponent(productPath[1]), false);
  } catch (error) {
    showToast(`Could not load Printful products: ${error.message}`);
  }
}

function renderCart() {
  persistCart();
  if (!cart.length) {
    cartItems.innerHTML = '<div class="cart-empty">Your cart is empty. Add a piece from the collection first.</div>';
    checkoutForm.style.display = "none";
    return;
  }
  checkoutForm.style.display = "grid";
  cartItems.innerHTML = cart
    .map((item) => {
      const product = products[item.productId] || item;
      const displayName = item.name || product.name;
      const price = item.price ?? product.price;
      const currency = item.currency || product.currency || "USD";
      const image = item.image || product.image;
      const linePrice = price ? money(price * item.quantity, currency) : "Printful item";
      return `
        <div class="cart-row" data-product-id="${item.productId}" data-variant-id="${item.printfulVariantId || ""}">
          <img src="${escapeHtml(image)}" alt="${escapeHtml(displayName)}" />
          <div>
            <strong>${escapeHtml(displayName)}</strong>
            <span>${money(price, currency)} - ${linePrice}</span>
          </div>
          <div class="quantity-tools">
            <button type="button" data-qty="-1" aria-label="Decrease ${escapeHtml(displayName)}">-</button>
            <span>${item.quantity}</span>
            <button type="button" data-qty="1" aria-label="Increase ${escapeHtml(displayName)}">+</button>
          </div>
        </div>
      `;
    })
    .join("");
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
  } else {
    document.querySelector(".auth-tabs").classList.remove("hidden");
    accountPanel.classList.add("hidden");
    loginForm.classList.remove("hidden");
  }
}

async function loadSession() {
  const payload = await api("/api/auth/me");
  currentUser = payload.user;
  updateAuthUi();
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

profileButton.addEventListener("click", () => openModal(authModal));
cartButton.addEventListener("click", () => {
  renderCart();
  openModal(cartModal);
});

productGrid.addEventListener("click", (event) => {
  const card = event.target.closest(".product-card");
  if (!card) return;
  if (!event.target.closest("button") && !event.target.closest("select")) {
    openProductDetail(card.dataset.productId);
    return;
  }
  const button = event.target.closest(".product-card button");
  if (!button) return;
  const productId = card.dataset.productId;
  addToCart(productId, card.querySelector(".variant-select")?.value || "");
});

function addToCart(productId, selectedVariantId = "") {
  const product = products[productId];
  const variantId = selectedVariantId || product?.printfulVariantId || "";
  const selectedVariant = product?.variants?.find((variant) => variant.id === variantId);
  const existing = cart.find((item) => item.productId === productId && item.printfulVariantId === variantId);
  if (existing) existing.quantity += 1;
  else {
    cart.push({
      productId,
      quantity: 1,
      printfulVariantId: variantId,
      name: selectedVariant?.name || product?.name || "Product",
      price: selectedVariant?.price ?? product?.price ?? null,
      currency: selectedVariant?.currency || product?.currency || "USD",
      image: selectedVariant?.image || product?.image || "assets/reference-showroom.png"
    });
  }
  persistCart();
  showToast(`${product?.name || "Product"} added to cart`);
}

async function openProductDetail(productId, pushUrl = true) {
  try {
    const payload = await api(`/api/products/${encodeURIComponent(productId)}`);
    currentDetailProduct = payload.product;
    const images = currentDetailProduct.images?.length ? currentDetailProduct.images : [currentDetailProduct.image];
    detailTitle.textContent = currentDetailProduct.name;
    detailPrice.textContent = money(currentDetailProduct.price, currentDetailProduct.currency);
    detailDescription.textContent = currentDetailProduct.description || "Premium ECI print-on-demand piece with live Printful mockups and selectable variants.";
    detailMainImage.src = images[0];
    detailMainImage.alt = currentDetailProduct.name;
    detailVariant.innerHTML = (currentDetailProduct.variants || [])
      .map((variant) => `<option value="${escapeHtml(variant.id)}">${escapeHtml(variant.name.replace(`${currentDetailProduct.name} / `, ""))}</option>`)
      .join("");
    detailVariant.disabled = !currentDetailProduct.variants?.length;
    mockupStrip.innerHTML = images
      .map((image, index) => `<button class="${index === 0 ? "active" : ""}" data-image="${escapeHtml(image)}"><img src="${escapeHtml(image)}" alt="Mockup ${index + 1}" /></button>`)
      .join("");
    detailViewer.classList.remove("spinning");
    if (pushUrl && location.pathname !== `/product/${encodeURIComponent(productId)}`) {
      history.pushState({ productId }, "", `/product/${encodeURIComponent(productId)}`);
    }
    openModal(productModal);
  } catch (error) {
    showToast(error.message);
  }
}

mockupStrip.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  mockupStrip.querySelectorAll("button").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");
  detailMainImage.src = button.dataset.image;
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
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />
        <span><strong>${escapeHtml(product.name)}</strong><small>${money(product.price, product.currency)}</small></span>
      </button>
    `)
    .join("") || '<p class="cart-empty">No products found.</p>';
}

searchResults.addEventListener("click", (event) => {
  const result = event.target.closest("[data-search-product]");
  if (!result) return;
  closeModal(searchModal);
  openProductDetail(result.dataset.searchProduct);
});

cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-qty]");
  if (!button) return;
  const row = button.closest(".cart-row");
  const productId = row.dataset.productId;
  const variantId = row.dataset.variantId;
  const item = cart.find((entry) => entry.productId === productId && (entry.printfulVariantId || "") === variantId);
  if (!item) return;
  item.quantity += Number(button.dataset.qty);
  cart = cart.filter((entry) => entry.quantity > 0);
  renderCart();
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

checkoutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
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
  try {
    const formData = Object.fromEntries(new FormData(checkoutForm));
    const { discountCode, ...recipient } = formData;
    recipient.country_code = normalizeCheckoutCountry(recipient.country_code);
    if (!["US", "CA", "AU"].includes(recipient.country_code)) recipient.state_code = "";
    const payload = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({ recipient, items: cart, discountCode })
    });
    cart = [];
    renderCart();
    showToast(payload.order.status === "draft_in_printful" ? "Printful draft order created" : "Order saved");
  } catch (error) {
    showToast(error.message);
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
    adminStats.innerHTML = `
      <div><strong>${payload.analytics.users}</strong><span>Users</span></div>
      <div><strong>${payload.analytics.orders}</strong><span>Orders</span></div>
      <div><strong>${payload.analytics.products}</strong><span>Live Products</span></div>
      <div><strong>${money(payload.analytics.revenue, currency)}</strong><span>Earnings</span></div>
    `;
    adminUsers.innerHTML = payload.users.map((user) => `<article><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.email)} - ${user.orderCount} orders${user.isAdmin ? " - admin" : ""}</span></article>`).join("") || "<p>No users yet.</p>";
    adminOrders.innerHTML = payload.orders.map((order) => `<article><strong>${escapeHtml(order.status)}</strong><span>${escapeHtml(order.recipient?.email || "")} - ${money(order.total || 0, order.currency || currency)}</span></article>`).join("") || "<p>No orders yet.</p>";
    adminDiscounts.innerHTML = payload.discountCodes.map((discount) => `
      <article>
        <strong>${escapeHtml(discount.code)}${discount.isGiftCard ? " - gift card" : ""}</strong>
        <span>${discount.type} - ${discount.value}${discount.recipientEmail ? ` - ${escapeHtml(discount.recipientEmail)}` : ""}</span>
        <button data-print-gift="${escapeHtml(discount.code)}">Print</button>
        <button data-send-gift="${escapeHtml(discount.code)}">Send</button>
        <button data-delete-code="${escapeHtml(discount.code)}">Delete</button>
      </article>
    `).join("") || "<p>No discount codes yet.</p>";
    adminProducts.innerHTML = Object.values(products).map((product) => `<article><strong>${escapeHtml(product.name)}</strong><span>${money(product.price, product.currency)}</span><button data-delete-product="${escapeHtml(product.id)}">Delete</button></article>`).join("") || "<p>No products loaded.</p>";
  } catch (error) {
    showToast(error.message);
  }
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
  const printButton = event.target.closest("[data-print-gift]");
  const sendButton = event.target.closest("[data-send-gift]");
  try {
    if (printButton || sendButton) {
      const code = (printButton || sendButton).dataset.printGift || (printButton || sendButton).dataset.sendGift;
      const payload = await api("/api/admin/overview");
      const gift = payload.discountCodes.find((discount) => discount.code === code);
      if (!gift) return;
      if (printButton) {
        printGiftCode.textContent = gift.code;
        printGiftValue.textContent = gift.type === "fixed" ? money(gift.value, payload.analytics.currency || "GBP") : `${gift.value}% off`;
        printGiftMessage.textContent = gift.message || "A gift from Emmanuel CI Universe";
        window.print();
      }
      if (sendButton) {
        const subject = encodeURIComponent(`Your Emmanuel CI Universe gift card: ${gift.code}`);
        const body = encodeURIComponent(`${gift.message || "A gift from Emmanuel CI Universe"}\n\nCode: ${gift.code}\nValue: ${gift.type === "fixed" ? money(gift.value, payload.analytics.currency || "GBP") : `${gift.value}% off`}\n\nUse it at ${location.origin}`);
        location.href = `mailto:${encodeURIComponent(gift.recipientEmail || "")}?subject=${subject}&body=${body}`;
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
  } catch (error) {
    showToast(error.message);
  }
});

setNavState();
persistCart();
loadSession().catch(() => {});
loadProducts();
window.addEventListener("scroll", setNavState, { passive: true });

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
  item.style.transitionDelay = `${Math.min(index * 55, 280)}ms`;
  revealObserver.observe(item);
});

window.addEventListener(
  "pointermove",
  (event) => {
    if (!stage) return;
    const x = (event.clientX / window.innerWidth - 0.5) * 2;
    const y = (event.clientY / window.innerHeight - 0.5) * 2;
    stage.style.setProperty("--mx", x.toFixed(3));
    stage.style.setProperty("--my", y.toFixed(3));
    stage.style.transform = `rotateY(${x * 3.6}deg) rotateX(${-y * 2.4}deg)`;
  },
  { passive: true }
);

const particles = Array.from({ length: 84 }, () => ({
  x: Math.random(),
  y: Math.random(),
  r: Math.random() * 1.4 + 0.25,
  s: Math.random() * 0.22 + 0.05,
  a: Math.random() * 0.45 + 0.12
}));

function resizeCanvas() {
  canvas.width = window.innerWidth * window.devicePixelRatio;
  canvas.height = window.innerHeight * window.devicePixelRatio;
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
}

function drawParticles() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles.forEach((particle) => {
    particle.y -= particle.s / window.innerHeight;
    if (particle.y < -0.02) particle.y = 1.02;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,255,255,${particle.a})`;
    ctx.arc(particle.x * window.innerWidth, particle.y * window.innerHeight, particle.r, 0, Math.PI * 2);
    ctx.fill();
  });
  requestAnimationFrame(drawParticles);
}

resizeCanvas();
drawParticles();
window.addEventListener("resize", resizeCanvas);

setTimeout(() => {
  document.querySelector(".intro")?.remove();
}, 3300);
