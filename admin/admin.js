import { renderMarkdown, markdownToText, escapeHtml as esc } from "/shared/md.js";

const app = document.getElementById("app");
const toastsEl = document.getElementById("toasts");

const KINDS = {
  master_class: "Мастер-класс",
  event: "Корпоратив / праздник",
  certificate: "Сертификат",
  other: "Другое",
};
const STATUSES = { new: "Новая", in_progress: "В работе", done: "Выполнена", cancelled: "Отменена" };
const STATUS_TAG = { new: "tag-hot", in_progress: "tag-warn", done: "tag-ok", cancelled: "" };
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

let dirty = false;
let newOrders = 0;

/* ---------- Утилиты ---------- */

function toast(message, type = "") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastsEl.append(el);
  setTimeout(() => el.remove(), 3200);
}

class AuthError extends Error {}

async function api(method, url, body) {
  const headers = { "X-CMS": "1" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api/admin/${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== "login") {
    renderLogin();
    throw new AuthError("Нужно войти");
  }
  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

const fail = (err) => {
  if (!(err instanceof AuthError)) toast(err.message, "error");
};

/** Уменьшаем большие фото в браузере до 1800px, чтобы не хранить многомегабайтные оригиналы. */
async function prepareImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

async function upload(file) {
  const blob = await prepareImage(file);
  const res = await fetch("/api/admin/upload", {
    method: "POST",
    headers: { "X-CMS": "1", "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    renderLogin();
    throw new AuthError("Нужно войти");
  }
  if (!res.ok) throw new Error(data.error || "Не удалось загрузить фото");
  return data.url;
}

const imageFiles = (list) => [...list].filter((f) => f.type.startsWith("image/"));

/** Подключает зону загрузки: клик, выбор файлов и перетаскивание. */
function bindDropzone(zone, onFiles) {
  const input = zone.querySelector("input[type=file]");
  input.addEventListener("change", () => {
    const files = imageFiles(input.files);
    input.value = "";
    if (files.length) onFiles(files);
  });
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-over");
    const files = imageFiles(e.dataTransfer.files);
    if (files.length) onFiles(files);
  });
}

const dropzoneHtml = (text, multiple = true) => `
  <label class="dropzone">
    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" ${multiple ? "multiple" : ""} />
    <strong>${text}</strong>
    <span>или перетащите сюда · JPG, PNG, WebP</span>
  </label>`;

function formatEventDate(value) {
  if (!value) return "";
  const [d, t] = value.split("T");
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}, ${t}`;
}

function formatDate(value) {
  if (!value) return "";
  const [y, m, d] = value.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function formatCreated(value) {
  const date = new Date(value.replace(" ", "T") + "Z");
  return date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

const today = () => new Date().toLocaleDateString("sv-SE");

function confirmLeave() {
  return !dirty || confirm("Есть несохранённые изменения. Уйти без сохранения?");
}

/* ---------- Каркас и роутинг ---------- */

const NAV = [
  ["orders", "Заявки"],
  ["mk", "Мастер-классы"],
  ["gallery", "Галерея"],
  ["reviews", "Отзывы"],
];

function shell(section, content) {
  app.className = "";
  app.innerHTML = `
    <div class="layout">
      <aside class="sidebar">
        <div class="brand"><img src="/assets/img/logo.webp" alt="Паприка" /><span>CMS</span></div>
        ${NAV.map(
          ([key, label]) => `<a class="nav-link ${section === key ? "active" : ""}" href="#/${key}">
            ${label}${key === "orders" && newOrders ? `<span class="badge-count">${newOrders}</span>` : ""}</a>`
        ).join("")}
        <div class="sidebar-bottom">
          <a class="nav-link" href="/" target="_blank" rel="noopener">Открыть сайт ↗</a>
          <button class="nav-link" type="button" data-logout>Выйти</button>
        </div>
      </aside>
      <main class="main">${content}</main>
    </div>`;
  app.querySelector("[data-logout]").addEventListener("click", async () => {
    if (!confirmLeave()) return;
    dirty = false;
    await api("POST", "logout").catch(() => {});
    renderLogin();
  });
  return app.querySelector(".main");
}

async function refreshSummary() {
  try {
    const { orders } = await api("GET", "summary");
    newOrders = orders.new;
    const badge = app.querySelector('.nav-link[href="#/orders"]');
    if (badge) {
      badge.querySelector(".badge-count")?.remove();
      if (newOrders) badge.insertAdjacentHTML("beforeend", `<span class="badge-count">${newOrders}</span>`);
    }
  } catch {
    /* не критично */
  }
}

let lastHash = location.hash;
window.addEventListener("hashchange", () => {
  if (dirty && !confirm("Есть несохранённые изменения. Уйти без сохранения?")) {
    history.replaceState(null, "", lastHash || "#/orders");
    return;
  }
  dirty = false;
  route();
});
window.addEventListener("beforeunload", (e) => {
  if (dirty) e.preventDefault();
});

function route() {
  lastHash = location.hash;
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const [section = "orders", sub] = parts;
  const views = {
    orders: () => viewOrders(sub || "new"),
    mk: () => (sub ? viewMasterClassEdit(sub) : viewMasterClasses()),
    gallery: () => viewGallery(),
    reviews: () => (sub ? viewReviewEdit(sub) : viewReviews()),
  };
  (views[section] || views.orders)().catch(fail);
  refreshSummary();
}

/* ---------- Вход ---------- */

function renderLogin() {
  dirty = false;
  app.className = "";
  app.innerHTML = `
    <div class="login">
      <div class="panel">
        <img src="/assets/img/logo.webp" alt="Паприка" />
        <div class="muted">Управление сайтом</div>
        <form>
          <label class="field"><span>Пароль</span>
            <input type="password" name="password" autocomplete="current-password" required autofocus />
          </label>
          <p class="form-error" hidden></p>
          <button class="btn btn-primary" type="submit">Войти</button>
        </form>
      </div>
    </div>`;
  const form = app.querySelector("form");
  const error = form.querySelector(".form-error");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    error.hidden = true;
    try {
      await api("POST", "login", { password: form.password.value });
      route();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
    }
  });
}

/* ---------- Заявки ---------- */

async function viewOrders(status) {
  const query = status === "all" ? "" : `?status=${encodeURIComponent(status)}`;
  const { items, counts } = await api("GET", `orders${query}`);
  newOrders = counts.new;
  const tabs = [["new", "Новые"], ["in_progress", "В работе"], ["done", "Выполнены"], ["cancelled", "Отменены"], ["all", "Все"]];

  const main = shell(
    "orders",
    `
    <div class="page-head"><h1>Заявки</h1></div>
    <nav class="tabs">
      ${tabs.map(([key, label]) => `<a class="tab ${key === status ? "active" : ""}" href="#/orders/${key}">${label}<span>${counts[key] ?? 0}</span></a>`).join("")}
    </nav>
    <div class="order-list">
      ${items.length ? items.map(orderCard).join("") : `<div class="panel empty">Здесь пока пусто.</div>`}
    </div>`
  );

  main.querySelectorAll(".order-card").forEach((card) => {
    const orderId = card.dataset.id;
    const statusSelect = card.querySelector("[name=status]");
    const note = card.querySelector("[name=admin_note]");
    statusSelect.addEventListener("change", async () => {
      try {
        await api("PATCH", `orders/${orderId}`, { status: statusSelect.value });
        card.classList.toggle("is-new", statusSelect.value === "new");
        card.querySelector(".status-tag").outerHTML = statusTag(statusSelect.value);
        toast("Статус обновлён");
        refreshSummary();
      } catch (err) {
        fail(err);
      }
    });
    note.addEventListener("change", async () => {
      try {
        await api("PATCH", `orders/${orderId}`, { admin_note: note.value });
        toast("Заметка сохранена");
      } catch (err) {
        fail(err);
      }
    });
    card.querySelector("[data-delete]").addEventListener("click", async () => {
      if (!confirm("Удалить заявку безвозвратно?")) return;
      try {
        await api("DELETE", `orders/${orderId}`);
        card.remove();
        toast("Заявка удалена");
        refreshSummary();
      } catch (err) {
        fail(err);
      }
    });
  });
}

const statusTag = (s) => `<span class="tag status-tag ${STATUS_TAG[s]}">${STATUSES[s]}</span>`;

function orderCard(o) {
  const phoneHref = o.phone.replace(/[^\d+]/g, "");
  return `
    <article class="panel order-card ${o.status === "new" ? "is-new" : ""}" data-id="${o.id}">
      <div>
        <div class="order-top">
          <span>№${o.id}</span><span>·</span><span>${esc(formatCreated(o.created_at))}</span>
          ${statusTag(o.status)}
          <span class="tag">${esc(KINDS[o.kind] || o.kind)}</span>
        </div>
        <h3 class="order-name">${esc(o.name)}</h3>
        <a class="order-phone" href="tel:${esc(phoneHref)}">${esc(o.phone)}</a>
        <div class="order-meta">
          ${o.master_class_title ? `<div>Мастер-класс: <strong>${esc(o.master_class_title)}</strong></div>` : ""}
          ${o.guests ? `<div>Гостей: <strong>${o.guests}</strong></div>` : ""}
        </div>
        ${o.comment ? `<p class="order-comment">${esc(o.comment)}</p>` : ""}
      </div>
      <div class="order-side">
        <label class="field"><span>Статус</span>
          <select name="status">
            ${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${k === o.status ? "selected" : ""}>${v}</option>`).join("")}
          </select>
        </label>
        <label class="field"><span>Заметка менеджера</span>
          <textarea name="admin_note" placeholder="Например: перезвонить в пятницу">${esc(o.admin_note)}</textarea>
        </label>
        <button class="btn btn-sm btn-danger" type="button" data-delete>Удалить</button>
      </div>
    </article>`;
}

/* ---------- Мастер-классы ---------- */

async function viewMasterClasses() {
  let items = await api("GET", "master-classes");
  const now = new Date().toLocaleString("sv-SE").replace(" ", "T").slice(0, 16);
  const main = shell(
    "mk",
    `
    <div class="page-head">
      <h1>Мастер-классы</h1>
      <a class="btn btn-primary" href="#/mk/new">+ Новый мастер-класс</a>
    </div>
    <div class="panel mc-table"></div>
    <p class="muted">Порядок меняется перетаскиванием за ⋮⋮ или стрелками — так же МК идут на сайте.
      На главную попадают МК с отметкой «Выводить на главной» (включается в карточке МК); прошедшие и скрытые не показываются.</p>`
  );
  const box = main.querySelector(".mc-table");

  const row = (mc, i) => {
    const past = mc.next_date && mc.next_date < now;
    return `<tr data-id="${mc.id}" data-i="${i}" draggable="true">
      <td class="drag-cell"><span class="drag-handle" title="Перетащите, чтобы изменить порядок" aria-hidden="true">⋮⋮</span></td>
      <td class="col-hide">${mc.cover ? `<img class="thumb" src="${esc(mc.cover)}" alt="" />` : `<div class="thumb"></div>`}</td>
      <td><a class="title-link" href="#/mk/${mc.id}">${esc(mc.title)}</a><div class="muted">/mk/${esc(mc.slug)}</div></td>
      <td>${mc.next_date ? `${esc(formatEventDate(mc.next_date))}${past ? ` <span class="tag">прошёл</span>` : ""}` : `<span class="muted">не назначена</span>`}</td>
      <td class="col-hide"><div class="tags">
        ${mc.published ? `<span class="tag tag-ok">Опубликован</span>` : `<span class="tag">Скрыт</span>`}
        ${mc.show_on_home ? `<span class="tag ${mc.published && !past ? "tag-hot" : ""}" title="${mc.published && !past ? "Показывается на главной" : "Отмечен, но не показывается: МК скрыт или дата прошла"}">На главной${mc.published && !past ? "" : " · не виден"}</span>` : ""}
      </div></td>
      <td><div class="row-actions">
        <button class="btn btn-sm btn-icon" type="button" data-move="-1" title="Выше" aria-label="Переместить выше" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="btn btn-sm btn-icon" type="button" data-move="1" title="Ниже" aria-label="Переместить ниже" ${i === items.length - 1 ? "disabled" : ""}>↓</button>
        ${mc.published ? `<a class="btn btn-sm col-hide" href="/mk/${esc(mc.slug)}" target="_blank" rel="noopener">На сайте ↗</a>` : ""}
        <a class="btn btn-sm" href="#/mk/${mc.id}">Изменить</a>
      </div></td>
    </tr>`;
  };

  function render() {
    box.innerHTML = items.length
      ? `<table class="table">
          <thead><tr><th class="drag-cell"></th><th class="col-hide"></th><th>Название</th><th>Ближайшая дата</th><th class="col-hide">Статус</th><th></th></tr></thead>
          <tbody>${items.map(row).join("")}</tbody>
        </table>`
      : `<div class="empty">Мастер-классов пока нет. <a href="#/mk/new">Создайте первый</a>.</div>`;
  }

  async function saveOrder(previous) {
    try {
      await api("PUT", "master-classes/order", { ids: items.map((mc) => mc.id) });
      toast("Порядок сохранён");
    } catch (err) {
      items = previous;
      render();
      fail(err);
    }
  }

  box.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-move]");
    if (!btn) return;
    const i = Number(btn.closest("tr").dataset.i);
    const j = i + Number(btn.dataset.move);
    const previous = [...items];
    [items[i], items[j]] = [items[j], items[i]];
    render();
    box.querySelector(`tr[data-i="${j}"] [data-move="${btn.dataset.move}"]`)?.focus();
    saveOrder(previous);
  });

  // Перетаскивание строк
  let dragFrom = null;
  box.addEventListener("dragstart", (event) => {
    const tr = event.target.closest("tr[data-id]");
    if (!tr) return;
    dragFrom = Number(tr.dataset.i);
    tr.classList.add("is-dragging");
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tr.dataset.id);
  });
  box.addEventListener("dragover", (event) => {
    const tr = event.target.closest("tr[data-id]");
    if (dragFrom === null || !tr) return;
    event.preventDefault();
    const rect = tr.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    box.querySelectorAll(".drop-before, .drop-after").forEach((el) => el.classList.remove("drop-before", "drop-after"));
    tr.classList.add(after ? "drop-after" : "drop-before");
  });
  box.addEventListener("dragleave", (event) => {
    if (!box.contains(event.relatedTarget)) box.querySelectorAll(".drop-before, .drop-after").forEach((el) => el.classList.remove("drop-before", "drop-after"));
  });
  box.addEventListener("drop", (event) => {
    const tr = event.target.closest("tr[data-id]");
    if (dragFrom === null || !tr) return;
    event.preventDefault();
    let to = Number(tr.dataset.i) + (tr.classList.contains("drop-after") ? 1 : 0);
    if (to > dragFrom) to -= 1;
    const from = dragFrom;
    dragFrom = null;
    if (to === from) return render();
    const previous = [...items];
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    render();
    saveOrder(previous);
  });
  box.addEventListener("dragend", () => {
    dragFrom = null;
    box.querySelectorAll(".is-dragging, .drop-before, .drop-after").forEach((el) => el.classList.remove("is-dragging", "drop-before", "drop-after"));
  });

  render();
}

function mdEditor(name, value) {
  return `
    <div class="md-editor">
      <div class="md-toolbar">
        <button type="button" data-md="bold" title="Жирный"><b>B</b></button>
        <button type="button" data-md="italic" title="Курсив"><i>I</i></button>
        <button type="button" data-md="h2" title="Заголовок">H</button>
        <button type="button" data-md="ul" title="Список">• Список</button>
        <button type="button" data-md="ol" title="Нумерованный список">1. Список</button>
        <button type="button" data-md="link" title="Ссылка">Ссылка</button>
        <span class="md-hint">Markdown · слева текст, справа предпросмотр</span>
      </div>
      <div class="md-split">
        <textarea name="${name}" spellcheck="true">${esc(value)}</textarea>
        <div class="md-preview"></div>
      </div>
    </div>`;
}

function bindMdEditor(root) {
  const ta = root.querySelector(".md-split textarea");
  const preview = root.querySelector(".md-preview");
  const update = () => (preview.innerHTML = renderMarkdown(ta.value));
  ta.addEventListener("input", update);
  update();

  const wrap = (before, after = before, placeholder = "текст") => {
    const { selectionStart: s, selectionEnd: e, value } = ta;
    const selected = value.slice(s, e) || placeholder;
    ta.setRangeText(before + selected + after, s, e, "end");
    ta.setSelectionRange(s + before.length, s + before.length + selected.length);
  };
  const prefixLines = (fn) => {
    const { value } = ta;
    const s = value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
    let e = value.indexOf("\n", ta.selectionEnd);
    if (e === -1) e = value.length;
    const lines = value.slice(s, e).split("\n").map(fn);
    ta.setRangeText(lines.join("\n"), s, e, "select");
  };

  root.querySelector(".md-toolbar").addEventListener("click", (event) => {
    const btn = event.target.closest("[data-md]");
    if (!btn) return;
    ta.focus();
    const action = btn.dataset.md;
    if (action === "bold") wrap("**");
    if (action === "italic") wrap("*");
    if (action === "h2") prefixLines((l) => `## ${l.replace(/^#+\s*/, "")}`);
    if (action === "ul") prefixLines((l) => `- ${l.replace(/^[-*+]\s+/, "")}`);
    if (action === "ol") prefixLines((l, i) => `${i + 1}. ${l.replace(/^\d+[.)]\s+/, "")}`);
    if (action === "link") wrap("[", "](https://)", "текст ссылки");
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function viewMasterClassEdit(idParam) {
  const isNew = idParam === "new";
  const mc = isNew
    ? { title: "", slug: "", description_md: "", next_date: "", published: true, show_on_home: false, seo_title: "", seo_description: "", photos: [] }
    : await api("GET", `master-classes/${idParam}`);
  let photos = [...mc.photos];
  let pending = 0;

  const main = shell(
    "mk",
    `
    <a class="crumb" href="#/mk">← Мастер-классы</a>
    <div class="page-head"><h1>${isNew ? "Новый мастер-класс" : esc(mc.title)}</h1>
      ${!isNew && mc.published ? `<a class="btn" href="/mk/${esc(mc.slug)}" target="_blank" rel="noopener">Открыть на сайте ↗</a>` : ""}
    </div>
    <form class="mc-form" novalidate>
      <div class="panel panel-pad">
        <div class="form-grid">
          <label class="field field-wide"><span>Название *</span>
            <input name="title" required maxlength="150" value="${esc(mc.title)}" placeholder="Например: Итальянская паста" />
          </label>
          <label class="field"><span>Ближайшая дата проведения</span>
            <input name="next_date" type="datetime-local" value="${esc(mc.next_date || "")}" />
            <small>Оставьте пустым, если дата пока неизвестна.</small>
          </label>
          <label class="field"><span>Адрес страницы</span>
            <input name="slug" maxlength="80" value="${esc(mc.slug)}" placeholder="создастся из названия" />
            <small>/mk/<b class="slug-preview">${esc(mc.slug || "…")}</b></small>
          </label>
          <div class="field field-wide checks">
            <label class="check"><input type="checkbox" name="published" ${mc.published ? "checked" : ""} /> Опубликован на сайте</label>
            <label class="check"><input type="checkbox" name="show_on_home" ${mc.show_on_home ? "checked" : ""} /> Выводить на главной</label>
            <small>На главной показываются отмеченные опубликованные мастер-классы, у которых дата ещё не прошла (или не назначена), в порядке списка.</small>
          </div>
          <div class="field field-wide"><span class="label">Описание</span>
            ${mdEditor("description_md", mc.description_md)}
          </div>
        </div>
      </div>

      <div class="panel panel-pad" style="margin-top:16px">
        <div class="page-head" style="margin-bottom:12px"><h2 style="margin:0;font-size:18px">SEO</h2>
          <span class="muted">Необязательно: пустые поля заполнятся автоматически</span></div>
        <div class="form-grid">
          <label class="field field-wide"><span>Заголовок страницы (title)</span>
            <input name="seo_title" maxlength="150" value="${esc(mc.seo_title || "")}" />
            <small class="seo-hint" data-for="seo_title" data-rec="60"></small>
          </label>
          <label class="field field-wide"><span>Описание (meta description)</span>
            <textarea name="seo_description" maxlength="300" rows="3" style="min-height:0">${esc(mc.seo_description || "")}</textarea>
            <small class="seo-hint" data-for="seo_description" data-rec="160"></small>
          </label>
        </div>
      </div>

      <div class="panel panel-pad" style="margin-top:16px">
        <div class="page-head" style="margin-bottom:12px"><h2 style="margin:0;font-size:18px">Галерея</h2>
          <span class="muted">Первое фото — обложка карточки</span></div>
        <div class="photo-grid mc-photos"></div>
      </div>

      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${isNew ? "Создать" : "Сохранить"}</button>
        <a class="btn" href="#/mk">Отмена</a>
        <span class="spacer"></span>
        ${isNew ? "" : `<button class="btn btn-danger" type="button" data-delete>Удалить</button>`}
      </div>
    </form>`
  );

  const form = main.querySelector("form");
  const grid = main.querySelector(".mc-photos");
  bindMdEditor(form);
  form.addEventListener("input", () => (dirty = true));
  form.title.addEventListener("input", () => {
    if (!form.slug.value) main.querySelector(".slug-preview").textContent = "создастся автоматически";
  });
  form.slug.addEventListener("input", () => {
    main.querySelector(".slug-preview").textContent = form.slug.value || "…";
  });

  // SEO: плейсхолдеры показывают автоматические значения, подсказка — длину
  const seoDefaults = {
    seo_title: () => `${form.title.value.trim() || "Название"} — мастер-класс в студии Паприка`,
    seo_description: () =>
      markdownToText(form.description_md.value) ||
      `Кулинарный мастер-класс «${form.title.value.trim() || "…"}» в студии Паприка, Волгоград.`,
  };
  function updateSeo() {
    for (const hint of main.querySelectorAll(".seo-hint")) {
      const input = form[hint.dataset.for];
      const rec = Number(hint.dataset.rec);
      input.placeholder = seoDefaults[hint.dataset.for]();
      const len = (input.value.trim() || input.placeholder).length;
      hint.textContent = `${input.value.trim() ? "" : "Автоматически · "}${len} симв., рекомендуется до ${rec}`;
      hint.classList.toggle("seo-long", len > rec);
    }
  }
  form.addEventListener("input", updateSeo);
  updateSeo();

  function renderPhotos() {
    grid.innerHTML =
      photos
        .map(
          (url, i) => `
        <div class="photo-card" data-i="${i}">
          ${i === 0 ? `<span class="cover-badge">Обложка</span>` : ""}
          <img src="${esc(url)}" alt="" loading="lazy" />
          <div class="photo-tools">
            <button class="btn btn-sm btn-icon" type="button" data-move="-1" title="Левее" ${i === 0 ? "disabled" : ""}>←</button>
            <button class="btn btn-sm btn-icon" type="button" data-move="1" title="Правее" ${i === photos.length - 1 ? "disabled" : ""}>→</button>
            <span class="spacer"></span>
            <button class="btn btn-sm btn-danger" type="button" data-remove>Убрать</button>
          </div>
        </div>`
        )
        .join("") +
      Array.from({ length: pending }, () => `<div class="photo-card"><div class="uploading">Загрузка…</div></div>`).join("") +
      dropzoneHtml("Добавить фото");
    bindDropzone(grid.querySelector(".dropzone"), addFiles);
  }

  async function addFiles(files) {
    pending += files.length;
    renderPhotos();
    for (const file of files) {
      try {
        photos.push(await upload(file));
        dirty = true;
      } catch (err) {
        fail(err);
      }
      pending -= 1;
      renderPhotos();
    }
  }

  grid.addEventListener("click", (event) => {
    const card = event.target.closest(".photo-card[data-i]");
    if (!card) return;
    const i = Number(card.dataset.i);
    const move = event.target.closest("[data-move]");
    if (move) {
      const j = i + Number(move.dataset.move);
      [photos[i], photos[j]] = [photos[j], photos[i]];
      dirty = true;
      renderPhotos();
    }
    if (event.target.closest("[data-remove]")) {
      photos.splice(i, 1);
      dirty = true;
      renderPhotos();
    }
  });
  renderPhotos();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (pending) return toast("Дождитесь окончания загрузки фото", "error");
    if (!form.title.value.trim()) {
      form.title.focus();
      return toast("Укажите название", "error");
    }
    const payload = {
      title: form.title.value,
      slug: form.slug.value,
      next_date: form.next_date.value,
      published: form.published.checked,
      show_on_home: form.show_on_home.checked,
      description_md: form.description_md.value,
      seo_title: form.seo_title.value,
      seo_description: form.seo_description.value,
      photos,
    };
    try {
      const saved = isNew ? await api("POST", "master-classes", payload) : await api("PUT", `master-classes/${mc.id}`, payload);
      dirty = false;
      toast(isNew ? "Мастер-класс создан" : "Сохранено");
      if (isNew) location.hash = `#/mk/${saved.id}`;
      else viewMasterClassEdit(saved.id).catch(fail);
    } catch (err) {
      fail(err);
    }
  });

  main.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm(`Удалить мастер-класс «${mc.title}»? Его фото тоже будут удалены.`)) return;
    try {
      await api("DELETE", `master-classes/${mc.id}`);
      dirty = false;
      toast("Мастер-класс удалён");
      location.hash = "#/mk";
    } catch (err) {
      fail(err);
    }
  });
}

/* ---------- Галерея ---------- */

async function viewGallery() {
  let items = await api("GET", "gallery");
  let pending = 0;
  const main = shell(
    "gallery",
    `
    <div class="page-head"><h1>Фотогалерея</h1><span class="muted gallery-stats"></span></div>
    <div class="panel panel-pad">
      ${dropzoneHtml("Загрузить фото")}
      <div class="photo-grid gallery-grid" style="margin-top:16px"></div>
    </div>`
  );
  const grid = main.querySelector(".gallery-grid");

  function render() {
    const hidden = items.filter((p) => !p.published).length;
    main.querySelector(".gallery-stats").textContent = `На сайте: ${items.length - hidden}${hidden ? ` · скрыто: ${hidden}` : ""}`;
    grid.innerHTML =
      Array.from({ length: pending }, () => `<div class="photo-card"><div class="uploading">Загрузка…</div></div>`).join("") +
      (items.length || pending
        ? items
            .map(
              (p, i) => `
          <div class="photo-card ${p.published ? "" : "is-hidden"}" data-id="${p.id}" data-i="${i}">
            ${p.published ? "" : `<span class="cover-badge hidden-badge">Скрыто</span>`}
            <img src="${esc(p.url)}" alt="" loading="lazy" />
            <input class="photo-caption" data-field="caption" value="${esc(p.caption)}" placeholder="Подпись (alt)" maxlength="200" />
            <textarea class="photo-caption photo-desc" data-field="description" rows="2" maxlength="1000"
              placeholder="Описание для лайтбокса (необязательно)">${esc(p.description || "")}</textarea>
            <label class="photo-visible"><input type="checkbox" data-field="published" ${p.published ? "checked" : ""} /> Показывать на сайте</label>
            <div class="photo-tools">
              <button class="btn btn-sm btn-icon" type="button" data-move="-1" title="Раньше" ${i === 0 ? "disabled" : ""}>←</button>
              <button class="btn btn-sm btn-icon" type="button" data-move="1" title="Позже" ${i === items.length - 1 ? "disabled" : ""}>→</button>
              <span class="spacer"></span>
              <button class="btn btn-sm btn-danger" type="button" data-remove>Удалить</button>
            </div>
          </div>`
            )
            .join("")
        : `<div class="empty" style="grid-column:1/-1">В галерее пока нет фото.</div>`);
  }

  bindDropzone(main.querySelector(".dropzone"), async (files) => {
    pending += files.length;
    render();
    let added = 0;
    for (const file of files) {
      try {
        const url = await upload(file);
        items.push(await api("POST", "gallery", { url, caption: "" }));
        added += 1;
      } catch (err) {
        fail(err);
      }
      pending -= 1;
      render();
    }
    if (added) toast(`Добавлено фото: ${added}`);
  });

  grid.addEventListener("click", async (event) => {
    const card = event.target.closest(".photo-card[data-id]");
    if (!card) return;
    const i = Number(card.dataset.i);
    const move = event.target.closest("[data-move]");
    try {
      if (move) {
        const j = i + Number(move.dataset.move);
        [items[i], items[j]] = [items[j], items[i]];
        render();
        await api("PUT", "gallery/order", { ids: items.map((p) => p.id) });
      }
      if (event.target.closest("[data-remove]")) {
        if (!confirm("Удалить фото из галереи?")) return;
        await api("DELETE", `gallery/${card.dataset.id}`);
        items.splice(i, 1);
        render();
        toast("Фото удалено");
      }
    } catch (err) {
      fail(err);
    }
  });

  grid.addEventListener("change", async (event) => {
    const field = event.target.dataset.field;
    if (!field) return;
    const card = event.target.closest(".photo-card");
    const value = field === "published" ? event.target.checked : event.target.value;
    try {
      const updated = await api("PATCH", `gallery/${card.dataset.id}`, { [field]: value });
      items[Number(card.dataset.i)] = updated;
      if (field === "published") {
        render();
        toast(value ? "Фото показано на сайте" : "Фото скрыто с сайта");
      } else {
        toast(field === "caption" ? "Подпись сохранена" : "Описание сохранено");
      }
    } catch (err) {
      if (field === "published") event.target.checked = !value;
      fail(err);
    }
  });

  render();
}

/* ---------- Отзывы ---------- */

const avatarHtml = (r) =>
  r.photo ? `<img class="avatar" src="${esc(r.photo)}" alt="" />` : `<div class="avatar">${esc((r.author || "?").charAt(0).toUpperCase())}</div>`;

async function viewReviews() {
  const items = await api("GET", "reviews");
  shell(
    "reviews",
    `
    <div class="page-head"><h1>Отзывы</h1><a class="btn btn-primary" href="#/reviews/new">+ Добавить отзыв</a></div>
    <div class="review-list">
      ${
        items.length
          ? items
              .map(
                (r) => `
        <article class="panel review-row">
          ${avatarHtml(r)}
          <div>
            <h3>${esc(r.author)}</h3>
            <div class="muted">${esc(formatDate(r.date))} ${r.published ? "" : `· <span class="tag">Скрыт</span>`}</div>
            <p>${esc(r.text.length > 220 ? r.text.slice(0, 220) + "…" : r.text)}</p>
          </div>
          <a class="btn btn-sm" href="#/reviews/${r.id}">Изменить</a>
        </article>`
              )
              .join("")
          : `<div class="panel empty">Отзывов пока нет.</div>`
      }
    </div>`
  );
}

async function viewReviewEdit(idParam) {
  const isNew = idParam === "new";
  const r = isNew ? { author: "", photo: "", date: today(), text: "", published: true } : await api("GET", `reviews/${idParam}`);
  let photo = r.photo;
  let uploading = false;

  const main = shell(
    "reviews",
    `
    <a class="crumb" href="#/reviews">← Отзывы</a>
    <div class="page-head"><h1>${isNew ? "Новый отзыв" : "Отзыв"}</h1></div>
    <form novalidate>
      <div class="panel panel-pad">
        <div class="form-grid">
          <div class="field field-wide"><span class="label">Фото автора</span>
            <div class="avatar-edit">
              <div class="avatar-slot"></div>
              <label class="btn"><input type="file" accept="image/jpeg,image/png,image/webp" hidden /> Загрузить фото</label>
              <button class="btn btn-danger" type="button" data-remove-photo>Убрать</button>
            </div>
          </div>
          <label class="field"><span>Имя *</span><input name="author" required maxlength="80" value="${esc(r.author)}" /></label>
          <label class="field"><span>Дата *</span><input name="date" type="date" required value="${esc(r.date)}" /></label>
          <label class="field field-wide"><span>Отзыв *</span><textarea name="text" rows="6" required maxlength="3000">${esc(r.text)}</textarea></label>
          <div class="field field-wide">
            <label class="check"><input type="checkbox" name="published" ${r.published ? "checked" : ""} /> Показывать на сайте</label>
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-primary" type="submit">${isNew ? "Добавить" : "Сохранить"}</button>
        <a class="btn" href="#/reviews">Отмена</a>
        <span class="spacer"></span>
        ${isNew ? "" : `<button class="btn btn-danger" type="button" data-delete>Удалить</button>`}
      </div>
    </form>`
  );

  const form = main.querySelector("form");
  const slot = main.querySelector(".avatar-slot");
  const removeBtn = main.querySelector("[data-remove-photo]");
  const renderAvatar = () => {
    slot.innerHTML = uploading ? `<div class="avatar">…</div>` : avatarHtml({ photo, author: form.author.value });
    removeBtn.hidden = !photo;
  };
  renderAvatar();
  form.addEventListener("input", (e) => {
    dirty = true;
    if (e.target.name === "author" && !photo) renderAvatar();
  });

  main.querySelector("input[type=file]").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    uploading = true;
    renderAvatar();
    try {
      photo = await upload(file);
      dirty = true;
    } catch (err) {
      fail(err);
    }
    uploading = false;
    renderAvatar();
  });
  removeBtn.addEventListener("click", () => {
    photo = "";
    dirty = true;
    renderAvatar();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (uploading) return toast("Дождитесь загрузки фото", "error");
    const payload = {
      author: form.author.value,
      date: form.date.value,
      text: form.text.value,
      published: form.published.checked,
      photo,
    };
    try {
      if (isNew) await api("POST", "reviews", payload);
      else await api("PUT", `reviews/${r.id}`, payload);
      dirty = false;
      toast(isNew ? "Отзыв добавлен" : "Сохранено");
      location.hash = "#/reviews";
    } catch (err) {
      fail(err);
    }
  });

  main.querySelector("[data-delete]")?.addEventListener("click", async () => {
    if (!confirm("Удалить отзыв?")) return;
    try {
      await api("DELETE", `reviews/${r.id}`);
      dirty = false;
      toast("Отзыв удалён");
      location.hash = "#/reviews";
    } catch (err) {
      fail(err);
    }
  });
}

/* ---------- Старт ---------- */

(async () => {
  try {
    const { authed } = await api("GET", "me");
    if (authed) route();
    else renderLogin();
  } catch (err) {
    app.textContent = `Не удалось подключиться к серверу: ${err.message}`;
  }
})();
