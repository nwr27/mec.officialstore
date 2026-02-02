/* =========================
   CONFIG
========================= */
const CONFIG = {
  storeName: "MEC Official Store",
  whatsappNumber: "6285169729754", // ganti: pakai format negara tanpa + (Indonesia: 62...)
  sheetId: "1KKvbtZFsr4R8Eta0P206bzqIZu-aflMCCHmDJFk84ag",
  sheetName: "Products",
  currency: "IDR",
  placeholderImg: "assets/mec22.png",
  minStockGood: 5
};

/* =========================
   HELPERS
========================= */
const rupiah = (n) => {
  const num = Number(n || 0);
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: CONFIG.currency, maximumFractionDigits: 0 }).format(num);
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

const waLink = (text) => {
  const msg = encodeURIComponent(text);
  return `https://wa.me/${CONFIG.whatsappNumber}?text=${msg}`;
};

const normalize = (s) => String(s ?? "").toLowerCase().trim();

const parseBool = (v) => {
  const s = normalize(v);
  return s === "true" || s === "yes" || s === "1" || s === "y";
};

/* =========================
   GOOGLE SHEETS FETCH (GVIZ)
   - Sheet harus publish to web
========================= */
async function fetchProducts() {
  // GVIZ JSON format:
  // https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:json&sheet=Products
  const url = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(CONFIG.sheetName)}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Gagal fetch sheet: HTTP ${res.status}`);
  const text = await res.text();

  // GVIZ mengembalikan: google.visualization.Query.setResponse({...});
  const json = JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1));
  const table = json.table;

  const cols = table.cols.map(c => normalize(c.label));
  const rows = table.rows || [];

  const idx = (name) => cols.indexOf(normalize(name));

  const map = {
    sku: idx("sku"),
    name: idx("name"),
    category: idx("category"),
    price: idx("price"),
    stock: idx("stock"),
    image: idx("image"),
    short: idx("short"),
    specs: idx("specs"),
    featured: idx("featured")
  };

  const products = rows.map(r => {
    const c = r.c || [];
    const get = (i) => (i >= 0 && c[i] && c[i].v !== null && c[i].v !== undefined) ? c[i].v : "";

    const sku = String(get(map.sku)).trim();
    const name = String(get(map.name)).trim();
    if (!sku || !name) return null;

    const category = String(get(map.category) || "Parts").trim();
    const price = Number(get(map.price) || 0);
    const stock = Number(get(map.stock) || 0);
    const image = String(get(map.image)).trim() || CONFIG.placeholderImg;
    const short = String(get(map.short)).trim();
    const specs = String(get(map.specs)).trim();
    const featured = parseBool(get(map.featured));

    return { sku, name, category, price, stock, image, short, specs, featured };
  }).filter(Boolean);

  return products;
}

/* =========================
   STATE
========================= */
let ALL = [];
let FILTERED = [];
let CURRENT = null;

const CART_KEY = "MEC_cart_v1";
const cartLoad = () => {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || {}; }
  catch { return {}; }
};
const cartSave = (obj) => localStorage.setItem(CART_KEY, JSON.stringify(obj));
const cart = {
  items: cartLoad(), // { sku: qty }
  add(sku, qty = 1) {
    const cur = Number(this.items[sku] || 0);
    this.items[sku] = cur + qty;
    if (this.items[sku] <= 0) delete this.items[sku];
    cartSave(this.items);
  },
  set(sku, qty) {
    const q = Number(qty || 0);
    if (q <= 0) delete this.items[sku];
    else this.items[sku] = q;
    cartSave(this.items);
  },
  clear() {
    this.items = {};
    cartSave(this.items);
  },
  count() {
    return Object.values(this.items).reduce((a,b) => a + Number(b || 0), 0);
  }
};

/* =========================
   DOM
========================= */
const els = {
  year: document.getElementById("year"),
  statusBar: document.getElementById("statusBar"),
  grid: document.getElementById("productGrid"),
  search: document.getElementById("searchInput"),
  category: document.getElementById("categorySelect"),
  sort: document.getElementById("sortSelect"),

  modal: document.getElementById("productModal"),
  modalClose: document.getElementById("modalClose"),
  modalTitle: document.getElementById("modalTitle"),
  modalImg: document.getElementById("modalImg"),
  modalCat: document.getElementById("modalCat"),
  modalSku: document.getElementById("modalSku"),
  modalPrice: document.getElementById("modalPrice"),
  modalShort: document.getElementById("modalShort"),
  modalSpecs: document.getElementById("modalSpecs"),
  modalAdd: document.getElementById("modalAdd"),
  modalWA: document.getElementById("modalWA"),

  cartBtn: document.getElementById("cartBtn"),
  cartCount: document.getElementById("cartCount"),
  cartDrawer: document.getElementById("cartDrawer"),
  cartClose: document.getElementById("cartClose"),
  cartItems: document.getElementById("cartItems"),
  cartTotal: document.getElementById("cartTotal"),
  cartClear: document.getElementById("cartClear"),
  cartCheckout: document.getElementById("cartCheckout"),

  quickForm: document.getElementById("quickForm"),
  qName: document.getElementById("qName"),
  qNeed: document.getElementById("qNeed"),
  qMsg: document.getElementById("qMsg"),

  waHeader: document.getElementById("waHeader"),
  waCatalog: document.getElementById("waCatalog"),
  waRepair: document.getElementById("waRepair"),
  waParts: document.getElementById("waParts"),
  waCustom: document.getElementById("waCustom"),
  waContact: document.getElementById("waContact")
};

/* =========================
   RENDER
========================= */
function setStatus(msg, isError = false) {
  els.statusBar.textContent = msg;
  els.statusBar.classList.remove("hidden");
  els.statusBar.style.borderColor = isError ? "rgba(255,92,122,.35)" : "rgba(255,255,255,.12)";
  els.statusBar.style.color = isError ? "rgba(255,92,122,.95)" : "rgba(233,238,248,.72)";
}

function clearStatus() {
  els.statusBar.classList.add("hidden");
}

function updateCartBadge() {
  els.cartCount.textContent = String(cart.count());
}

function uniqueCategories(list) {
  const set = new Set(list.map(p => p.category).filter(Boolean));
  return Array.from(set).sort((a,b) => a.localeCompare(b, "id"));
}

function fillCategoryOptions() {
  const cats = uniqueCategories(ALL);
  const opts = [
    `<option value="ALL">Semua kategori</option>`,
    ...cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`)
  ];
  els.category.innerHTML = opts.join("");
}

function sortProducts(list, mode) {
  const arr = [...list];
  if (mode === "price_asc") arr.sort((a,b) => a.price - b.price);
  else if (mode === "price_desc") arr.sort((a,b) => b.price - a.price);
  else if (mode === "name_asc") arr.sort((a,b) => a.name.localeCompare(b.name, "id"));
  else { // featured
    arr.sort((a,b) => {
      const fa = a.featured ? 1 : 0;
      const fb = b.featured ? 1 : 0;
      if (fb !== fa) return fb - fa;
      return a.name.localeCompare(b.name, "id");
    });
  }
  return arr;
}

function applyFilters() {
  const q = normalize(els.search.value);
  const cat = els.category.value;
  const sort = els.sort.value;

  let list = ALL;

  if (cat && cat !== "ALL") {
    list = list.filter(p => p.category === cat);
  }

  if (q) {
    list = list.filter(p => {
      const blob = normalize(`${p.sku} ${p.name} ${p.category} ${p.short} ${p.specs}`);
      return blob.includes(q);
    });
  }

  list = sortProducts(list, sort);

  FILTERED = list;
  renderGrid();
}

function stockClass(stock) {
  if (stock <= 0) return "bad";
  if (stock < CONFIG.minStockGood) return "";
  return "good";
}

function stockText(stock) {
  if (stock <= 0) return "Stok habis";
  return `Stok: ${stock}`;
}

function productCard(p) {
  const stockCls = stockClass(p.stock);
  const stockStr = stockText(p.stock);
  const featuredBadge = p.featured ? `<span class="badge">Unggulan</span>` : "";

  return `
    <article class="card product" data-sku="${esc(p.sku)}">
      <div class="imgwrap">
        <img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy" />
      </div>
      <div class="pbody">
        <div class="badges">
          <span class="badge">${esc(p.category)}</span>
          ${featuredBadge}
        </div>

        <h3 title="${esc(p.name)}">${esc(p.name)}</h3>
        <p class="desc">${esc(p.short || "Klik detail untuk melihat spesifikasi.")}</p>

        <div class="row">
          <div class="price">${rupiah(p.price)}</div>
          <div class="stock ${stockCls}">${esc(stockStr)}</div>
        </div>

        <div class="actions">
          <button class="btn btn-ghost" data-action="detail">Detail</button>
          <button class="btn btn-primary" data-action="add" ${p.stock <= 0 ? "disabled" : ""}>Tambah</button>
        </div>
      </div>
    </article>
  `;
}

function renderGrid() {
  if (!FILTERED.length) {
    els.grid.innerHTML = `
      <div class="statusbar" style="grid-column: 1 / -1;">
        Tidak ada produk yang cocok. Coba ganti kata kunci atau kategori.
      </div>
    `;
    return;
  }
  els.grid.innerHTML = FILTERED.map(productCard).join("");
}

function openModal(p) {
  CURRENT = p;

  els.modalTitle.textContent = p.name;
  els.modalImg.src = p.image || CONFIG.placeholderImg;
  els.modalCat.textContent = p.category;
  els.modalSku.textContent = `SKU: ${p.sku}`;
  els.modalPrice.textContent = rupiah(p.price);
  els.modalShort.textContent = p.short || "";
  els.modalSpecs.textContent = p.specs ? `Spesifikasi:\n${p.specs}` : "Spesifikasi: (belum diisi)";

  const msg = [
    `Halo ${CONFIG.storeName}, saya mau order:`,
    `- ${p.name} (SKU ${p.sku})`,
    `- Qty: 1`,
    `Mohon info stok dan totalnya ya.`
  ].join("\n");

  els.modalWA.href = waLink(msg);
  els.modalAdd.disabled = p.stock <= 0;

  els.modal.showModal();
}

function closeModal() {
  CURRENT = null;
  els.modal.close();
}

/* =========================
   CART UI
========================= */
function cartLine(product, qty) {
  const lineTotal = product.price * qty;
  return `
    <div class="cart-item" data-sku="${esc(product.sku)}">
      <div>
        <div class="name">${esc(product.name)}</div>
        <div class="sub">${esc(product.sku)} • ${esc(product.category)} • ${rupiah(product.price)} / pcs</div>
      </div>
      <div class="qty">
        <button type="button" data-q="-1">-</button>
        <span>${qty}</span>
        <button type="button" data-q="1">+</button>
      </div>
    </div>
  `;
}

function renderCart() {
  const items = cart.items;
  const skus = Object.keys(items);
  if (!skus.length) {
    els.cartItems.innerHTML = `
      <div class="statusbar">Keranjang kosong. Tambahkan produk dulu.</div>
    `;
    els.cartTotal.textContent = rupiah(0);
    els.cartCheckout.href = waLink(`Halo ${CONFIG.storeName}, saya mau tanya produk dan stok.`);
    updateCartBadge();
    return;
  }

  let total = 0;
  const lines = skus.map(sku => {
    const p = ALL.find(x => x.sku === sku);
    const qty = Number(items[sku] || 0);
    if (!p || qty <= 0) return "";
    total += p.price * qty;
    return cartLine(p, qty);
  }).filter(Boolean);

  els.cartItems.innerHTML = lines.join("");
  els.cartTotal.textContent = rupiah(total);

  const orderLines = skus.map(sku => {
    const p = ALL.find(x => x.sku === sku);
    const qty = Number(items[sku] || 0);
    if (!p || qty <= 0) return null;
    return `- ${p.name} (SKU ${p.sku}) x ${qty} = ${rupiah(p.price * qty)}`;
  }).filter(Boolean);

  const msg = [
    `Halo ${CONFIG.storeName}, saya mau order:`,
    ...orderLines,
    `Total estimasi: ${rupiah(total)}`,
    ``,
    `Mohon info stok final dan total pembayaran ya.`
  ].join("\n");

  els.cartCheckout.href = waLink(msg);
  updateCartBadge();
}

function openCart() {
  renderCart();
  els.cartDrawer.showModal();
}
function closeCart() {
  els.cartDrawer.close();
}

/* =========================
   EVENTS
========================= */
function wireWhatsAppLinks() {
  const base = `Halo ${CONFIG.storeName}, saya mau tanya produk dan layanan.`;
  els.waHeader.href = waLink(base);
  els.waCatalog.href = waLink(`Halo ${CONFIG.storeName}, saya mau tanya stok dan katalog produk.`);
  els.waContact.href = waLink(base);

  els.waRepair.href = waLink(`Halo ${CONFIG.storeName}, saya mau konsultasi perbaikan alat elektronika. Keluhan saya: ...`);
  els.waParts.href = waLink(`Halo ${CONFIG.storeName}, saya mau tanya part. Yang saya cari: ...`);
  els.waCustom.href = waLink(`Halo ${CONFIG.storeName}, saya mau request custom assembly. Kebutuhan saya: ...`);
}

function wireUI() {
  els.year.textContent = String(new Date().getFullYear());
  updateCartBadge();
  wireWhatsAppLinks();

  els.search.addEventListener("input", () => applyFilters());
  els.category.addEventListener("change", () => applyFilters());
  els.sort.addEventListener("change", () => applyFilters());

  els.grid.addEventListener("click", (e) => {
    const card = e.target.closest(".product");
    if (!card) return;
    const sku = card.getAttribute("data-sku");
    const p = ALL.find(x => x.sku === sku);
    if (!p) return;

    const action = e.target.getAttribute("data-action");
    if (action === "detail") openModal(p);
    if (action === "add") {
      cart.add(p.sku, 1);
      updateCartBadge();
      setStatus(`Ditambahkan: ${p.name}`);
      setTimeout(clearStatus, 1200);
    }
  });

  els.modalClose.addEventListener("click", closeModal);
  els.modal.addEventListener("click", (e) => {
    const box = e.target.closest(".modal-body, .modal-head");
    if (!box) closeModal();
  });

  els.modalAdd.addEventListener("click", () => {
    if (!CURRENT) return;
    cart.add(CURRENT.sku, 1);
    updateCartBadge();
    closeModal();
    setStatus(`Ditambahkan: ${CURRENT.name}`);
    setTimeout(clearStatus, 1200);
  });

  els.cartBtn.addEventListener("click", openCart);
  els.cartClose.addEventListener("click", closeCart);

  els.cartItems.addEventListener("click", (e) => {
    const item = e.target.closest(".cart-item");
    if (!item) return;
    const sku = item.getAttribute("data-sku");
    const delta = Number(e.target.getAttribute("data-q") || 0);
    if (!delta) return;

    const cur = Number(cart.items[sku] || 0);
    cart.set(sku, cur + delta);
    renderCart();
  });

  els.cartClear.addEventListener("click", () => {
    cart.clear();
    renderCart();
  });

  els.quickForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = els.qName.value.trim();
    const need = els.qNeed.value;
    const msg = els.qMsg.value.trim();

    const text = [
      `Halo ${CONFIG.storeName}, saya mau ${need}.`,
      name ? `Nama: ${name}` : null,
      msg ? `Detail: ${msg}` : `Detail: (belum diisi)`,
      ``,
      `Mohon info langkah selanjutnya ya.`
    ].filter(Boolean).join("\n");

    window.open(waLink(text), "_blank", "noopener");
  });
}

/* =========================
   INIT
========================= */
(async function init(){
  wireUI();

  setStatus("Memuat produk dari Google Sheets...");
  try{
    const products = await fetchProducts();
    ALL = products;

    fillCategoryOptions();
    applyFilters();

    setStatus(`Berhasil memuat ${ALL.length} produk.`);
    setTimeout(clearStatus, 1400);
  }catch(err){
    console.error(err);
    setStatus(
      "Gagal memuat produk. Pastikan Google Sheets sudah Publish to web, nama sheet benar (Products), dan SHEET_ID di app.js sudah benar.",
      true
    );
  }
})();
