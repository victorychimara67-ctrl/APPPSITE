// ... existing code before renderProducts ...

function renderProducts(productList) {
  console.log("renderProducts: Rendering", productList.length, "items");
  if (!productGrid) {
    console.error("renderProducts: #productGrid element not found!");
    return;
  }
  if (!Array.isArray(productList)) {
    console.error("renderProducts: Expected array, got", typeof productList);
    productList = [];
  }
  allProducts = productList;
  
  try {
    // Index products for fast lookup
    const indexed = {};
    productList.forEach(p => { if (p && p.id) indexed[p.id] = p; });
    Object.assign(products, indexed);
  } catch (e) {
    console.warn("Failed to index products", e);
  }
  
  if (!productList.length) {
    productGrid.innerHTML = '<div class="product-empty">No ECI products found. Please ensure your Printful products are synced and not hidden.</div>';
    return;
  }

  try {
    productGrid.innerHTML = productList
      .map((product) => {
        try {
          return `
            <article class="product-card reveal" onclick="openProductDetail('${product.id}')" role="button" aria-label="View ${escapeHtml(product.name)}">
              <img src="${escapeHtml(product.image)}" alt="${escapeHtml(productAlt(product.name))}" loading="lazy" decoding="async" />
              <div>
                <h3>${escapeHtml(product.name)}</h3>
                <p>${money(product.price, product.currency || "USD")}</p>
                ${renderVariantSelect(product)}
              </div>
              <div class="product-actions">
                <button class="button primary mini" onclick="event.stopPropagation(); addToCart('${product.id}')">ADD TO CART</button>
              </div>
            </article>
          `;
        } catch (itemErr) {
          console.warn("Skipping malformed product", product.id, itemErr);
          return "";
        }
      })
      .join("");
    
    if (!productGrid.innerHTML) {
      productGrid.innerHTML = '<div class="product-empty">No valid products could be displayed.</div>';
    }
    
    enableLazyImages(productGrid);
  } catch (globalErr) {
    console.error("Critical rendering failure", globalErr);
    productGrid.innerHTML = '<div class="product-empty">A technical error occurred while loading the collection.</div>';
  }
}

async function loadProducts() {
  try {
    console.log("loadProducts: Fetching from API...");
    const payload = await getProductsData();
    console.log("loadProducts: API Success", payload.source);
    renderProducts(payload.products || []);
  } catch (error) {
    console.warn("Product API failed, using local fallback.", error);
    renderProducts(Object.values(products));
  }
}

async function loadSession() {
  try {
    const payload = await api("/api/auth/me");
    currentUser = payload.user;
    updateUserUI();
  } catch (err) {
    currentUser = null;
    updateUserUI();
  }
}

function updateUserUI() {
  if (currentUser) {
    accountName.textContent = currentUser.name;
    accountPanel.classList.remove("hidden");
    profileButton.classList.add("logged-in");
    if (currentUser.role === "admin") adminButton.classList.remove("hidden");
  } else {
    accountPanel.classList.add("hidden");
    profileButton.classList.remove("logged-in");
    adminButton.classList.add("hidden");
  }
}

function renderVariantSelect(product) {
  if (!product.variants || product.variants.length <= 1) return "";
  return `
    <select class="variant-select" onchange="updateProductVariant('${product.id}', this.value)" onclick="event.stopPropagation()">
      ${product.variants.map(v => `<option value="${v.id}">${escapeHtml(v.name)} - ${money(v.price, product.currency)}</option>`).join("")}
    </select>
  `;
}

function updateProductVariant(productId, variantId) {
  const product = allProducts.find(p => p.id === productId);
  if (!product || !product.variants) return;
}

async function openProductDetail(id) {
  const product = allProducts.find(p => p.id === id) || products[id];
  if (!product) return;
  currentProduct = product;
  detailTitle.textContent = product.name;
  detailPrice.textContent = money(product.price, product.currency);
  detailDescription.textContent = product.description || "Premium ECI streetwear silhouette.";
  detailMainImage.src = product.image;
  openModal(productModal);
}

function addToCart(id) {
  const product = allProducts.find(p => p.id === id) || products[id];
  if (!product) return;
  const existing = cart.find(item => item.productId === id);
  if (existing) {
    existing.quantity++;
  } else {
    cart.push({
      productId: product.id,
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
