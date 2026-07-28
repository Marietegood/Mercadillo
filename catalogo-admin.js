(function initCatalogManager() {
  let products = [];
  let query = "";
  let categoryFilter = "todos";
  let statusFilter = "todos";
  let editingId = null;
  let deleteId = null;
  let imageData = "";
  let removeImage = false;
  let imageZoom = 1;
  let imageX = 0;
  let imageY = 0;
  let imageDrag = null;
  let toastTimer;

  const refs = {
    modePill: document.getElementById("mode-pill"),
    modeLabel: document.getElementById("mode-label"),
    grid: document.getElementById("manager-product-grid"),
    empty: document.getElementById("products-empty"),
    search: document.getElementById("product-search"),
    categoryFilter: document.getElementById("product-category-filter"),
    statusFilter: document.getElementById("product-status-filter"),
    countLabel: document.getElementById("product-count-label"),
    login: document.getElementById("login-dialog"),
    loginForm: document.getElementById("login-form"),
    loginFeedback: document.getElementById("login-feedback"),
    dialog: document.getElementById("product-dialog"),
    form: document.getElementById("product-form"),
    formTitle: document.getElementById("product-form-title"),
    formEyebrow: document.getElementById("product-form-eyebrow"),
    category: document.getElementById("product-category"),
    raffle: document.getElementById("product-raffle"),
    imageInput: document.getElementById("product-image"),
    dropzone: document.getElementById("image-dropzone"),
    imagePreview: document.getElementById("image-preview"),
    imagePrompt: document.getElementById("image-upload-prompt"),
    imageAdjustments: document.getElementById("image-adjustments"),
    imageRepositionHint: document.getElementById("image-reposition-hint"),
    imageZoom: document.getElementById("image-zoom"),
    imageZoomValue: document.getElementById("image-zoom-value"),
    centerImage: document.getElementById("center-image"),
    fitImage: document.getElementById("fit-image"),
    changePhoto: document.getElementById("change-photo"),
    removePhoto: document.getElementById("remove-photo"),
    feedback: document.getElementById("product-feedback"),
    save: document.getElementById("save-product"),
    deleteDialog: document.getElementById("delete-product-dialog"),
    toast: document.getElementById("toast"),
    previewMedia: document.getElementById("card-preview-media"),
    previewCategory: document.getElementById("card-preview-category"),
    previewName: document.getElementById("card-preview-name"),
    previewPrice: document.getElementById("card-preview-price"),
  };

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

  function formatPrice(value) {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: Number(value) % 1 ? 2 : 0,
    }).format(Number(value) || 0);
  }

  function visibleCategories() {
    return window.CATEGORIES.filter((category) => category.id !== "todos");
  }

  function renderCategoryOptions() {
    refs.categoryFilter.innerHTML = [
      '<option value="todos">Todas las categorías</option>',
      ...visibleCategories().map(
        (category) => `<option value="${category.id}">${escapeHtml(category.label)}</option>`,
      ),
    ].join("");
    refs.category.innerHTML = visibleCategories()
      .map((category) => `<option value="${category.id}">${escapeHtml(category.label)}</option>`)
      .join("");
  }

  function filteredProducts() {
    const needle = normalize(query);
    return products.filter((product) => {
      const categoryMatch = categoryFilter === "todos" || product.category === categoryFilter;
      const statusMatch =
        statusFilter === "todos" ||
        (statusFilter === "publicados" && product.active !== false) ||
        (statusFilter === "ocultos" && product.active === false) ||
        (statusFilter === "agotados" && product.quantity < 1);
      const textMatch = !needle || normalize(`${product.name} ${product.note}`).includes(needle);
      return categoryMatch && statusMatch && textMatch;
    });
  }

  function updateStats() {
    const published = products.filter((product) => product.active !== false);
    document.getElementById("stat-products").textContent = String(products.length);
    document.getElementById("stat-units").textContent = String(
      published.reduce((total, product) => total + Math.max(0, Number(product.quantity) || 0), 0),
    );
    document.getElementById("stat-raffle").textContent = String(
      published.filter((product) => product.raffle).reduce((total, product) => total + product.quantity, 0),
    );
    document.getElementById("stat-hidden").textContent = String(
      products.filter((product) => product.active === false).length,
    );
  }

  function productStatus(product) {
    if (product.active === false) return '<span class="manager-status hidden-status">Oculto</span>';
    if (product.quantity < 1) return '<span class="manager-status sold-status">Agotado</span>';
    return '<span class="manager-status live-status">Publicado</span>';
  }

  function render() {
    updateStats();
    const list = filteredProducts();
    refs.countLabel.textContent = `${list.length} de ${products.length} referencias`;
    refs.grid.hidden = list.length === 0;
    refs.empty.hidden = list.length !== 0;
    refs.grid.innerHTML = list
      .map((product) => {
        const media = product.image
          ? `<img
              src="${escapeHtml(product.image)}"
              alt=""
              loading="lazy"
              draggable="false"
              style="${window.productImageStyle(product)}"
            />`
          : `<span class="manager-placeholder" aria-hidden="true">${escapeHtml(product.icon || "✦")}</span>`;
        return `
          <article class="manager-product-card ${product.active === false ? "is-hidden" : ""}">
            <div class="manager-product-media">
              ${media}
              ${productStatus(product)}
            </div>
            <div class="manager-product-body">
              <div class="manager-product-heading">
                <p>${escapeHtml(window.categoryLabel(product.category))}</p>
                <span>${product.quantity} ${product.quantity === 1 ? "unidad" : "unidades"}</span>
              </div>
              <h2>${escapeHtml(product.name)}</h2>
              <p class="manager-product-note">${escapeHtml(product.note || "Sin descripción")}</p>
              <div class="manager-product-meta">
                <strong>${escapeHtml(formatPrice(product.price))}</strong>
                <span>${product.raffle ? "Sorteo" : "Asignación directa"}</span>
              </div>
              <div class="manager-card-actions">
                <button class="mini-action" type="button" data-edit="${escapeHtml(product.id)}">Editar</button>
                <button class="mini-action" type="button" data-toggle="${escapeHtml(product.id)}">
                  ${product.active === false ? "Publicar" : "Ocultar"}
                </button>
                <button class="mini-action delete" type="button" data-delete="${escapeHtml(product.id)}">Eliminar</button>
              </div>
            </div>
          </article>`;
      })
      .join("");

    refs.grid.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => openEditor(button.dataset.edit));
    });
    refs.grid.querySelectorAll("[data-toggle]").forEach((button) => {
      button.addEventListener("click", () => togglePublication(button.dataset.toggle));
    });
    refs.grid.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => askDelete(button.dataset.delete));
    });
  }

  async function loadProducts() {
    products = await window.MercadilloApi.getProducts({ includeHidden: true });
    products.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
    window.setCatalog(products);
    render();
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number(value) || 0));
  }

  function maximumImagePan() {
    return Math.min(48, Math.max(0, (imageZoom - 1) * 42));
  }

  function imageStyle() {
    return `--image-zoom:${imageZoom};--image-x:${imageX}%;--image-y:${imageY}%`;
  }

  function applyImageTransform() {
    const maximumPan = maximumImagePan();
    imageX = clamp(imageX, -maximumPan, maximumPan);
    imageY = clamp(imageY, -maximumPan, maximumPan);
    refs.imagePreview.setAttribute("style", imageStyle());
    const cardImage = refs.previewMedia.querySelector("img");
    if (cardImage) cardImage.setAttribute("style", imageStyle());
    refs.imageZoom.value = String(Math.round(imageZoom * 100));
    refs.imageZoomValue.textContent = `${Math.round(imageZoom * 100)} %`;
  }

  function setImageTransform(zoom = 1, x = 0, y = 0) {
    imageZoom = clamp(zoom, 1, 2.4);
    imageX = Number(x) || 0;
    imageY = Number(y) || 0;
    applyImageTransform();
  }

  function setImagePreview(source) {
    if (source) {
      refs.imagePreview.src = source;
      refs.imagePreview.hidden = false;
      refs.imagePrompt.hidden = true;
      refs.imageAdjustments.hidden = false;
      refs.imageRepositionHint.hidden = false;
      refs.removePhoto.hidden = false;
      refs.dropzone.classList.add("has-image");
      refs.dropzone.setAttribute("aria-label", "Ajustar la posición de la fotografía");
      refs.previewMedia.innerHTML = `<img src="${escapeHtml(source)}" alt="" draggable="false" />`;
      applyImageTransform();
    } else {
      refs.imagePreview.removeAttribute("src");
      refs.imagePreview.removeAttribute("style");
      refs.imagePreview.hidden = true;
      refs.imagePrompt.hidden = false;
      refs.imageAdjustments.hidden = true;
      refs.imageRepositionHint.hidden = true;
      refs.removePhoto.hidden = true;
      refs.dropzone.classList.remove("has-image");
      refs.dropzone.setAttribute("aria-label", "Seleccionar la fotografía del producto");
      refs.previewMedia.innerHTML = "<span>✦</span>";
    }
  }

  function updateCardPreview() {
    const data = new FormData(refs.form);
    refs.previewName.textContent = String(data.get("name") || "").trim() || "Nombre del producto";
    refs.previewCategory.textContent = window.categoryLabel(data.get("category")) || "Categoría";
    refs.previewPrice.textContent = `${formatPrice(data.get("price"))} · aportación sugerida`;
  }

  function resetEditor() {
    refs.form.reset();
    editingId = null;
    imageData = "";
    removeImage = false;
    imageZoom = 1;
    imageX = 0;
    imageY = 0;
    imageDrag = null;
    refs.feedback.textContent = "";
    refs.formEyebrow.textContent = "Nueva referencia";
    refs.formTitle.textContent = "Añadir producto";
    refs.save.textContent = "Publicar producto";
    refs.category.value = "impresoras";
    refs.raffle.checked = true;
    refs.form.elements.active.checked = true;
    refs.form.elements.quantity.value = "1";
    refs.form.elements.price.value = "0";
    setImagePreview("");
    updateCardPreview();
  }

  function openEditor(id = null) {
    resetEditor();
    if (id) {
      const product = products.find((entry) => entry.id === id);
      if (!product) return;
      editingId = id;
      refs.formEyebrow.textContent = "Editar referencia";
      refs.formTitle.textContent = product.name;
      refs.save.textContent = "Guardar cambios";
      refs.form.elements.name.value = product.name;
      refs.form.elements.category.value = product.category;
      refs.form.elements.price.value = product.price;
      refs.form.elements.quantity.value = product.quantity;
      refs.form.elements.note.value = product.note || "";
      refs.form.elements.active.checked = product.active !== false;
      refs.form.elements.raffle.checked = Boolean(product.raffle);
      setImageTransform(product.imageZoom, product.imageX, product.imageY);
      setImagePreview(product.image || "");
      updateCardPreview();
    }
    refs.dialog.showModal();
    window.setTimeout(() => refs.form.elements.name.focus(), 50);
  }

  function closeEditor() {
    refs.dialog.close();
    refs.imageInput.value = "";
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("No se ha podido leer la fotografía"));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("La fotografía seleccionada no es válida"));
      image.src = source;
    });
  }

  async function optimizeImage(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Selecciona una fotografía JPG, PNG o WEBP.");
    }
    if (file.size > 12 * 1024 * 1024) throw new Error("La fotografía original no puede superar 12 MB.");
    const source = await readFile(file);
    const image = await loadImage(source);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/webp", 0.86);
  }

  async function handleImage(file) {
    if (!file) return;
    refs.feedback.textContent = "Preparando fotografía…";
    try {
      imageData = await optimizeImage(file);
      removeImage = false;
      setImageTransform(1, 0, 0);
      setImagePreview(imageData);
      refs.imageInput.value = "";
      refs.feedback.textContent = "";
    } catch (error) {
      refs.feedback.textContent = error.message;
      refs.imageInput.value = "";
    }
  }

  async function saveProduct(event) {
    event.preventDefault();
    const existing = editingId ? products.find((product) => product.id === editingId) : null;
    if (!existing && !imageData) {
      refs.feedback.textContent = "Añade una fotografía para crear el producto.";
      refs.dropzone.focus();
      return;
    }
    const data = new FormData(refs.form);
    const payload = {
      name: String(data.get("name") || "").trim(),
      category: String(data.get("category") || ""),
      price: Number(data.get("price")),
      quantity: Number(data.get("quantity")),
      note: String(data.get("note") || "").trim(),
      active: data.get("active") === "on",
      raffle: data.get("raffle") === "on",
      imageZoom,
      imageX,
      imageY,
      ...(imageData ? { imageData } : {}),
      ...(removeImage ? { removeImage: true } : {}),
    };
    refs.save.disabled = true;
    refs.save.textContent = editingId ? "Guardando…" : "Publicando…";
    refs.feedback.textContent = "";
    try {
      if (editingId) await window.MercadilloApi.updateProduct(editingId, payload);
      else await window.MercadilloApi.createProduct(payload);
      closeEditor();
      await loadProducts();
      showToast(editingId ? "Producto actualizado" : "Producto publicado en la tienda");
    } catch (error) {
      refs.feedback.textContent = error.message;
    } finally {
      refs.save.disabled = false;
      refs.save.textContent = editingId ? "Guardar cambios" : "Publicar producto";
    }
  }

  async function togglePublication(id) {
    const product = products.find((entry) => entry.id === id);
    if (!product) return;
    try {
      await window.MercadilloApi.updateProduct(id, { active: product.active === false });
      await loadProducts();
      showToast(product.active === false ? "Producto publicado" : "Producto ocultado");
    } catch (error) {
      showToast(error.message);
    }
  }

  function askDelete(id) {
    const product = products.find((entry) => entry.id === id);
    deleteId = id;
    document.getElementById("delete-product-message").textContent = product
      ? `Se eliminará “${product.name}” definitivamente. Si solo quieres retirarlo durante un tiempo, cancela y utiliza Ocultar.`
      : "La referencia se eliminará definitivamente.";
    refs.deleteDialog.showModal();
  }

  async function confirmDelete() {
    if (!deleteId) return;
    try {
      await window.MercadilloApi.deleteProduct(deleteId);
      deleteId = null;
      refs.deleteDialog.close();
      await loadProducts();
      showToast("Producto eliminado");
    } catch (error) {
      showToast(error.message);
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.add("show");
    toastTimer = setTimeout(() => refs.toast.classList.remove("show"), 2600);
  }

  async function handleLogin(event) {
    event.preventDefault();
    window.MercadilloApi.setAdminPin(new FormData(refs.loginForm).get("pin"));
    try {
      await window.MercadilloApi.getOrders();
      await loadProducts();
      refs.loginFeedback.textContent = "";
      refs.login.close();
      document.getElementById("logout-button").hidden = false;
    } catch (error) {
      refs.loginFeedback.textContent = error.message;
    }
  }

  async function boot() {
    renderCategoryOptions();
    const mode = await window.MercadilloApi.detectMode();
    const labels = {
      server: "Catálogo centralizado · cambios visibles al instante",
      "power-automate": "Catálogo conectado en modo compatible",
      local: "Modo local de demostración · cambios solo en este navegador",
    };
    refs.modeLabel.textContent = labels[mode];
    refs.modePill.classList.toggle("online", mode !== "local");
    document.getElementById("logout-button").hidden = mode !== "server";
    if (mode === "server") {
      try {
        await window.MercadilloApi.getOrders();
        await loadProducts();
      } catch (error) {
        if (error.message === "PIN incorrecto") refs.login.showModal();
        else showToast(error.message);
      }
    } else {
      await loadProducts();
    }
  }

  refs.search.addEventListener("input", () => {
    query = refs.search.value;
    render();
  });
  refs.categoryFilter.addEventListener("change", () => {
    categoryFilter = refs.categoryFilter.value;
    render();
  });
  refs.statusFilter.addEventListener("change", () => {
    statusFilter = refs.statusFilter.value;
    render();
  });
  refs.category.addEventListener("change", () => {
    refs.raffle.checked = window.MAIN_RAFFLE_CATEGORIES.includes(refs.category.value);
    updateCardPreview();
  });
  refs.form.addEventListener("input", updateCardPreview);
  refs.form.addEventListener("submit", saveProduct);
  refs.imageInput.addEventListener("change", () => handleImage(refs.imageInput.files[0]));
  refs.dropzone.addEventListener("click", () => {
    if (refs.imagePreview.hidden) refs.imageInput.click();
  });
  refs.dropzone.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && refs.imagePreview.hidden) {
      event.preventDefault();
      refs.imageInput.click();
    }
  });
  refs.dropzone.addEventListener("dragover", (event) => {
    event.preventDefault();
    refs.dropzone.classList.add("dragging");
  });
  refs.dropzone.addEventListener("dragleave", () => refs.dropzone.classList.remove("dragging"));
  refs.dropzone.addEventListener("drop", (event) => {
    event.preventDefault();
    refs.dropzone.classList.remove("dragging");
    handleImage(event.dataTransfer.files[0]);
  });
  refs.dropzone.addEventListener("pointerdown", (event) => {
    if (refs.imagePreview.hidden || event.button !== 0) return;
    event.preventDefault();
    imageDrag = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startImageX: imageX,
      startImageY: imageY,
    };
    refs.dropzone.classList.add("is-moving");
    refs.dropzone.setPointerCapture?.(event.pointerId);
  });
  refs.dropzone.addEventListener("pointermove", (event) => {
    if (!imageDrag || imageDrag.pointerId !== event.pointerId) return;
    const bounds = refs.dropzone.getBoundingClientRect();
    const movedX = ((event.clientX - imageDrag.startClientX) / Math.max(1, bounds.width)) * 100;
    const movedY = ((event.clientY - imageDrag.startClientY) / Math.max(1, bounds.height)) * 100;
    imageX = imageDrag.startImageX + movedX;
    imageY = imageDrag.startImageY + movedY;
    applyImageTransform();
  });

  function finishImageDrag(event) {
    if (!imageDrag || imageDrag.pointerId !== event.pointerId) return;
    refs.dropzone.releasePointerCapture?.(event.pointerId);
    refs.dropzone.classList.remove("is-moving");
    imageDrag = null;
  }

  refs.dropzone.addEventListener("pointerup", finishImageDrag);
  refs.dropzone.addEventListener("pointercancel", finishImageDrag);
  refs.imageZoom.addEventListener("input", () => {
    imageZoom = Number(refs.imageZoom.value) / 100;
    applyImageTransform();
  });
  refs.centerImage.addEventListener("click", () => setImageTransform(imageZoom, 0, 0));
  refs.fitImage.addEventListener("click", () => setImageTransform(1, 0, 0));
  refs.changePhoto.addEventListener("click", () => refs.imageInput.click());
  refs.dialog.addEventListener("paste", (event) => {
    const imageItem = Array.from(event.clipboardData?.items || []).find((item) => item.type.startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    handleImage(imageItem.getAsFile());
  });
  refs.removePhoto.addEventListener("click", () => {
    imageData = "";
    removeImage = true;
    setImageTransform(1, 0, 0);
    refs.imageInput.value = "";
    setImagePreview("");
  });
  document.getElementById("new-product-button").addEventListener("click", () => openEditor());
  document.getElementById("close-product-dialog").addEventListener("click", closeEditor);
  document.getElementById("cancel-product").addEventListener("click", closeEditor);
  document.getElementById("cancel-delete-product").addEventListener("click", () => refs.deleteDialog.close());
  document.getElementById("confirm-delete-product").addEventListener("click", confirmDelete);
  refs.loginForm.addEventListener("submit", handleLogin);
  document.getElementById("logout-button").addEventListener("click", () => {
    window.MercadilloApi.clearAdminPin();
    refs.loginForm.reset();
    refs.login.showModal();
  });
  refs.login.addEventListener("cancel", (event) => {
    if (window.MercadilloApi.getMode() === "server") event.preventDefault();
  });

  boot();
})();
