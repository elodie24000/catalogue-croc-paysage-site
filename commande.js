// Commande en ligne Croc'Paysage — panier, calendrier de retrait et envoi à la pépinière.
// Chargé avant script.js, qui appelle window.panier.ajouter(...) depuis les fiches produit.
(() => {
  const API = "https://irqxkuhkkdqawksmblfl.supabase.co/functions/v1/commande";
  // Clé publique « anon » : elle n'autorise que l'appel de la fonction, pas la lecture des commandes.
  const CLE = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlycXhrdWhra2RxYXdrc21ibGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA1MzYxMzksImV4cCI6MjEwNjExMjEzOX0.hac-A-7AF7ItL93x3qcn5TN_RdPbWMZnVVyFMbKa-kY";
  const STOCKAGE = "croc-panier-v1";

  // Créneaux de retrait d'une heure (0 = dimanche … 6 = samedi) : fournis par le serveur,
  // ces valeurs ne servent qu'en attendant sa réponse
  const heures = (...h) => h.map((x) => ({ id: `${String(x).padStart(2, "0")}:00`, label: `${x}h – ${x + 1}h` }));
  let CRENEAUX = { 1: heures(14, 15, 16), 5: heures(14, 15, 16), 6: heures(9, 10, 11, 14, 15, 16) };
  let reserves = {}; // { "AAAA-MM-JJ": ["14:00", …] } créneaux complets
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const euros = (n) => n.toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €";
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const depuisIso = (s) => { const [a, m, j] = s.split("-").map(Number); return new Date(a, m - 1, j); };
  const dateLongue = (s) => depuisIso(s).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  const els = {
    bouton: $("cart-button"), compteur: $("cart-count"), boutonTotal: $("cart-button-total"),
    fond: $("drawer-overlay"), tiroir: $("drawer"), fermer: $("drawer-close"), titre: $("drawer-title"),
    etapes: { panier: $("step-cart"), infos: $("step-checkout"), ok: $("step-done") },
    lignes: $("cart-lines"), vide: $("cart-empty"), pied: $("cart-footer"), total: $("cart-total"),
    versInfos: $("to-checkout"), retour: $("back-to-cart"), form: $("checkout-form"),
    cal: $("calendar"), creneaux: $("slots"), choix: $("pickup-summary"), erreur: $("checkout-error"),
    envoyer: $("submit-order"), recap: $("checkout-total"), merci: $("done-content"), toast: $("toast"),
  };

  // ---------- Panier (gardé dans le navigateur du client) ----------
  let panier = [];
  try { panier = JSON.parse(localStorage.getItem(STOCKAGE)) || []; } catch { panier = []; }
  const sauver = () => { try { localStorage.setItem(STOCKAGE, JSON.stringify(panier)); } catch { /* navigation privée */ } };
  const cle = (plante, format) => `${plante}|${format}`;
  const quantiteDans = (plante, format) => panier.find((l) => cle(l.plante, l.format) === cle(plante, format))?.quantite || 0;
  const total = () => Math.round(panier.reduce((s, l) => s + l.prix * l.quantite, 0) * 100) / 100;
  const nbArticles = () => panier.reduce((s, l) => s + l.quantite, 0);
  const estRacinesNues = (f) => /racine/i.test(f);
  const avecRacines = () => panier.some((l) => estRacinesNues(l.format));

  function ajouter(plante, format, prix, stock, quantite) {
    const deja = quantiteDans(plante, format);
    const possible = Math.max(0, Math.min(quantite, stock - deja));
    if (possible <= 0) { toast(`Il n'y a plus de stock disponible pour ce format.`); return 0; }
    const ligne = panier.find((l) => cle(l.plante, l.format) === cle(plante, format));
    if (ligne) ligne.quantite += possible;
    else panier.push({ plante, format, prix, stock, quantite: possible });
    sauver();
    majBouton(true);
    toast(`${possible} × ${plante} (${format}) ajouté${possible > 1 ? "s" : ""} au panier`);
    return possible;
  }

  function majBouton(anime) {
    const n = nbArticles();
    els.bouton.hidden = n === 0;
    els.compteur.textContent = n;
    els.boutonTotal.textContent = euros(total());
    if (anime) { els.bouton.classList.remove("bump"); void els.bouton.offsetWidth; els.bouton.classList.add("bump"); }
  }

  function rendrePanier() {
    els.vide.hidden = panier.length > 0;
    els.pied.hidden = panier.length === 0;
    els.lignes.innerHTML = panier.map((l, i) => `
      <li class="cart-line">
        <div class="cart-line-info">
          <strong>${esc(l.plante)}</strong>
          <span>${esc(l.format)} · ${euros(l.prix)}</span>
          ${estRacinesNues(l.format) ? '<span class="cart-root-note">🌱 Retrait de fin novembre à fin janvier</span>' : ""}
        </div>
        <div class="qty" role="group" aria-label="Quantité">
          <button type="button" data-i="${i}" data-d="-1" aria-label="Retirer un">−</button>
          <span>${l.quantite}</span>
          <button type="button" data-i="${i}" data-d="1" aria-label="Ajouter un" ${l.quantite >= l.stock ? "disabled" : ""}>+</button>
        </div>
        <span class="cart-line-total">${euros(l.prix * l.quantite)}</span>
        <button type="button" class="cart-remove" data-i="${i}" aria-label="Supprimer ${esc(l.plante)}">✕</button>
      </li>`).join("");
    els.total.textContent = euros(total());
    majBouton(false);
  }

  els.lignes.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const i = Number(b.dataset.i);
    if (b.classList.contains("cart-remove")) panier.splice(i, 1);
    else {
      panier[i].quantite = Math.min(panier[i].stock, panier[i].quantite + Number(b.dataset.d));
      if (panier[i].quantite <= 0) panier.splice(i, 1);
    }
    sauver();
    rendrePanier();
  });

  // ---------- Tiroir ----------
  let dernierFocus = null;
  function etape(nom) {
    Object.entries(els.etapes).forEach(([k, el]) => { el.hidden = k !== nom; });
    els.titre.textContent = { panier: "Mon panier", infos: "Ma commande", ok: "Commande envoyée" }[nom];
    els.tiroir.scrollTop = 0;
  }
  function ouvrir() {
    dernierFocus = document.activeElement;
    etape("panier");
    rendrePanier();
    els.fond.hidden = false;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => els.fond.classList.add("open"));
    els.fermer.focus();
  }
  function fermer() {
    els.fond.classList.remove("open");
    document.body.style.overflow = "";
    setTimeout(() => { els.fond.hidden = true; }, 250);
    if (dernierFocus) dernierFocus.focus();
  }
  els.bouton.addEventListener("click", ouvrir);
  els.fermer.addEventListener("click", fermer);
  els.fond.addEventListener("click", (e) => { if (e.target === els.fond) fermer(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !els.fond.hidden) fermer(); });
  els.versInfos.addEventListener("click", () => { etape("infos"); els.recap.textContent = euros(total()); chargerFermetures(); });
  els.retour.addEventListener("click", () => { etape("panier"); rendrePanier(); });

  // ---------- Calendrier de retrait ----------
  let fermetures = null; // { "AAAA-MM-JJ": motif }
  let infos = null;      // réponse du serveur : aujourdhui, jours_max, racines_nues { debut, fin }
  let bornes = null;     // { min, max } au format AAAA-MM-JJ
  let moisAffiche = null;
  let choix = { date: null, creneau: null };

  // Dates de retrait possibles : racines nues → pendant leur saison ; sinon dans les jours_max jours
  function preparerCalendrier() {
    const aujourdhui = depuisIso(infos.aujourdhui);
    const demain = new Date(aujourdhui); demain.setDate(demain.getDate() + 1);
    const info = $("root-info");
    if (avecRacines() && infos.racines_nues) {
      const s = infos.racines_nues;
      bornes = { min: s.debut > iso(demain) ? s.debut : iso(demain), max: s.fin };
      info.innerHTML = `🌱 Votre panier contient des <strong>racines nues</strong> : elles se retirent entre le
        <strong>${dateLongue(s.debut)}</strong> et le <strong>${dateLongue(s.fin)}</strong>.
        Pour retirer vos plants en pot plus tôt, passez-les dans une commande séparée.`;
      info.hidden = false;
    } else {
      const max = new Date(aujourdhui); max.setDate(max.getDate() + infos.jours_max);
      bornes = { min: iso(demain), max: iso(max) };
      info.hidden = true;
    }
    if (choix.date && (choix.date < bornes.min || choix.date > bornes.max)) { choix = { date: null, creneau: null }; dessinerCreneaux(); }
    // On ouvre le calendrier sur le mois du premier jour de retrait possible (et non sur un mois vide)
    const debut = depuisIso(choix.date || premierJourOuvert() || bornes.min);
    moisAffiche = new Date(debut.getFullYear(), debut.getMonth(), 1);
    dessinerCalendrier();
  }

  async function chargerFermetures() {
    if (fermetures) { preparerCalendrier(); return; }
    els.cal.innerHTML = '<p class="cal-loading">Chargement des dates disponibles…</p>';
    try {
      const r = await fetch(API, { headers: { Authorization: `Bearer ${CLE}`, apikey: CLE } });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      fermetures = d.fermetures || {};
      infos = d;
      if (d.creneaux) CRENEAUX = d.creneaux;
      reserves = d.reserves || {};
      preparerCalendrier();
    } catch {
      els.cal.innerHTML = `<p class="cal-loading">Impossible de charger les dates de retrait.
        <button type="button" class="link-btn" id="cal-retry">Réessayer</button></p>`;
      $("cal-retry").addEventListener("click", chargerFermetures);
    }
  }

  function premierJourOuvert() {
    for (let d = depuisIso(bornes.min); iso(d) <= bornes.max; d.setDate(d.getDate() + 1)) {
      if (etatJour(iso(d)).ok) return iso(d);
    }
    return null;
  }

  function etatJour(s) {
    if (s < bornes.min || s > bornes.max) return { ok: false };
    const liste = CRENEAUX[depuisIso(s).getDay()];
    if (!liste) return { ok: false };
    if (fermetures[s]) return { ok: false, ferme: fermetures[s] };
    if (liste.every((c) => (reserves[s] || []).includes(c.id))) return { ok: false, complet: true };
    return { ok: true };
  }

  function dessinerCalendrier() {
    const a = moisAffiche.getFullYear(), m = moisAffiche.getMonth();
    const premier = new Date(a, m, 1);
    const decalage = (premier.getDay() + 6) % 7; // semaine commençant le lundi
    const nbJours = new Date(a, m + 1, 0).getDate();
    const precedentOk = iso(new Date(a, m, 0)) >= bornes.min;
    const suivantOk = iso(new Date(a, m + 1, 1)) <= bornes.max;
    let cases = "";
    let ouverts = 0;
    for (let i = 0; i < decalage; i++) cases += '<span class="cal-day empty"></span>';
    for (let j = 1; j <= nbJours; j++) {
      const s = iso(new Date(a, m, j));
      const e = etatJour(s);
      if (e.ok) ouverts++;
      const cls = ["cal-day", e.ok ? "open" : "", e.ferme ? "closed" : "", e.complet ? "full" : "", s === choix.date ? "selected" : ""].join(" ");
      cases += e.ok
        ? `<button type="button" class="${cls}" data-date="${s}" aria-pressed="${s === choix.date}" aria-label="${dateLongue(s)}">${j}</button>`
        : `<span class="${cls}" ${e.ferme ? `title="Fermé : ${esc(e.ferme)}"` : e.complet ? 'title="Complet"' : ""} aria-hidden="true">${j}</span>`;
    }
    els.cal.innerHTML = `
      <div class="cal-head">
        <button type="button" class="cal-nav" data-nav="-1" ${precedentOk ? "" : "disabled"} aria-label="Mois précédent">‹</button>
        <strong>${MOIS[m]} ${a}</strong>
        <button type="button" class="cal-nav" data-nav="1" ${suivantOk ? "" : "disabled"} aria-label="Mois suivant">›</button>
      </div>
      <div class="cal-grid">
        ${["lu", "ma", "me", "je", "ve", "sa", "di"].map((d) => `<span class="cal-dow">${d}</span>`).join("")}
        ${cases}
      </div>
      ${ouverts ? "" : `<p class="cal-empty">Aucun jour de retrait disponible ce mois-ci.${suivantOk ? ' <button type="button" class="link-btn" data-nav="1">Voir le mois suivant →</button>' : ""}</p>`}
      <p class="cal-legend"><span class="dot open"></span> jour de retrait <span class="dot closed"></span> fermé (foire…) <span class="dot full"></span> complet</p>`;
  }

  els.cal.addEventListener("click", (e) => {
    const nav = e.target.closest("[data-nav]");
    if (nav) { moisAffiche = new Date(moisAffiche.getFullYear(), moisAffiche.getMonth() + Number(nav.dataset.nav), 1); dessinerCalendrier(); return; }
    const j = e.target.closest("[data-date]");
    if (!j) return;
    choix = { date: j.dataset.date, creneau: null };
    dessinerCalendrier();
    dessinerCreneaux();
  });

  function dessinerCreneaux() {
    if (!choix.date) { els.creneaux.innerHTML = ""; els.choix.hidden = true; return; }
    const liste = CRENEAUX[depuisIso(choix.date).getDay()];
    els.creneaux.innerHTML = `<p class="field-label">Créneau le ${dateLongue(choix.date)}</p>
      <div class="slot-list">${liste.map((c) => (reserves[choix.date] || []).includes(c.id)
        ? `<button type="button" class="slot taken" disabled>${c.label}<small>Réservé</small></button>`
        : `<button type="button" class="slot" data-slot="${c.id}" aria-pressed="${choix.creneau === c.id}">${c.label}</button>`).join("")}
      </div>`;
    const cr = liste.find((c) => c.id === choix.creneau);
    els.choix.hidden = !cr;
    if (cr) els.choix.innerHTML = `Retrait le <strong>${dateLongue(choix.date)}</strong>, ${cr.label}`;
  }
  els.creneaux.addEventListener("click", (e) => {
    const b = e.target.closest("[data-slot]");
    if (b) { choix.creneau = b.dataset.slot; dessinerCreneaux(); }
  });

  // ---------- Envoi ----------
  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    els.erreur.hidden = true;
    if (!choix.date || !choix.creneau) return montrerErreur("Merci de choisir une date et un créneau de retrait.");
    if (!panier.length) return montrerErreur("Votre panier est vide.");
    const f = new FormData(els.form);
    if (String(f.get("nom")).trim().length < 2) return montrerErreur("Merci d'indiquer votre nom et prénom.");
    if (String(f.get("telephone")).replace(/\D/g, "").length < 9) return montrerErreur("Merci d'indiquer un numéro de téléphone valide.");
    const mail = String(f.get("email")).trim();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return montrerErreur("L'adresse e-mail semble incorrecte.");
    const corps = {
      nom: f.get("nom"), telephone: f.get("telephone"), email: f.get("email"), message: f.get("message"),
      date_retrait: choix.date, creneau: choix.creneau,
      lignes: panier.map(({ plante, format, prix, quantite }) => ({ plante, format, prix, quantite })),
    };
    els.envoyer.disabled = true;
    els.envoyer.textContent = "Envoi en cours…";
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { Authorization: `Bearer ${CLE}`, apikey: CLE, "Content-Type": "application/json" },
        body: JSON.stringify(corps),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 409) { fermetures = null; choix = { date: null, creneau: null }; chargerFermetures(); dessinerCreneaux(); }
        return montrerErreur(d.erreur || "La commande n'a pas pu être envoyée. Merci de réessayer.");
      }
      els.merci.innerHTML = `
        <div class="done-icon" aria-hidden="true">✓</div>
        <h3>Merci ${esc(corps.nom)} !</h3>
        <p>Votre commande <strong>${esc(d.numero)}</strong> est bien enregistrée.</p>
        <div class="done-box">
          <p><span>Retrait</span><strong>${dateLongue(d.date_retrait)}, ${esc(d.creneau)}</strong></p>
          <p><span>Adresse</span><strong>${esc(d.adresse)}</strong></p>
          <p><span>Total à régler</span><strong>${euros(d.total)}</strong></p>
        </div>
        <p class="muted">Paiement par virement, ou sur place au retrait (espèces, chèque). Nous vous contacterons en cas de question.</p>`;
      panier = [];
      sauver();
      majBouton(false);
      els.form.reset();
      choix = { date: null, creneau: null };
      dessinerCreneaux();
      etape("ok");
    } catch {
      montrerErreur("Pas de connexion : la commande n'a pas été envoyée. Merci de réessayer.");
    } finally {
      els.envoyer.disabled = false;
      els.envoyer.textContent = "Valider ma commande";
    }
  });
  function montrerErreur(t) {
    els.erreur.textContent = t;
    els.erreur.hidden = false;
    els.erreur.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  $("done-close").addEventListener("click", fermer);

  // ---------- Petit message de confirmation ----------
  let minuterie;
  function toast(t) {
    els.toast.textContent = t;
    els.toast.classList.add("show");
    clearTimeout(minuterie);
    minuterie = setTimeout(() => els.toast.classList.remove("show"), 2600);
  }

  // ---------- « M'avertir du retour en stock » ----------
  const alerte = {
    fond: $("notify-overlay"), form: $("notify-form"), titre: $("notify-plant"),
    erreur: $("notify-error"), envoyer: $("notify-submit"), ok: $("notify-done"), fermer: $("notify-close"),
  };
  let alerteCible = null;
  let alerteFocus = null;
  function avertir(plante, format) {
    alerteCible = { plante, format };
    alerteFocus = document.activeElement;
    alerte.titre.innerHTML = `<strong>${esc(plante)}</strong> · ${esc(format)}`;
    alerte.erreur.hidden = true;
    alerte.ok.hidden = true;
    alerte.form.hidden = false;
    alerte.fond.hidden = false;
    alerte.form.querySelector("input").focus();
  }
  function fermerAlerte() {
    alerte.fond.hidden = true;
    if (alerteFocus) alerteFocus.focus();
  }
  alerte.fermer.addEventListener("click", fermerAlerte);
  alerte.fond.addEventListener("click", (e) => { if (e.target === alerte.fond) fermerAlerte(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !alerte.fond.hidden) { e.stopImmediatePropagation(); fermerAlerte(); } }, true);
  alerte.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(alerte.form);
    const nom = String(f.get("nom")).trim();
    const email = String(f.get("email")).trim();
    const erreur = (t) => { alerte.erreur.textContent = t; alerte.erreur.hidden = false; };
    alerte.erreur.hidden = true;
    if (nom.length < 2) return erreur("Merci d'indiquer votre nom.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erreur("Merci d'indiquer une adresse e-mail valide.");
    alerte.envoyer.disabled = true;
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { Authorization: `Bearer ${CLE}`, apikey: CLE, "Content-Type": "application/json" },
        body: JSON.stringify({ type: "alerte", ...alerteCible, nom, email }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return erreur(d.erreur || "La demande n'a pas pu être envoyée. Merci de réessayer.");
      alerte.form.hidden = true;
      alerte.ok.hidden = false;
      alerte.form.querySelector('[name="nom"]').value = nom; // gardés pour une prochaine demande
    } catch {
      erreur("Pas de connexion : la demande n'a pas été envoyée. Merci de réessayer.");
    } finally {
      alerte.envoyer.disabled = false;
    }
  });

  majBouton(false);
  window.panier = { ajouter, quantiteDans, ouvrir, avertir };
})();
