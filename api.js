(function initMercadilloApi() {
  const config = window.MERCADILLO_CONFIG || {};
  const KEYS = {
    orders: "mercadillo_orders_v2",
    raffle: "mercadillo_raffle_v2",
    products: "mercadillo_products_v3",
  };
  let mode = "local";
  let adminPin = sessionStorage.getItem("mercadillo_admin_pin") || "";

  function uid(prefix) {
    const random = crypto.getRandomValues(new Uint32Array(2));
    return `${prefix}-${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`;
  }

  function readLocal(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "[]");
    } catch {
      return [];
    }
  }

  function writeLocal(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("mercadillo:data-changed"));
  }

  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (adminPin) headers["X-Admin-Pin"] = adminPin;
    const response = await fetch(`${config.apiBase || ""}${path}`, { ...options, headers });
    if (response.status === 401) throw new Error("PIN incorrecto");
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "No se ha podido completar la operación");
    }
    return response.json();
  }

  async function detectMode() {
    if (config.powerAutomateSubmitUrl) {
      mode = "power-automate";
      return mode;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 900);
      const response = await fetch(`${config.apiBase || ""}/api/health`, {
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (response.ok) mode = "server";
    } catch {
      mode = "local";
    }
    return mode;
  }

  async function createOrder(order) {
    const payload = {
      ...order,
      id: order.id || uid("PED"),
      createdAt: order.createdAt || new Date().toISOString(),
      status: order.status || "Nueva",
      adminNotes: order.adminNotes || "",
    };

    if (mode === "server") return request("/api/orders", { method: "POST", body: JSON.stringify(payload) });

    if (mode === "power-automate") {
      const response = await fetch(config.powerAutomateSubmitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error("El flujo de pedidos no ha confirmado la recepción");
    }

    const orders = readLocal(KEYS.orders);
    orders.unshift(payload);
    writeLocal(KEYS.orders, orders);
    return { order: payload, storage: mode };
  }

  async function getOrders() {
    if (mode === "server") return (await request("/api/orders")).orders;
    if (mode === "power-automate" && config.powerAutomateOrdersUrl) {
      const response = await fetch(config.powerAutomateOrdersUrl, { cache: "no-store" });
      if (!response.ok) throw new Error("No se han podido consultar los pedidos");
      const result = await response.json();
      return Array.isArray(result) ? result : result.orders || [];
    }
    return readLocal(KEYS.orders);
  }

  async function updateOrder(id, updates) {
    if (mode === "server") {
      return request(`/api/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    }
    if (mode === "power-automate" && config.powerAutomateUpdateUrl) {
      const response = await fetch(config.powerAutomateUpdateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", id, updates }),
      });
      if (!response.ok) throw new Error("No se ha podido actualizar el pedido");
    }
    const orders = readLocal(KEYS.orders);
    const index = orders.findIndex((order) => order.id === id);
    if (index < 0) throw new Error("Pedido no encontrado");
    orders[index] = { ...orders[index], ...updates, updatedAt: new Date().toISOString() };
    writeLocal(KEYS.orders, orders);
    return { order: orders[index] };
  }

  async function deleteOrder(id) {
    if (mode === "server") return request(`/api/orders/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (mode === "power-automate" && config.powerAutomateUpdateUrl) {
      const response = await fetch(config.powerAutomateUpdateUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      if (!response.ok) throw new Error("No se ha podido eliminar el pedido");
    }
    writeLocal(KEYS.orders, readLocal(KEYS.orders).filter((order) => order.id !== id));
    return { ok: true };
  }

  async function getProducts({ includeHidden = false } = {}) {
    if (mode === "server") {
      const suffix = includeHidden ? "?include=all" : "";
      return (await request(`/api/products${suffix}`)).products;
    }
    const saved = readLocal(KEYS.products);
    const products = saved.length ? saved : window.CATALOG;
    return includeHidden ? products : products.filter((product) => product.active !== false);
  }

  async function createProduct(product) {
    if (mode === "server") {
      return request("/api/products", { method: "POST", body: JSON.stringify(product) });
    }
    const products = readLocal(KEYS.products);
    const base = products.length ? products : window.CATALOG;
    const created = {
      ...product,
      id: product.id || uid("PRD"),
      image: product.imageData || product.image || "",
      active: product.active !== false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    delete created.imageData;
    writeLocal(KEYS.products, [created, ...base]);
    return { product: created };
  }

  async function updateProduct(id, updates) {
    if (mode === "server") {
      return request(`/api/products/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    }
    const products = readLocal(KEYS.products);
    const base = products.length ? products : window.CATALOG;
    const index = base.findIndex((product) => product.id === id);
    if (index < 0) throw new Error("Producto no encontrado");
    const image = updates.imageData || (updates.removeImage ? "" : base[index].image);
    base[index] = { ...base[index], ...updates, image, updatedAt: new Date().toISOString() };
    delete base[index].imageData;
    delete base[index].removeImage;
    writeLocal(KEYS.products, base);
    return { product: base[index] };
  }

  async function deleteProduct(id) {
    if (mode === "server") {
      return request(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" });
    }
    const products = readLocal(KEYS.products);
    const base = products.length ? products : window.CATALOG;
    writeLocal(
      KEYS.products,
      base.filter((product) => product.id !== id),
    );
    return { ok: true };
  }

  async function getRaffle() {
    if (mode === "server") return (await request("/api/raffle")).results;
    return readLocal(KEYS.raffle);
  }

  async function saveRaffle(results) {
    if (mode === "server") {
      return request("/api/raffle", { method: "POST", body: JSON.stringify({ results }) });
    }
    writeLocal(KEYS.raffle, results);
    return { results };
  }

  async function clearRaffle() {
    if (mode === "server") return request("/api/raffle", { method: "DELETE" });
    writeLocal(KEYS.raffle, []);
    return { ok: true };
  }

  function setAdminPin(pin) {
    adminPin = String(pin || "").trim();
    sessionStorage.setItem("mercadillo_admin_pin", adminPin);
  }

  function clearAdminPin() {
    adminPin = "";
    sessionStorage.removeItem("mercadillo_admin_pin");
  }

  window.MercadilloApi = {
    detectMode,
    getMode: () => mode,
    createOrder,
    getOrders,
    updateOrder,
    deleteOrder,
    getProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    getRaffle,
    saveRaffle,
    clearRaffle,
    setAdminPin,
    clearAdminPin,
  };
})();
