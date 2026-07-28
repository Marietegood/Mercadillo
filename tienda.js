(function initStorefront() {
  const CART_KEY = "mercadillo_cart_v2";
  let activeCategory = "todos";
  let query = "";
  let cart = readCart();
  let toastTimer;
  let lastImageTrigger = null;

  const refs = {
    grid: document.getElementById("product-grid"),
    tabs: document.getElementById("category-tabs"),
    search: document.getElementById("search-input"),
    resultCount: document.getElementById("result-count"),
    clearFilters: document.getElementById("clear-filters"),
    empty: document.getElementById("empty-state"),
    cartCount: document.getElementById("cart-count"),
    cartDrawer: document.getElementById("cart-drawer"),
    cartBackdrop: document.getElementById("drawer-backdrop"),
    cartContent: document.getElementById("cart-content"),
    cartTotal: document.getElementById("cart-total"),
    checkoutButton: document.getElementById("checkout-button"),
    welcome: document.getElementById("welcome-dialog"),
    checkout: document.getElementById("checkout-dialog"),
    orderForm: document.getElementById("order-form"),
    orderPreview: document.getElementById("order-preview"),
    feedback: document.getElementById("form-feedback"),
    submitOrder: document.getElementById("submit-order"),
    success: document.getElementById("success-dialog"),
    successMessage: document.getElementById("success-message"),
    orderCode: document.getElementById("order-code"),
    imageViewer: document.getElementById("image-viewer-dialog"),
    imageViewerImage: document.getElementById("image-viewer-image"),
    imageViewerTitle: document.getElementById("image-viewer-title"),
    toast: document.getElementById("toast"),
  };

  function readCart() {
    try {
      const ids = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(ids) ? ids.filter((id) => window.getProduct(id)) : [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    cart = cart.filter((id) => {
      const product = window.getProduct(id);
      return product && product.active !== false && product.quantity > 0;
    });
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
    renderCart();
    renderProducts();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function unitsFor(category) {
    return window.CATALOG.filter((product) => category === "todos" || product.category === category).reduce(
      (total, product) => total + product.quantity,
      0,
    );
  }

  function renderTabs() {
    refs.tabs.innerHTML = window.CATEGORIES.map((category) => {
      const selected = activeCategory === category.id;
      return `
        <button
          class="category-tab"
          type="button"
          role="tab"
          aria-selected="${selected}"
          data-category="${category.id}"
        >
          <span aria-hidden="true">${category.icon}</span>
          ${escapeHtml(category.label)}
          <span class="tab-count">${unitsFor(category.id)}</span>
        </button>`;
    }).join("");

    refs.tabs.querySelectorAll("[data-category]").forEach((button) => {
      button.addEventListener("click", () => {
        activeCategory = button.dataset.category;
        renderTabs();
        renderProducts();
      });
    });
  }

  function filteredProducts() {
    const normalizedQuery = normalize(query);
    return window.CATALOG.filter((product) => {
      const categoryMatch = activeCategory === "todos" || product.category === activeCategory;
      const text = normalize(`${product.name} ${product.note} ${window.categoryLabel(product.category)}`);
      return categoryMatch && (!normalizedQuery || text.includes(normalizedQuery));
    });
  }

  function renderProducts() {
    const products = filteredProducts();
    const units = products.reduce((total, product) => total + product.quantity, 0);
    refs.resultCount.textContent = `${products.length} ${products.length === 1 ? "referencia" : "referencias"} · ${units} ${
      units === 1 ? "unidad" : "unidades"
    }`;
    refs.grid.hidden = products.length === 0;
    refs.empty.hidden = products.length !== 0;
    refs.clearFilters.hidden = activeCategory === "todos" && !query;

    refs.grid.innerHTML = products
      .map((product) => {
        const added = cart.includes(product.id);
        const category = window.categoryLabel(product.category);
        const badge =
          product.category === "averiado"
            ? '<span class="product-badge warning">Averiado · sin garantía</span>'
            : product.raffle
              ? '<span class="product-badge">Sujeto a sorteo</span>'
              : '<span class="product-badge">Asignación directa</span>';
        const media = product.image
          ? `<button
              class="product-image-button"
              type="button"
              data-view-image="${escapeHtml(product.id)}"
              aria-label="Ampliar fotografía de ${escapeHtml(product.name)}"
            >
              <img
                src="${escapeHtml(product.image)}"
                alt="${escapeHtml(product.name)}"
                loading="lazy"
                draggable="false"
                style="${window.productImageStyle(product)}"
              />
            </button>`
          : `<div class="placeholder-media" data-code="${escapeHtml(product.id.toUpperCase())}" role="img" aria-label="${escapeHtml(product.name)}">${product.icon || "✦"}</div>`;
        const quantity = product.quantity > 1 ? ` · ${product.quantity} unidades` : "";
        const unavailable = product.quantity < 1;
        return `
          <article class="product-card ${unavailable ? "unavailable" : ""}">
            <div class="product-media">
              ${badge}
              ${media}
            </div>
            <div class="product-body">
              <p class="product-category">${escapeHtml(category)}${quantity}</p>
              <h3>${escapeHtml(product.name)}</h3>
              <p class="product-note">${escapeHtml(product.note)}</p>
              <div class="product-footer">
                <div class="price">
                  <strong>${product.price} €</strong>
                  <span>aportación sugerida</span>
                </div>
                <button class="add-button ${added ? "added" : ""}" type="button" data-add="${product.id}" ${unavailable ? "disabled" : ""}>
                  ${unavailable ? "Agotado" : added ? "✓ Añadido" : product.raffle ? "Participar" : "Solicitar"}
                </button>
              </div>
            </div>
          </article>`;
      })
      .join("");

    refs.grid.querySelectorAll("[data-add]").forEach((button) => {
      button.addEventListener("click", () => toggleCartItem(button.dataset.add));
    });
    refs.grid.querySelectorAll("[data-view-image]").forEach((button) => {
      button.addEventListener("click", () => openImageViewer(button.dataset.viewImage, button));
    });
  }

  function openImageViewer(productId, trigger) {
    const product = window.getProduct(productId);
    if (!product?.image) return;
    lastImageTrigger = trigger || null;
    refs.imageViewerImage.src = product.image;
    refs.imageViewerImage.alt = product.name;
    refs.imageViewerTitle.textContent = product.name;
    refs.imageViewer.showModal();
    document.getElementById("close-image-viewer").focus();
  }

  function closeImageViewer() {
    if (!refs.imageViewer.open) return;
    refs.imageViewer.close();
    refs.imageViewerImage.removeAttribute("src");
    lastImageTrigger?.focus();
    lastImageTrigger = null;
  }

  function toggleCartItem(productId) {
    const product = window.getProduct(productId);
    if (!product || product.active === false || product.quantity < 1) return;
    if (cart.includes(productId)) {
      cart = cart.filter((id) => id !== productId);
      showToast(`${product.name} eliminado de tu selección`);
    } else {
      cart.push(productId);
      showToast(`${product.name} añadido`);
    }
    saveCart();
  }

  function renderCart() {
    const products = cart.map(window.getProduct).filter(Boolean);
    refs.cartCount.textContent = String(products.length);
    refs.checkoutButton.disabled = products.length === 0;
    refs.cartTotal.textContent = `${products.reduce((total, product) => total + product.price, 0)} €`;

    if (!products.length) {
      refs.cartContent.innerHTML = `
        <div class="cart-empty">
          <span aria-hidden="true">＋</span>
          <h3>Tu selección está vacía</h3>
          <p>Añade productos del catálogo para registrar tu solicitud.</p>
        </div>`;
      return;
    }

    refs.cartContent.innerHTML = products
      .map((product) => {
        const thumb = product.image
          ? `<img src="${escapeHtml(product.image)}" alt="" />`
          : `<span aria-hidden="true">${product.icon || "✦"}</span>`;
        return `
          <article class="cart-item">
            <div class="cart-thumb">${thumb}</div>
            <div>
              <h3>${escapeHtml(product.name)}</h3>
              <p>${product.raffle ? "Participación en sorteo" : "Solicitud por disponibilidad"} · ${product.price} €</p>
            </div>
            <button class="remove-button" data-remove="${product.id}" type="button" aria-label="Quitar ${escapeHtml(product.name)}">×</button>
          </article>`;
      })
      .join("");

    refs.cartContent.querySelectorAll("[data-remove]").forEach((button) => {
      button.addEventListener("click", () => toggleCartItem(button.dataset.remove));
    });
  }

  function openCart() {
    refs.cartBackdrop.hidden = false;
    refs.cartDrawer.classList.add("open");
    refs.cartDrawer.setAttribute("aria-hidden", "false");
    document.body.classList.add("no-scroll");
    document.getElementById("close-cart").focus();
  }

  function closeCart() {
    refs.cartDrawer.classList.remove("open");
    refs.cartDrawer.setAttribute("aria-hidden", "true");
    refs.cartBackdrop.hidden = true;
    document.body.classList.remove("no-scroll");
  }

  function openCheckout() {
    const products = cart.map(window.getProduct).filter(Boolean);
    if (!products.length) return;
    refs.orderPreview.innerHTML = `
      <strong>${products.length} ${products.length === 1 ? "artículo seleccionado" : "artículos seleccionados"}</strong>
      ${escapeHtml(products.map((product) => product.name).join(" · "))}
    `;
    refs.feedback.textContent = "";
    closeCart();
    refs.checkout.showModal();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const products = cart.map(window.getProduct).filter(Boolean);
    if (!products.length) {
      refs.feedback.textContent = "Tu selección está vacía.";
      return;
    }

    const data = new FormData(refs.orderForm);
    const order = {
      firstName: String(data.get("firstName") || "").trim(),
      lastName: String(data.get("lastName") || "").trim(),
      email: String(data.get("email") || "").trim(),
      department: String(data.get("department") || "").trim(),
      notes: String(data.get("notes") || "").trim(),
      acceptedRules: data.get("acceptRules") === "on",
      items: products.map((product) => ({
        productId: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
        raffle: product.raffle,
      })),
    };

    if (!order.firstName || !order.lastName || !order.acceptedRules) {
      refs.feedback.textContent = "Completa nombre, apellidos y aceptación de las reglas.";
      return;
    }

    refs.submitOrder.disabled = true;
    refs.submitOrder.textContent = "Enviando…";
    refs.feedback.textContent = "";

    try {
      const result = await window.MercadilloApi.createOrder(order);
      const saved = result.order || order;
      const code = saved.id || "Solicitud registrada";
      cart = [];
      saveCart();
      refs.orderForm.reset();
      refs.checkout.close();
      refs.orderCode.textContent = code;
      refs.successMessage.textContent =
        "Tu selección ha quedado guardada. Te contactaremos cuando se complete la asignación o el sorteo.";
      refs.success.showModal();
    } catch (error) {
      refs.feedback.textContent = error.message || "No hemos podido registrar la solicitud. Inténtalo de nuevo.";
    } finally {
      refs.submitOrder.disabled = false;
      refs.submitOrder.textContent = "Enviar mi solicitud";
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.add("show");
    toastTimer = setTimeout(() => refs.toast.classList.remove("show"), 2400);
  }

  async function boot() {
    await window.MercadilloApi.detectMode();
    try {
      window.setCatalog(await window.MercadilloApi.getProducts());
      cart = readCart();
    } catch (error) {
      showToast(`No se ha podido actualizar el catálogo: ${error.message}`);
    }
    const config = window.MERCADILLO_CONFIG || {};
    const associationCopy = document.getElementById("association-copy");
    if (config.associationText) associationCopy.textContent = config.associationText;
    const contact = document.getElementById("contact-link");
    if (config.contactEmail) {
      contact.href = `mailto:${config.contactEmail}`;
      contact.textContent = config.contactEmail;
    }
    const totalUnits = window.CATALOG.reduce((total, product) => total + Math.max(0, product.quantity), 0);
    const heroStock = document.getElementById("hero-stock");
    if (heroStock) heroStock.textContent = String(totalUnits);

    renderTabs();
    renderProducts();
    renderCart();

    if (!sessionStorage.getItem("mercadillo_welcome_seen")) {
      refs.welcome.showModal();
    }
  }

  refs.search.addEventListener("input", () => {
    query = refs.search.value.trim();
    renderProducts();
  });

  refs.clearFilters.addEventListener("click", () => {
    activeCategory = "todos";
    query = "";
    refs.search.value = "";
    renderTabs();
    renderProducts();
  });

  document.getElementById("open-cart").addEventListener("click", openCart);
  document.getElementById("close-cart").addEventListener("click", closeCart);
  refs.cartBackdrop.addEventListener("click", closeCart);
  refs.checkoutButton.addEventListener("click", openCheckout);
  document.getElementById("close-checkout").addEventListener("click", () => refs.checkout.close());
  document.getElementById("accept-welcome").addEventListener("click", () => {
    sessionStorage.setItem("mercadillo_welcome_seen", "1");
    refs.welcome.close();
  });
  document.getElementById("close-success").addEventListener("click", () => refs.success.close());
  document.getElementById("close-image-viewer").addEventListener("click", closeImageViewer);
  refs.imageViewer.addEventListener("click", (event) => {
    if (event.target === refs.imageViewer) closeImageViewer();
  });
  refs.imageViewer.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeImageViewer();
  });
  refs.orderForm.addEventListener("submit", handleSubmit);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && refs.cartDrawer.classList.contains("open")) closeCart();
  });

  boot();
})();
