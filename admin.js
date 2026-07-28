(function initAdmin() {
  const STATUSES = ["Nueva", "En revisión", "Asignado", "Contactado", "Entregado", "Cancelado"];
  let orders = [];
  let query = "";
  let statusFilter = "todos";
  let refreshTimer;
  let pendingDeleteId = null;
  let toastTimer;

  const refs = {
    main: document.getElementById("admin-main"),
    modePill: document.getElementById("mode-pill"),
    modeLabel: document.getElementById("mode-label"),
    body: document.getElementById("orders-body"),
    table: document.getElementById("orders-table"),
    empty: document.getElementById("orders-empty"),
    search: document.getElementById("admin-search"),
    status: document.getElementById("status-filter"),
    refresh: document.getElementById("refresh-label"),
    login: document.getElementById("login-dialog"),
    loginForm: document.getElementById("login-form"),
    loginFeedback: document.getElementById("login-feedback"),
    manual: document.getElementById("manual-order-dialog"),
    manualForm: document.getElementById("manual-order-form"),
    manualProducts: document.getElementById("manual-products"),
    manualFeedback: document.getElementById("manual-feedback"),
    confirm: document.getElementById("confirm-dialog"),
    toast: document.getElementById("toast"),
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

  function personKey(order) {
    return normalize(`${order.firstName} ${order.lastName}`).replace(/\s+/g, " ").trim();
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sin fecha";
    return new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function filteredOrders() {
    const needle = normalize(query);
    return orders.filter((order) => {
      const statusMatch = statusFilter === "todos" || order.status === statusFilter;
      const haystack = normalize(
        [
          order.id,
          order.firstName,
          order.lastName,
          order.email,
          order.department,
          ...(order.items || []).map((item) => item.name),
        ].join(" "),
      );
      return statusMatch && (!needle || haystack.includes(needle));
    });
  }

  function updateStats() {
    const active = orders.filter((order) => order.status !== "Cancelado");
    document.getElementById("stat-orders").textContent = String(orders.length);
    document.getElementById("stat-people").textContent = String(new Set(active.map(personKey)).size);
    document.getElementById("stat-items").textContent = String(
      active.reduce((total, order) => total + (order.items?.length || 0), 0),
    );
    document.getElementById("stat-pending").textContent = String(
      orders.filter((order) => order.status === "Nueva" || order.status === "En revisión").length,
    );
  }

  function render() {
    updateStats();
    const rows = filteredOrders();
    refs.table.hidden = rows.length === 0;
    refs.empty.hidden = rows.length !== 0;

    refs.body.innerHTML = rows
      .map((order) => {
        const items = (order.items || [])
          .map((item) => `<li><span class="order-item-tag">${escapeHtml(item.name)}</span></li>`)
          .join("");
        const statusOptions = STATUSES.map(
          (status) => `<option value="${status}" ${status === order.status ? "selected" : ""}>${status}</option>`,
        ).join("");
        return `
          <tr data-row="${escapeHtml(order.id)}">
            <td>
              <strong>${escapeHtml(formatDate(order.createdAt))}</strong>
              <span class="muted">${escapeHtml(order.id)}</span>
            </td>
            <td>
              <span class="person-name">${escapeHtml(order.firstName)} ${escapeHtml(order.lastName)}</span>
              ${order.email ? `<span class="muted">${escapeHtml(order.email)}</span><br />` : ""}
              ${order.department ? `<span class="muted">${escapeHtml(order.department)}</span>` : ""}
            </td>
            <td>
              <ul class="order-items-list">${items || '<li class="muted">Sin productos</li>'}</ul>
              ${order.notes ? `<p class="muted" style="margin:8px 0 0">Cliente: ${escapeHtml(order.notes)}</p>` : ""}
            </td>
            <td>
              <select class="status-select" data-status="${escapeHtml(order.id)}">${statusOptions}</select>
            </td>
            <td>
              <textarea class="notes-input" data-notes="${escapeHtml(order.id)}" rows="2" maxlength="500" placeholder="Añadir nota">${escapeHtml(order.adminNotes || "")}</textarea>
            </td>
            <td>
              <div class="row-actions">
                <button class="mini-action" type="button" data-save="${escapeHtml(order.id)}">Guardar</button>
                <button class="mini-action delete" type="button" data-delete="${escapeHtml(order.id)}">Quitar</button>
              </div>
            </td>
          </tr>`;
      })
      .join("");

    refs.body.querySelectorAll("[data-save]").forEach((button) => {
      button.addEventListener("click", () => saveRow(button.dataset.save));
    });
    refs.body.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => askDelete(button.dataset.delete));
    });
  }

  async function refreshOrders({ quiet = false } = {}) {
    try {
      orders = await window.MercadilloApi.getOrders();
      orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      render();
      refs.refresh.textContent = `Actualizado ${new Date().toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}`;
    } catch (error) {
      if (error.message === "PIN incorrecto") {
        refs.login.showModal();
        return;
      }
      refs.refresh.textContent = "No se ha podido actualizar";
      if (!quiet) showToast(error.message);
    }
  }

  async function saveRow(id) {
    const row = refs.body.querySelector(`[data-row="${CSS.escape(id)}"]`);
    const status = row.querySelector("[data-status]").value;
    const adminNotes = row.querySelector("[data-notes]").value.trim();
    try {
      await window.MercadilloApi.updateOrder(id, { status, adminNotes });
      showToast("Pedido actualizado");
      await refreshOrders({ quiet: true });
    } catch (error) {
      showToast(error.message);
    }
  }

  function askDelete(id) {
    const order = orders.find((entry) => entry.id === id);
    pendingDeleteId = id;
    document.getElementById("confirm-title").textContent = "Quitar pedido";
    document.getElementById("confirm-message").textContent = order
      ? `Se eliminará la solicitud de ${order.firstName} ${order.lastName}. Esta acción no se puede deshacer.`
      : "Se eliminará este pedido.";
    refs.confirm.showModal();
  }

  async function confirmDelete() {
    if (!pendingDeleteId) return;
    try {
      await window.MercadilloApi.deleteOrder(pendingDeleteId);
      showToast("Pedido eliminado");
      refs.confirm.close();
      pendingDeleteId = null;
      await refreshOrders({ quiet: true });
    } catch (error) {
      showToast(error.message);
    }
  }

  function renderManualProducts() {
    refs.manualProducts.innerHTML = window.CATALOG.filter((product) => product.active !== false && product.quantity > 0).map(
      (product) => `
        <label class="product-check">
          <input type="checkbox" name="productId" value="${product.id}" />
          <span>
            <strong>${escapeHtml(product.name)}</strong><br />
            <span class="muted">${escapeHtml(window.categoryLabel(product.category))}</span>
          </span>
        </label>`,
    ).join("");
  }

  async function handleManualOrder(event) {
    event.preventDefault();
    const data = new FormData(refs.manualForm);
    const productIds = data.getAll("productId");
    if (!productIds.length) {
      refs.manualFeedback.textContent = "Selecciona al menos un producto.";
      return;
    }
    const products = productIds.map(window.getProduct).filter(Boolean);
    const order = {
      firstName: String(data.get("firstName") || "").trim(),
      lastName: String(data.get("lastName") || "").trim(),
      email: String(data.get("email") || "").trim(),
      department: String(data.get("department") || "").trim(),
      notes: String(data.get("notes") || "").trim(),
      acceptedRules: true,
      source: "admin",
      items: products.map((product) => ({
        productId: product.id,
        name: product.name,
        category: product.category,
        price: product.price,
        raffle: product.raffle,
      })),
    };
    try {
      await window.MercadilloApi.createOrder(order);
      refs.manualForm.reset();
      refs.manualFeedback.textContent = "";
      refs.manual.close();
      showToast("Pedido añadido");
      await refreshOrders({ quiet: true });
    } catch (error) {
      refs.manualFeedback.textContent = error.message;
    }
  }

  function downloadFile(name, content, type) {
    const blob = new Blob([content], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function exportJson() {
    downloadFile(
      `mercadillo-pedidos-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(orders, null, 2),
      "application/json",
    );
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function exportCsv() {
    const headers = [
      "Código",
      "Fecha",
      "Nombre",
      "Apellidos",
      "Correo",
      "Departamento",
      "Productos",
      "Categorías",
      "Estado",
      "Observaciones",
      "Notas internas",
    ];
    const lines = orders.map((order) =>
      [
        order.id,
        formatDate(order.createdAt),
        order.firstName,
        order.lastName,
        order.email,
        order.department,
        (order.items || []).map((item) => item.name).join(" | "),
        (order.items || []).map((item) => window.categoryLabel(item.category)).join(" | "),
        order.status,
        order.notes,
        order.adminNotes,
      ]
        .map(csvCell)
        .join(";"),
    );
    downloadFile(
      `mercadillo-pedidos-${new Date().toISOString().slice(0, 10)}.csv`,
      `\ufeff${headers.map(csvCell).join(";")}\n${lines.join("\n")}`,
      "text/csv;charset=utf-8",
    );
  }

  async function importJson(file) {
    try {
      const payload = JSON.parse(await file.text());
      if (!Array.isArray(payload)) throw new Error("El archivo no contiene una lista de pedidos.");
      for (const order of payload) {
        if (!order.firstName || !order.lastName || !Array.isArray(order.items)) continue;
        const existing = orders.find((entry) => entry.id === order.id);
        if (existing) {
          await window.MercadilloApi.updateOrder(existing.id, order);
        } else {
          await window.MercadilloApi.createOrder(order);
        }
      }
      showToast("Importación completada");
      await refreshOrders({ quiet: true });
    } catch (error) {
      showToast(error.message || "No se ha podido importar el archivo");
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.add("show");
    toastTimer = setTimeout(() => refs.toast.classList.remove("show"), 2500);
  }

  async function handleLogin(event) {
    event.preventDefault();
    const pin = new FormData(refs.loginForm).get("pin");
    window.MercadilloApi.setAdminPin(pin);
    try {
      orders = await window.MercadilloApi.getOrders();
      window.setCatalog(await window.MercadilloApi.getProducts({ includeHidden: true }));
      renderManualProducts();
      orders.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      render();
      refs.loginFeedback.textContent = "";
      refs.login.close();
      document.getElementById("logout-button").hidden = false;
      refs.refresh.textContent = "Conexión confirmada";
    } catch (error) {
      refs.loginFeedback.textContent = error.message;
    }
  }

  async function boot() {
    const mode = await window.MercadilloApi.detectMode();
    const labels = {
      server: "Datos centralizados · actualización automática",
      "power-automate": "Conectado a Power Automate",
      local: "Modo local de demostración · solo visible en este navegador",
    };
    refs.modeLabel.textContent = labels[mode];
    refs.modePill.classList.toggle("online", mode !== "local");
    document.getElementById("logout-button").hidden = mode !== "server";
    try {
      window.setCatalog(await window.MercadilloApi.getProducts({ includeHidden: true }));
    } catch {
      // El catálogo inicial continúa disponible mientras se solicita el PIN.
    }
    renderManualProducts();
    await refreshOrders();
    refreshTimer = setInterval(() => refreshOrders({ quiet: true }), 5000);
  }

  refs.search.addEventListener("input", () => {
    query = refs.search.value;
    render();
  });
  refs.status.addEventListener("change", () => {
    statusFilter = refs.status.value;
    render();
  });
  refs.loginForm.addEventListener("submit", handleLogin);
  refs.manualForm.addEventListener("submit", handleManualOrder);
  document.getElementById("manual-order-button").addEventListener("click", () => refs.manual.showModal());
  document.getElementById("close-manual-order").addEventListener("click", () => refs.manual.close());
  document.getElementById("export-json-button").addEventListener("click", exportJson);
  document.getElementById("export-csv-button").addEventListener("click", exportCsv);
  document.getElementById("import-button").addEventListener("click", () => document.getElementById("import-file").click());
  document.getElementById("import-file").addEventListener("change", (event) => {
    if (event.target.files[0]) importJson(event.target.files[0]);
    event.target.value = "";
  });
  document.getElementById("confirm-cancel").addEventListener("click", () => refs.confirm.close());
  document.getElementById("confirm-accept").addEventListener("click", confirmDelete);
  document.getElementById("logout-button").addEventListener("click", () => {
    window.MercadilloApi.clearAdminPin();
    refs.loginForm.reset();
    refs.login.showModal();
  });
  refs.login.addEventListener("cancel", (event) => {
    if (window.MercadilloApi.getMode() === "server") event.preventDefault();
  });
  window.addEventListener("storage", () => refreshOrders({ quiet: true }));
  window.addEventListener("mercadillo:data-changed", () => refreshOrders({ quiet: true }));
  window.addEventListener("beforeunload", () => clearInterval(refreshTimer));

  boot();
})();
