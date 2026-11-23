import fs from "node:fs";
import path from "node:path";
import { renderMarkdown, markdownToText, escapeHtml as esc } from "../shared/md.js";
import { formatEventDate, formatMonthYear, safeImageUrl } from "./util.js";

const bgStyle = (url) => {
  const safe = safeImageUrl(url);
  return safe ? ` style="background-image:url('${esc(safe)}')"` : "";
};

/* ---------- Фрагменты ---------- */

export function mcCard(mc) {
  const date = formatEventDate(mc.next_date);
  return `<a href="/mk/${esc(mc.slug)}" class="mc-card"${bgStyle(mc.cover)}>
            <span class="mc-overlay"></span>
            <span class="mc-title">${esc(mc.title)}</span>
            <span class="mc-date${date ? "" : " mc-date-muted"}">${esc(date || "Дата уточняется")}</span>
          </a>`;
}

function mcAllCard() {
  return `<a href="/mk" class="mc-card mc-card-all">
            <span class="mc-title">Смотреть все мастер классы</span>
            <span class="mc-date">Открыть расписание</span>
          </a>`;
}

function mcEmptyCard() {
  return `<div class="mc-card mc-card-empty">
            <span class="mc-title">Новые даты скоро появятся</span>
            <span class="mc-date">Оставьте заявку — сообщим первыми</span>
          </div>`;
}

function avatar(review) {
  const src = safeImageUrl(review.photo);
  if (src) return `<img src="${esc(src)}" alt="${esc(review.author)}" class="review-avatar" loading="lazy" width="64" height="64" />`;
  const letter = esc(review.author.trim().charAt(0).toUpperCase() || "?");
  return `<span class="review-avatar review-avatar-letter" aria-hidden="true">${letter}</span>`;
}

export function reviewCard(r) {
  return `<article class="review-card">
                <div class="review-head">
                  ${avatar(r)}
                  <div>
                    <h3>${esc(r.author)}</h3>
                    <p><time datetime="${esc(r.date)}">${esc(formatMonthYear(r.date))}</time></p>
                  </div>
                </div>
                <p class="review-text">${esc(r.text).replace(/\n/g, "<br />")}</p>
              </article>`;
}

export function galleryItem(photo, fallbackAlt) {
  const src = safeImageUrl(photo.url);
  if (!src) return "";
  const alt = photo.caption || fallbackAlt;
  const desc = photo.description ? ` data-description="${esc(photo.description)}"` : "";
  return `<a class="gallery-item" href="${esc(src)}" data-lightbox${desc}><img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" /></a>`;
}

export function orderModal(upcoming) {
  const options = upcoming
    .map((mc) => {
      const date = formatEventDate(mc.next_date);
      return `<option value="${mc.id}">${esc(mc.title)}${date ? ` — ${esc(date)}` : ""}</option>`;
    })
    .join("");
  return `<dialog class="order-modal" id="order-modal" aria-labelledby="order-title">
      <form class="order-form" novalidate>
        <button type="button" class="order-close" data-order-close aria-label="Закрыть">×</button>
        <h2 id="order-title">Оставить заявку</h2>
        <p class="order-lead">Перезвоним, ответим на вопросы и подтвердим запись.</p>

        <label class="order-field">
          <span>Что вас интересует</span>
          <select name="kind">
            <option value="master_class">Мастер-класс</option>
            <option value="event">Корпоратив / праздник</option>
            <option value="certificate">Подарочный сертификат</option>
            <option value="other">Другое</option>
          </select>
        </label>

        <label class="order-field" data-kind-only="master_class">
          <span>Мастер-класс</span>
          <select name="master_class_id">
            <option value="">Подберём вместе</option>
            ${options}
          </select>
        </label>

        <label class="order-field">
          <span>Имя</span>
          <input name="name" type="text" autocomplete="name" required maxlength="100" />
        </label>

        <label class="order-field">
          <span>Телефон</span>
          <input name="phone" type="tel" autocomplete="tel" required maxlength="30" placeholder="+7 (___) ___-__-__" />
        </label>

        <div class="order-field" data-kind-only="master_class event">
          <label for="order-guests"><span>Количество гостей</span></label>
          <div class="order-stepper">
            <button type="button" data-step="-1" aria-label="Меньше гостей">−</button>
            <input id="order-guests" name="guests" type="number" min="1" max="200" value="2" inputmode="numeric" />
            <button type="button" data-step="1" aria-label="Больше гостей">+</button>
          </div>
        </div>

        <label class="order-field">
          <span>Комментарий</span>
          <textarea name="comment" rows="3" maxlength="1000"></textarea>
        </label>

        <label class="order-hp" aria-hidden="true">Сайт <input name="website" tabindex="-1" autocomplete="off" /></label>

        <p class="order-error" role="alert" hidden></p>
        <button type="submit" class="btn btn-hot order-submit">Отправить заявку</button>
        <p class="order-note">Нажимая кнопку, вы соглашаетесь на обработку персональных данных.</p>
      </form>
      <div class="order-success" hidden>
        <button type="button" class="order-close" data-order-close aria-label="Закрыть">×</button>
        <h2>Спасибо!</h2>
        <p>Заявка отправлена. Мы свяжемся с вами в ближайшее время.</p>
        <button type="button" class="btn btn-hot" data-order-close>Хорошо</button>
      </div>
    </dialog>`;
}

/* ---------- Страницы ---------- */

function replaceBlock(html, name, content) {
  const re = new RegExp(`<!--cms:${name}-->[\\s\\S]*?<!--/cms:${name}-->`);
  return html.replace(re, () => `<!--cms:${name}-->\n${content}\n<!--/cms:${name}-->`);
}

export function createRenderer({ root, repo, now }) {
  const indexPath = path.join(root, "index.html");

  function landing() {
    const upcoming = repo.homeMasterClasses(now());
    const reviews = repo.listReviews({ publishedOnly: true });
    const gallery = repo.listGallery({ publishedOnly: true });
    const forForm = repo.upcomingMasterClasses(now(), 50);

    let html = fs.readFileSync(indexPath, "utf8");
    html = replaceBlock(html, "mc", [...(upcoming.length ? upcoming.map(mcCard) : [mcEmptyCard()]), mcAllCard()].join("\n"));
    html = replaceBlock(
      html,
      "reviews",
      reviews.length ? reviews.map(reviewCard).join("\n") : `<p class="reviews-empty">Отзывов пока нет.</p>`
    );
    html = replaceBlock(html, "gallery", gallery.map((p, i) => galleryItem(p, `Фото из студии Paprika, ${i + 1}`)).join("\n"));
    html = replaceBlock(html, "order-modal", orderModal(forForm));
    return html;
  }

  function layout({ title, description, body, upcoming, back = "/" }) {
    return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(title)}</title>
    <meta name="description" content="${esc(description)}" />
    <meta name="theme-color" content="#0b0b0b" />
    <link rel="icon" href="/assets/img/favicon.ico" sizes="16x16" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;700&family=Merriweather:wght@300;400;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="/assets/css/base.css" />
    <link rel="stylesheet" href="/assets/css/menu.css" />
    <link rel="stylesheet" href="/assets/css/mcblock.css" />
    <link rel="stylesheet" href="/assets/css/gallery.css" />
    <link rel="stylesheet" href="/assets/css/order.css" />
    <link rel="stylesheet" href="/assets/css/mkpage.css" />
  </head>
  <body class="page">
    <nav class="hero-menu hero-menu-sub" aria-label="Разделы сайта">
      <div class="container hero-menu-inner">
        <a class="menu-back" href="${esc(back)}">Вернуться</a>
        <a href="/">Главная</a>
        <a href="/mk">Мастер-классы</a>
        <a href="/#events">Мероприятия</a>
        <a href="/#reviews">Отзывы</a>
        <a href="/#gallery">Галерея</a>
        <a href="/#contacts">Контакты</a>
      </div>
    </nav>
    <main class="page-main">
${body}
    </main>
    <footer class="page-footer">
      <div class="container">
        <p>Paprika Studio · Волгоград, проспект им. В.И. Ленина 110, 2 этаж ·
          <a href="tel:+79375301090">+7 (937) 530-10-90</a></p>
      </div>
    </footer>
    ${orderModal(upcoming)}
    <script src="/script.js" defer></script>
  </body>
</html>`;
  }

  function masterClassPage(mc) {
    const date = formatEventDate(mc.next_date);
    const isUpcoming = mc.next_date && mc.next_date >= now();
    const upcoming = repo.upcomingMasterClasses(now(), 50);
    if (isUpcoming && !upcoming.some((u) => u.id === mc.id)) upcoming.unshift(mc);
    const cover = safeImageUrl(mc.cover);
    const gallery = mc.photos
      .map((url, i) => galleryItem({ url, caption: "" }, `${mc.title} — фото ${i + 1}`))
      .join("\n");

    const body = `      <article class="mk-page">
        <header class="mk-hero">
          <div class="container mk-hero-inner${cover ? "" : " mk-hero-nocover"}">
            <div class="mk-hero-text">
              <a class="mk-back" href="/mk">← Все мастер-классы</a>
              <h1>${esc(mc.title)}</h1>
              <p class="mk-date">${isUpcoming ? `Ближайшая дата: <strong>${esc(date)}</strong>` : "Дата следующего занятия уточняется"}</p>
              <button type="button" class="btn btn-hot" data-order="master_class" data-order-mc="${isUpcoming ? mc.id : ""}">Записаться</button>
            </div>
            ${cover ? `<figure class="mk-cover"><img src="${esc(cover)}" alt="${esc(mc.title)}" width="600" height="400" /></figure>` : ""}
          </div>
        </header>
        <div class="container mk-body">
          <div class="md">${renderMarkdown(mc.description_md) || "<p>Описание скоро появится.</p>"}</div>
          ${gallery ? `<section class="mk-gallery"><h2>Фото</h2><div class="gallery-grid">${gallery}</div></section>` : ""}
        </div>
      </article>`;
    return layout({
      title: `${mc.title} — мастер-класс в Paprika Studio`,
      description: markdownToText(mc.description_md) || `Кулинарный мастер-класс «${mc.title}» в Paprika Studio, Волгоград.`,
      body,
      upcoming,
      back: "/mk",
    });
  }

  function masterClassList() {
    const all = repo.listMasterClasses({ publishedOnly: true });
    const n = now();
    const upcoming = all.filter((mc) => mc.next_date && mc.next_date >= n);
    const rest = all.filter((mc) => !(mc.next_date && mc.next_date >= n)).map((mc) => ({ ...mc, next_date: null }));
    const body = `      <section class="mk-list container">
        <h1>Мастер-классы</h1>
        <p class="mk-list-lead">Выберите мастер-класс и оставьте заявку — мы перезвоним и подтвердим запись.</p>
        ${upcoming.length ? `<h2>Ближайшие</h2><div class="mc-grid">${upcoming.map(mcCard).join("\n")}</div>` : `<p>Ближайшие даты скоро появятся.</p>`}
        ${rest.length ? `<h2>Другие программы</h2><div class="mc-grid">${rest.map(mcCard).join("\n")}</div>` : ""}
        <p><button type="button" class="btn btn-hot" data-order="master_class">Оставить заявку</button></p>
      </section>`;
    return layout({
      title: "Мастер-классы — Paprika Studio, Волгоград",
      description: "Расписание кулинарных мастер-классов Paprika Studio в Волгограде.",
      body,
      upcoming,
    });
  }

  function notFound() {
    return layout({
      title: "Страница не найдена — Paprika Studio",
      description: "Страница не найдена",
      body: `      <section class="container mk-list"><h1>Страница не найдена</h1><p><a href="/">Вернуться на главную</a></p></section>`,
      upcoming: repo.upcomingMasterClasses(now(), 50),
    });
  }

  return { landing, masterClassPage, masterClassList, notFound };
}
