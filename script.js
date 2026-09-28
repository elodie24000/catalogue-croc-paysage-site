// Catalogue Croc'Paysage — chargement, filtres et fiches produit
(() => {
  const CAT_COLORS = {
    "Fruitier": "#c79a12",
    "Légume vivace": "#5f7a1f",
    "Agrume": "#d9791a",
    "Liane fruitière": "#7a6a1c",
    "Ornemental / mellifère": "#8a4516",
    "Aromatique / condimentaire": "#3f6b4a",
  };
  const catColor = (c) => CAT_COLORS[c] || "#6b7928";

  const $ = (id) => document.getElementById(id);
  const els = {
    search: $("search"), chips: $("categorie-chips"), rusticite: $("rusticite"), hauteur: $("hauteur"),
    tri: $("tri"), stock: $("en-stock-only"), grid: $("grid"), count: $("result-count"),
    none: $("no-results"),
    overlay: $("modal-overlay"), modalContent: $("modal-content"), modalClose: $("modal-close"),
  };

  let plants = [];
  let currentCat = "";
  let lastFocus = null;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const price = (n) => n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €";

  $("year").textContent = new Date().getFullYear();

  fetch("data.json")
    .then((r) => r.json())
    .then((data) => {
      plants = data;
      buildChips();
      render();
    })
    .catch(() => {
      els.count.textContent = "Impossible de charger le catalogue (data.json).";
    });


  function buildChips() {
    const counts = {};
    plants.forEach((p) => { counts[p.categorie] = (counts[p.categorie] || 0) + 1; });
    const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const chip = (value, label, n) => `
      <button type="button" class="chip" data-cat="${esc(value)}" aria-pressed="${value === currentCat}"
        style="--c:${value ? catColor(value) : "var(--olive)"}">
        ${value ? '<span class="dot"></span>' : ""}${esc(label)} <span class="count">${n}</span>
      </button>`;
    els.chips.innerHTML = chip("", "Tout le catalogue", plants.length) +
      cats.map((c) => chip(c, c, counts[c])).join("");
  }

  els.chips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    currentCat = btn.dataset.cat;
    els.chips.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", b === btn));
    render();
  });
  els.search.addEventListener("input", render);
  [els.rusticite, els.hauteur, els.tri, els.stock].forEach((el) => el.addEventListener("change", render));

  // Hauteur adulte maximale en mètres, extraite du texte libre de l'inventaire :
  // « 3-5 m » → 5, « 60/90 cm » → 0.9, « 2.5 x 2.5 m » → 2.5, « Grimpante herbacée » → null.
  function hauteurMetres(p) {
    if (p.hauteur_val != null) return p.hauteur_val;
    let s = String(p.hauteur ?? "").toLowerCase().replace(/(\d),(\d)/g, "$1.$2");
    const avantParenthese = s.split("(")[0];
    if (/\d/.test(avantParenthese)) s = avantParenthese;
    s = s.split(/\s+x\s+/)[0];
    const nombres = (s.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    if (!nombres.length) return null;
    const max = Math.max(...nombres);
    return /cm/.test(s) ? max / 100 : max;
  }

  function filtered() {
    const q = norm(els.search.value.trim());
    const rust = els.rusticite.value === "" ? null : Number(els.rusticite.value);
    const [hMin, hMax] = els.hauteur.value ? els.hauteur.value.split("-").map(Number) : [null, null];
    const hauteurOk = (p) => {
      if (hMin === null) return true;
      const h = hauteurMetres(p);
      // Borne haute incluse : une plante de « 3-6 m » est dans « De 3 à 6 m ».
      return h != null && h > hMin && h <= hMax;
    };
    const list = plants.filter((p) =>
      (!currentCat || p.categorie === currentCat) &&
      (!q || norm(p.nom).includes(q) || norm(p.latin).includes(q)) &&
      (rust === null || (p.rusticite_val != null && p.rusticite_val <= rust)) &&
      hauteurOk(p) &&
      (!els.stock.checked || p.stock_total > 0));

    const sorters = {
      nom: (a, b) => a.nom.localeCompare(b.nom, "fr"),
      prix: (a, b) => a.prix_min - b.prix_min,
      rusticite: (a, b) => (a.rusticite_val ?? 99) - (b.rusticite_val ?? 99),
      // Les plantes sans hauteur chiffrée vont toujours en fin de liste.
      hauteur: (a, b) => (hauteurMetres(a) ?? Infinity) - (hauteurMetres(b) ?? Infinity),
      "hauteur-desc": (a, b) => (hauteurMetres(b) ?? -Infinity) - (hauteurMetres(a) ?? -Infinity),
    };
    const sorter = sorters[els.tri.value] || sorters.nom;
    return list.sort((a, b) => sorter(a, b) || sorters.nom(a, b));
  }

  function media(p, cls) {
    if (p.images && p.images.length) {
      return `<div class="${cls}"><img src="${esc(p.images[0])}" alt="${esc(p.nom)}" loading="lazy" onerror="this.parentNode.classList.add('placeholder');this.src='assets/logo-poires.png';this.alt='';this.onerror=null"></div>`;
    }
    return `<div class="${cls} placeholder"><img src="assets/logo-poires.png" alt=""></div>`;
  }

  // Libellé court d'un format pour le menu : « 0.5L (1 caïeux) » → « 0.5L »,
  // « Racines nues (2 ans, 1.60 m) » → « Racines nues, 1.60 m » (on garde la hauteur des racines nues).
  const estRacinesNues = (f) => /racine/i.test(f);
  function libelleCourt(f) {
    const parenthese = (f.match(/\(([^)]*)\)/) || [])[1] || "";
    const hauteur = parenthese.match(/\d+(?:[.,]\d+)?\s*c?m\b/i);
    let s = f.replace(/\s*\([^)]*\)/g, "").replace(/(\D)\s*,\s*/g, "$1, ").trim();
    if (hauteur && estRacinesNues(s) && !/\d\s*c?m\b/i.test(s)) s += `, ${hauteur[0]}`;
    return s;
  }
  function libelles(p) {
    const courts = p.variants.map((v) => libelleCourt(v.format));
    // En cas de doublon après simplification, on garde le libellé complet
    return courts.map((c, i) => (courts.indexOf(c) !== courts.lastIndexOf(c) ? p.variants[i].format : c));
  }

  // Menu des formats + quantité + ajout au panier, affichés sur l'étiquette et dans la fiche.
  // Un format en rupture reste sélectionnable : le bouton devient « M'avertir du retour en stock ».
  function orderBox(p) {
    const premier = p.variants.findIndex((v) => v.stock > 0);
    const choisi = premier >= 0 ? premier : 0;
    const noms = libelles(p);
    const options = p.variants.map((v, vi) =>
      `<option value="${vi}"${vi === choisi ? " selected" : ""}>${esc(noms[vi])}</option>`).join("");
    const v = p.variants[choisi];
    return `
      <div class="order-box${v.stock > 0 ? "" : " is-out"}">
        ${p.variants.length > 1
          ? `<select class="order-format" aria-label="Choisir le format de ${esc(p.nom)}">${options}</select>`
          : `<input type="hidden" class="order-format" value="0"><p class="order-single">${esc(noms[0])}</p>`}
        <p class="order-note"${estRacinesNues(v.format) ? "" : " hidden"}>🌱 Retrait de fin novembre à fin janvier · commande possible dès maintenant</p>
        <div class="order-row">
          <div class="qty" role="group" aria-label="Quantité">
            <button type="button" data-q="-1" aria-label="Moins">−</button>
            <span class="qty-val">1</span>
            <button type="button" data-q="1" aria-label="Plus">+</button>
          </div>
          <button type="button" class="btn-add">Ajouter au panier</button>
        </div>
        <button type="button" class="btn-notify">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>
          M'avertir du retour en stock
        </button>
      </div>`;
  }

  // Changer de format : quantité remise à 1, bascule « ajouter » / « m'avertir »
  function onFormatChange(e, p) {
    if (!e.target.matches(".order-format")) return;
    const box = e.target.closest(".order-box");
    const v = p.variants[Number(e.target.value)];
    box.querySelector(".qty-val").textContent = "1";
    box.classList.toggle("is-out", v.stock <= 0);
    box.querySelector(".order-note").hidden = !estRacinesNues(v.format);
    const card = e.target.closest(".card");
    if (card) {
      card.querySelector(".card-price").textContent = price(v.prix);
      const st = card.querySelector(".card-stock");
      st.textContent = v.stock > 0 ? "En stock" : "Rupture";
      st.classList.toggle("out", v.stock <= 0);
    }
  }

  // Gestion des boutons d'une zone de commande (étiquette ou fiche)
  function handleOrderClick(e, p) {
    const box = e.target.closest(".order-box");
    if (!box || !window.panier) return false;
    const v = p.variants[Number(box.querySelector(".order-format").value)];
    if (e.target.closest(".btn-notify")) { window.panier.avertir(p.nom, v.format); return true; }
    const val = box.querySelector(".qty-val");
    const reste = Math.max(1, v.stock - window.panier.quantiteDans(p.nom, v.format));
    const step = e.target.closest("[data-q]");
    if (step) {
      val.textContent = Math.min(reste, Math.max(1, Number(val.textContent) + Number(step.dataset.q)));
    } else if (e.target.closest(".btn-add")) {
      if (window.panier.ajouter(p.nom, v.format, v.prix, v.stock, Number(val.textContent))) val.textContent = "1";
    }
    return true;
  }

  function card(p, i) {
    const out = p.stock_total <= 0;
    const pills = [
      p.rusticite && `<span class="pill" title="Rusticité">❄ ${esc(p.rusticite)}</span>`,
      p.exposition && `<span class="pill" title="Exposition">☀ ${esc(p.exposition)}</span>`,
      p.hauteur && `<span class="pill" title="Hauteur">↕ ${esc(p.hauteur)}</span>`,
    ].filter(Boolean).join("");
    const defaut = p.variants[Math.max(0, p.variants.findIndex((v) => v.stock > 0))];
    return `
      <article class="card" data-i="${i}" style="--c:${catColor(p.categorie)}">
        <div class="card-media-wrap">
          ${media(p, "card-media")}
          <span class="badge">${esc(p.categorie)}</span>
          ${out ? '<span class="badge out">Épuisé</span>' : ""}
        </div>
        <div class="card-body">
          <h2 class="card-title"><button type="button" class="card-open">${esc(p.nom)}</button></h2>
          ${p.latin ? `<p class="card-latin">${esc(p.latin)}</p>` : ""}
          <div class="card-meta">${pills}</div>
          <div class="card-footer">
            <span class="card-price">${price(defaut.prix)}</span>
            <span class="card-stock${defaut.stock > 0 ? "" : " out"}">${defaut.stock > 0 ? "En stock" : "Rupture"}</span>
          </div>
          ${orderBox(p)}
        </div>
      </article>`;
  }

  let shown = [];
  function render() {
    shown = filtered();
    els.grid.innerHTML = shown.map(card).join("");
    els.none.hidden = shown.length > 0;
    els.count.innerHTML = `<strong>${shown.length}</strong> plante${shown.length > 1 ? "s" : ""} sur ${plants.length}`;
  }

  // Clic sur l'étiquette : les commandes restent sur place, le reste ouvre la fiche complète
  els.grid.addEventListener("click", (e) => {
    const c = e.target.closest(".card");
    if (!c) return;
    const p = shown[Number(c.dataset.i)];
    if (e.target.closest(".order-box")) { handleOrderClick(e, p); return; }
    openModal(p);
  });
  els.grid.addEventListener("change", (e) => {
    const c = e.target.closest(".card");
    if (c) onFormatChange(e, shown[Number(c.dataset.i)]);
  });

  function openModal(p) {
    lastFocus = document.activeElement;
    const gallery = p.images && p.images.length
      ? `<div class="modal-gallery">${p.images.map((src) => `<img src="${esc(src)}" alt="${esc(p.nom)}">`).join("")}</div>`
      : "";
    const info = [
      ["Rusticité", p.rusticite], ["Exposition", p.exposition], ["Hauteur", p.hauteur],
      ["Sol", p.terrain], ["Feuillage", p.feuillage], ["Origine", p.origine],
      ["Famille", p.categorie_detail],
    ].filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join("");
    const rows = p.variants.map((v) => `
      <tr><td>${esc(v.format)}</td><td class="price">${price(v.prix)}</td>
      <td>${v.stock > 0 ? `<span class="card-stock">${v.stock} dispo.</span>` : '<span class="card-stock out">Rupture</span>'}</td></tr>`).join("");

    els.modalContent.innerHTML = `
      ${gallery}
      <div class="modal-body" style="--c:${catColor(p.categorie)}">
        <span class="badge">${esc(p.categorie)}</span>
        <h2 id="modal-title">${esc(p.nom)}</h2>
        ${p.latin ? `<p class="card-latin">${esc(p.latin)}</p>` : ""}
        <dl class="modal-info-grid">${info}</dl>
        <h3>Formats disponibles</h3>
        <table class="variant-table">
          <thead><tr><th>Format</th><th>Prix</th><th>Stock</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <h3>Commander</h3>
        ${orderBox(p)}
        <p class="modal-order-note">Retrait à la pépinière de Hautefaye. Paiement par virement, ou sur place (espèces, chèque).</p>
      </div>`;
    els.modalContent.dataset.plant = plants.indexOf(p);
    els.overlay.hidden = false;
    document.body.style.overflow = "hidden";
    els.modalClose.focus();
  }

  // Ajout au panier depuis la fiche
  els.modalContent.addEventListener("click", (e) => handleOrderClick(e, plants[Number(els.modalContent.dataset.plant)]));
  els.modalContent.addEventListener("change", (e) => onFormatChange(e, plants[Number(els.modalContent.dataset.plant)]));

  function closeModal() {
    els.overlay.hidden = true;
    document.body.style.overflow = "";
    if (lastFocus) lastFocus.focus();
  }
  els.modalClose.addEventListener("click", closeModal);
  els.overlay.addEventListener("click", (e) => { if (e.target === els.overlay) closeModal(); });
  document.addEventListener("keydown", (e) => {
    // Si le panier est ouvert par-dessus la fiche, Échap ferme d'abord le panier
    if (e.key === "Escape" && !els.overlay.hidden && document.getElementById("drawer-overlay").hidden) closeModal();
  });
})();

// Bande d'images : fondu d'une image à l'autre toutes les 5 secondes
(() => {
  const slider = document.querySelector(".hero-slider");
  if (!slider) return;
  const slides = [...slider.querySelectorAll(".slide")];
  const dots = slider.querySelector(".slider-dots");
  dots.innerHTML = slides.map((_, i) =>
    `<button type="button" aria-label="Image ${i + 1}" aria-pressed="${i === 0}"></button>`).join("");
  let current = 0;
  let timer = null;
  const show = (n) => {
    current = (n + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle("is-active", i === current));
    [...dots.children].forEach((d, i) => d.setAttribute("aria-pressed", i === current));
  };
  const reduit = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const start = () => { if (!reduit && slides.length > 1) timer = setInterval(() => show(current + 1), 5000); };
  const stop = () => clearInterval(timer);
  dots.addEventListener("click", (e) => {
    const i = [...dots.children].indexOf(e.target.closest("button"));
    if (i >= 0) { stop(); show(i); start(); }
  });
  slider.addEventListener("mouseenter", stop);
  slider.addEventListener("mouseleave", () => { stop(); start(); });
  start();
})();
