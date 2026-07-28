(function initRaffle() {
  let orders = [];
  let results = [];
  let toastTimer;

  const refs = {
    modePill: document.getElementById("mode-pill"),
    modeLabel: document.getElementById("mode-label"),
    stage: document.getElementById("raffle-stage"),
    heading: document.getElementById("raffle-heading"),
    description: document.getElementById("raffle-description"),
    draw: document.getElementById("draw-button"),
    people: document.getElementById("raffle-people"),
    requests: document.getElementById("raffle-requests"),
    prizes: document.getElementById("raffle-prizes"),
    list: document.getElementById("winners-list"),
    empty: document.getElementById("winners-empty"),
    meta: document.getElementById("results-meta"),
    login: document.getElementById("login-dialog"),
    loginForm: document.getElementById("login-form"),
    loginFeedback: document.getElementById("login-feedback"),
    reset: document.getElementById("confirm-reset"),
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
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function personKey(order) {
    return normalize(`${order.firstName} ${order.lastName}`);
  }

  function cryptoRandomInt(max) {
    if (max <= 1) return 0;
    const range = 0x100000000;
    const limit = range - (range % max);
    const values = new Uint32Array(1);
    do {
      crypto.getRandomValues(values);
    } while (values[0] >= limit);
    return values[0] % max;
  }

  function shuffle(list) {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const randomIndex = cryptoRandomInt(index + 1);
      [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
    }
    return copy;
  }

  function eligibleOrders() {
    return orders.filter(
      (order) =>
        order.status !== "Cancelado" &&
        (order.items || []).some((item) => window.MAIN_RAFFLE_CATEGORIES.includes(item.category)),
    );
  }

  function updateStats() {
    const eligible = eligibleOrders();
    refs.people.textContent = String(new Set(eligible.map(personKey)).size);
    refs.requests.textContent = String(
      eligible.reduce(
        (total, order) =>
          total +
          (order.items || []).filter((item) => window.MAIN_RAFFLE_CATEGORIES.includes(item.category)).length,
        0,
      ),
    );
    refs.prizes.textContent = String(
      window.CATALOG.filter((product) => product.raffle).reduce((total, product) => total + product.quantity, 0),
    );
  }

  function renderResults() {
    refs.empty.hidden = results.length > 0;
    refs.list.hidden = results.length === 0;
    refs.draw.disabled = results.length > 0 || eligibleOrders().length === 0;
    refs.draw.textContent = results.length
      ? "Sorteo ya realizado"
      : eligibleOrders().length
        ? "Realizar sorteo completo"
        : "Sin participantes";

    if (!results.length) {
      refs.meta.textContent = "Sorteo pendiente";
      refs.list.innerHTML = "";
      return;
    }

    refs.meta.textContent = `${results.length} adjudicaciones · ${new Intl.DateTimeFormat("es-ES", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(results[0].drawnAt))}`;
    refs.heading.textContent = `${results.length} personas han resultado adjudicatarias.`;
    refs.description.textContent =
      "El resultado está guardado. Cada persona aparece una sola vez, aunque hubiera seleccionado varios equipos principales.";
    refs.list.innerHTML = results
      .map(
        (result, index) => `
          <article class="winner-row">
            <span class="winner-number">${index + 1}</span>
            <div>
              <strong>${escapeHtml(result.firstName)} ${escapeHtml(result.lastName)}</strong>
              <span class="muted">${escapeHtml(result.department || result.email || result.orderId)}</span>
            </div>
            <span class="winner-product">${escapeHtml(result.productName)}</span>
            <time class="winner-time" datetime="${escapeHtml(result.drawnAt)}">${new Date(result.drawnAt).toLocaleTimeString("es-ES", {
              hour: "2-digit",
              minute: "2-digit",
            })}</time>
          </article>`,
      )
      .join("");
  }

  function createDrawResults() {
    const eligible = eligibleOrders();
    const products = window.CATALOG.filter((product) => product.raffle);
    const units = shuffle(
      products.flatMap((product) =>
        Array.from({ length: product.quantity }, (_, index) => ({
          product,
          unit: index + 1,
        })),
      ),
    );
    const winners = new Set();
    const drawTime = new Date().toISOString();
    const output = [];

    for (const unit of units) {
      const candidatesByPerson = new Map();
      for (const order of eligible) {
        if (winners.has(personKey(order))) continue;
        const requested = (order.items || []).some((item) => item.productId === unit.product.id);
        if (requested && !candidatesByPerson.has(personKey(order))) {
          candidatesByPerson.set(personKey(order), order);
        }
      }

      const candidates = [...candidatesByPerson.values()];
      if (!candidates.length) continue;
      const winner = candidates[cryptoRandomInt(candidates.length)];
      winners.add(personKey(winner));
      output.push({
        resultId: `RES-${Date.now().toString(36)}-${output.length + 1}`,
        orderId: winner.id,
        personKey: personKey(winner),
        firstName: winner.firstName,
        lastName: winner.lastName,
        email: winner.email || "",
        department: winner.department || "",
        productId: unit.product.id,
        productName: `${unit.product.name}${unit.product.quantity > 1 ? ` · unidad ${unit.unit}` : ""}`,
        category: unit.product.category,
        drawnAt: drawTime,
        rule: "Máximo un producto principal por persona",
      });
    }
    return output;
  }

  async function runDraw() {
    if (!eligibleOrders().length || results.length) return;
    refs.draw.disabled = true;
    refs.draw.textContent = "Sorteando…";
    refs.stage.classList.add("draw-animation");
    refs.heading.textContent = "Mezclando participantes y productos…";
    refs.description.textContent = "Aplicando la regla de un único equipo principal por persona.";

    await new Promise((resolve) => setTimeout(resolve, 1200));
    try {
      const output = createDrawResults();
      await window.MercadilloApi.saveRaffle(output);
      results = output;
      renderResults();
      showToast(output.length ? "Sorteo completado y guardado" : "No hay coincidencias entre solicitudes y productos");
    } catch (error) {
      refs.heading.textContent = "No se ha podido guardar el sorteo.";
      refs.description.textContent = error.message;
      refs.draw.disabled = false;
      refs.draw.textContent = "Volver a intentarlo";
    } finally {
      refs.stage.classList.remove("draw-animation");
    }
  }

  async function resetDraw() {
    try {
      await window.MercadilloApi.clearRaffle();
      results = [];
      refs.heading.textContent = "Un premio principal como máximo por persona.";
      refs.description.textContent =
        "El sistema elimina inscripciones duplicadas, mezcla el orden de los productos y selecciona cada ganador al azar entre quienes lo solicitaron y aún no han obtenido otro equipo principal.";
      refs.reset.close();
      renderResults();
      showToast("El sorteo se ha reiniciado");
    } catch (error) {
      showToast(error.message);
    }
  }

  function csvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function exportResults() {
    if (!results.length) {
      showToast("Realiza primero el sorteo");
      return;
    }
    const headers = ["Nº", "Nombre", "Apellidos", "Departamento", "Correo", "Producto", "Categoría", "Código pedido", "Fecha"];
    const lines = results.map((result, index) =>
      [
        index + 1,
        result.firstName,
        result.lastName,
        result.department,
        result.email,
        result.productName,
        window.categoryLabel(result.category),
        result.orderId,
        result.drawnAt,
      ]
        .map(csvCell)
        .join(";"),
    );
    const blob = new Blob([`\ufeff${headers.map(csvCell).join(";")}\n${lines.join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `mercadillo-sorteo-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    refs.toast.textContent = message;
    refs.toast.classList.add("show");
    toastTimer = setTimeout(() => refs.toast.classList.remove("show"), 2500);
  }

  async function loadData() {
    window.setCatalog(await window.MercadilloApi.getProducts({ includeHidden: true }));
    orders = await window.MercadilloApi.getOrders();
    results = await window.MercadilloApi.getRaffle();
    updateStats();
    renderResults();
  }

  async function handleLogin(event) {
    event.preventDefault();
    window.MercadilloApi.setAdminPin(new FormData(refs.loginForm).get("pin"));
    try {
      await loadData();
      refs.loginFeedback.textContent = "";
      refs.login.close();
      document.getElementById("logout-button").hidden = false;
    } catch (error) {
      refs.loginFeedback.textContent = error.message;
    }
  }

  async function boot() {
    const mode = await window.MercadilloApi.detectMode();
    const labels = {
      server: "Datos centralizados · acta persistente",
      "power-automate": "Conectado a Power Automate",
      local: "Modo local de demostración · datos de este navegador",
    };
    refs.modeLabel.textContent = labels[mode];
    refs.modePill.classList.toggle("online", mode !== "local");
    document.getElementById("logout-button").hidden = mode !== "server";
    try {
      await loadData();
    } catch (error) {
      if (error.message === "PIN incorrecto") refs.login.showModal();
      else showToast(error.message);
    }
  }

  refs.draw.addEventListener("click", runDraw);
  document.getElementById("reset-raffle").addEventListener("click", () => refs.reset.showModal());
  document.getElementById("cancel-reset").addEventListener("click", () => refs.reset.close());
  document.getElementById("accept-reset").addEventListener("click", resetDraw);
  document.getElementById("export-results").addEventListener("click", exportResults);
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
