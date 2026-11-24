/* Отдельные SEO-страницы на адресах старого сайта (paprika-studio.ru на WordPress)
   и редиректы со старых адресов, которые уже есть в индексе поисковиков. */

const PHONE = { href: "tel:+79375301090", text: "+7 (937) 530-10-90" };
const PHONE2 = { href: "tel:+79275100853", text: "+7 (927) 510-08-53" };
const EMAIL = "vm.83@mail.ru";
const ADDRESS = "Волгоград, проспект им. В.И. Ленина 110, 2 этаж";
const MAP_SRC =
  "https://yandex.ru/map-widget/v1/?lang=ru_RU&amp;scroll=false&amp;source=constructor-api&amp;um=constructor%3AQ-ceOyvc1OzO3IzwGTnyjwjkLpmOa143";

const link = (p) => `<a href="${p.href}">${p.text}</a>`;

/** Порядок здесь = порядок в подвале и в sitemap. `body(ctx)` получает данные из БД и готовые фрагменты. */
export const PAGES = {
  "nasha-studiya": {
    nav: "О студии",
    title: "Кулинарная студия Паприка в Волгограде — о нас",
    description:
      "Студия Паприка — первая кулинарная школа Волгограда: мастер-классы для новичков и профи, корпоративы, дни рождения и гастрономические вечера.",
    eyebrow: "О студии",
    h1: "Наша студия",
    lead: `Паприка — первая кулинарная школа Волгограда. Программа мастер-классов интересна и новичкам, и опытным
      кулинарам: здесь можно освоить новые блюда, найти идеи для кулинарных экспериментов и зарядиться вдохновением.`,
    actions: `<button type="button" class="btn btn-hot" data-order="master_class">Записаться</button>
              <button type="button" class="btn" data-order="event">Обсудить мероприятие</button>`,
    body: ({ gallery, reviews }) => `
          <section>
            <h2>Чем мы занимаемся</h2>
            <div class="info-cards">
              <article class="info-card">
                <h3>Кулинарные мастер-классы</h3>
                <p>Гастрономические вечера по расписанию: выбирайте тему и записывайтесь. <a href="/mk">Расписание</a></p>
              </article>
              <article class="info-card">
                <h3>Корпоративы</h3>
                <p>Совместная готовка сплотит коллектив и поднимет корпоративный дух.</p>
              </article>
              <article class="info-card">
                <h3>Праздники и вечеринки</h3>
                <p>Отпразднуйте день рождения или проведите тематическую вечеринку в нашей студии.</p>
              </article>
            </div>
          </section>
          <section>
            <h2>Как проходит мероприятие</h2>
            <ul class="check-list">
              <li>Закрытый мастер-класс для группы от 8 до 16 гостей.</li>
              <li>Готовим 3 блюда: салат, горячее и десерт.</li>
              <li>Основная программа длится 3 часа.</li>
              <li>После мастер-класса дарим дополнительное время, чтобы спокойно пообщаться и завершить вечер без спешки.</li>
            </ul>
            <div class="info-cards info-cards-2">
              <div class="info-card info-stat"><span>Стоимость</span><strong>от 3 500 ₽ / персона</strong></div>
              <div class="info-card info-stat"><span>Минимум гостей</span><strong>8 человек</strong></div>
            </div>
          </section>
          ${
            gallery.length
              ? `<section>
            <h2>Фото из студии</h2>
            <div class="gallery-grid">${gallery.slice(0, 8).join("\n")}</div>
            <p><a href="/fotogalereya/">Вся фотогалерея →</a></p>
          </section>`
              : ""
          }
          ${
            reviews.length
              ? `<section>
            <h2>Отзывы гостей</h2>
            <div class="page-reviews">${reviews.slice(0, 3).join("\n")}</div>
          </section>`
              : ""
          }`,
  },

  fotogalereya: {
    nav: "Фотогалерея",
    title: "Фотогалерея кулинарной студии Паприка — Волгоград",
    description:
      "Фото с кулинарных мастер-классов, корпоративов и праздников в студии Паприка в Волгограде. Посмотрите, как у нас проходят вечера.",
    eyebrow: "Фотогалерея",
    h1: "Фото из студии",
    lead: "Мастер-классы, корпоративы и праздники в студии Паприка — как это выглядит изнутри.",
    actions: `<button type="button" class="btn btn-hot" data-order="master_class">Записаться на мастер-класс</button>`,
    body: ({ gallery }) =>
      gallery.length
        ? `<div class="gallery-grid">${gallery.join("\n")}</div>`
        : `<p>Фотографии скоро появятся.</p>`,
  },

  sertifikatyi: {
    nav: "Сертификаты",
    title: "Подарочный сертификат на мастер-класс — студия Паприка",
    description:
      "Подарите вечер в кулинарной студии: сертификат на конкретный мастер-класс или любую сумму, в электронном или печатном виде. Волгоград.",
    eyebrow: "Подарок",
    h1: "Подарочный сертификат",
    lead: `Идея подарка, которая точно попадёт в настроение: вечер в кулинарной студии, живые эмоции и блюда,
      приготовленные своими руками.`,
    cover: { src: "/assets/img/cert.webp", alt: "Подарочный сертификат студии Паприка" },
    actions: `<button type="button" class="btn btn-hot" data-order="certificate">Заказать сертификат</button>`,
    body: () => `
          <section>
            <h2>Как это работает</h2>
            <ul class="check-list">
              <li>Сертификат можно оформить на конкретный мастер-класс или на любую сумму.</li>
              <li>Доступен в электронном и печатном формате.</li>
              <li>По сертификату на сумму можно выбрать любой мастер-класс из <a href="/mk">расписания</a>.</li>
              <li>Оставьте заявку или позвоните ${link(PHONE)} — поможем выбрать и оформить.</li>
            </ul>
          </section>`,
  },

  oplata: {
    nav: "Оплата и запись",
    title: "Оплата и запись на мастер-класс — студия Паприка",
    description:
      "Как записаться на кулинарный мастер-класс в студии Паприка: предоплата 50%, запись в резерв, условия отмены. Волгоград, пр. Ленина, 110.",
    eyebrow: "Условия",
    h1: "Оплата и запись",
    lead: "Как записаться на мастер-класс, внести предоплату и что делать, если планы изменились.",
    actions: `<button type="button" class="btn btn-hot" data-order="master_class">Оставить заявку</button>`,
    body: () => `
          <section>
            <h2>Запись</h2>
            <ul class="check-list">
              <li>Выберите мастер-класс в <a href="/mk">расписании</a> и оставьте заявку на сайте — мы перезвоним и подтвердим запись.</li>
              <li>Или запишитесь по телефону ${link(PHONE)} или ${link(PHONE2)}.</li>
            </ul>
          </section>
          <section>
            <h2>Оплата</h2>
            <ul class="check-list">
              <li>Чтобы закрепить место, нужна предоплата 50% стоимости участия.</li>
              <li>Оплатить участие можно и <a href="/sertifikatyi/">подарочным сертификатом</a>.</li>
            </ul>
          </section>
          <section>
            <h2>Запись в резерв</h2>
            <p>Если свободных мест уже нет, предлагаем записаться в резерв: место освобождается довольно часто — и мы сразу вам позвоним.</p>
          </section>
          <section>
            <h2>Отмена</h2>
            <p>Если вы записались на мастер-класс, но не смогли прийти и не предупредили нас за 48 часов, предоплата не возвращается.</p>
          </section>`,
  },

  "kontaktyi-i-shema-proezda": {
    nav: "Контакты",
    title: "Контакты и схема проезда — кулинарная студия Паприка",
    description:
      "Студия Паприка: Волгоград, проспект Ленина 110, 2 этаж, здание заводоуправления «Красный Октябрь». Телефон +7 (937) 530-10-90.",
    eyebrow: "Контакты",
    h1: "Контакты и схема проезда",
    lead: "Ждём вас в студии на проспекте Ленина — звоните, пишите или оставьте заявку, и мы перезвоним.",
    actions: `<button type="button" class="btn btn-hot" data-order="master_class">Оставить заявку</button>
              <a class="btn" href="${PHONE.href}">${PHONE.text}</a>`,
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "LocalBusiness",
      name: "Студия Паприка",
      description: "Кулинарная студия и школа в Волгограде: мастер-классы, корпоративы, праздники.",
      email: EMAIL,
      telephone: ["+79375301090", "+79275100853"],
      address: {
        "@type": "PostalAddress",
        streetAddress: "проспект им. В.И. Ленина 110, 2 этаж",
        addressLocality: "Волгоград",
        addressCountry: "RU",
      },
    },
    body: () => `
          <div class="contacts-page">
            <dl class="contacts-list">
              <div><dt>Адрес</dt><dd>${ADDRESS}<br /><span class="muted">Здание заводоуправления «Красный Октябрь»</span></dd></div>
              <div><dt>Телефоны</dt><dd>${link(PHONE)}<br />${link(PHONE2)}</dd></div>
              <div><dt>Почта</dt><dd><a href="mailto:${EMAIL}">${EMAIL}</a></dd></div>
            </dl>
            <div class="contacts-map">
              <iframe src="${MAP_SRC}" title="Студия Паприка на Яндекс Картах" loading="lazy" frameborder="0" allowfullscreen="true"></iframe>
            </div>
          </div>`,
  },

  "privacy-policy": {
    nav: "Политика конфиденциальности",
    title: "Политика конфиденциальности — студия Паприка",
    description: "Политика обработки персональных данных посетителей сайта кулинарной студии Паприка.",
    h1: "Политика конфиденциальности",
    lead: "Как мы обрабатываем и защищаем персональные данные посетителей сайта.",
    body: () => `
          <div class="md">
            <h2>1. Общие положения</h2>
            <p>Настоящая политика описывает, какие персональные данные собирает сайт кулинарной студии Паприка
              (далее — Студия), с какой целью и как они обрабатываются. Политика составлена в соответствии с
              Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».</p>
            <h2>2. Какие данные мы получаем</h2>
            <p>Когда вы оставляете заявку на сайте, вы сообщаете: имя, номер телефона, а также — по желанию —
              количество гостей и комментарий. Других персональных данных сайт не собирает.</p>
            <h2>3. Цели обработки</h2>
            <ul>
              <li>связаться с вами по заявке, ответить на вопросы и подтвердить запись;</li>
              <li>оформить участие в мастер-классе, мероприятии или подарочный сертификат.</li>
            </ul>
            <h2>4. Как обрабатываются данные</h2>
            <p>Заявки хранятся на сервере сайта, доступ к ним есть только у сотрудников Студии. Для оперативной
              обработки уведомление о новой заявке приходит сотрудникам в мессенджер и (или) на электронную почту.
              Мы не передаём ваши данные третьим лицам для рекламы и не используем их для рассылок.</p>
            <h2>5. Сроки хранения</h2>
            <p>Данные хранятся до достижения целей обработки либо до отзыва согласия.</p>
            <h2>6. Сторонние сервисы</h2>
            <p>На сайте используются Яндекс Карты (схема проезда) и Google Fonts (шрифты). Эти сервисы могут получать
              технические данные о вашем посещении (IP-адрес, сведения о браузере) в соответствии со своими политиками.</p>
            <h2>7. Ваши права</h2>
            <p>Вы можете запросить сведения о ваших данных, их уточнение или удаление, а также отозвать согласие на
              обработку, написав на <a href="mailto:${EMAIL}">${EMAIL}</a> или позвонив по телефону ${link(PHONE)}.</p>
            <h2>8. Согласие</h2>
            <p>Отправляя заявку на сайте, вы соглашаетесь с настоящей политикой и даёте согласие на обработку
              персональных данных в описанных целях.</p>
          </div>`,
  },
};

/* ---------- Редиректы со старого сайта ---------- */

/** Точные адреса (без завершающего «/»). */
export const REDIRECTS = {
  "/raspisanie": "/mk",
  "/video": "/fotogalereya/",
  "/test-for-pay": "/oplata/",
  "/index.php": "/",
};

/** Старые записи → slug мастер-класса. Если он не опубликован — редирект на раздел (см. LEGACY_SECTIONS). */
export const LEGACY_MC = {
  "/uncategorized/aziya-panaziatskaya-kuhnya": "aziya",
  "/fotogalereya/panaziatskaya-kuhnya-3": "aziya",
  "/fotogalereya/aziya-gurme-2": "aziya",
  "/fotogalereya/hola-vecher-ispanskoj-kuhni-5": "hola-vecher-ispanskoy-kuhni",
  "/fotogalereya/ya_lyublyu_borshh-russkaya-kuhnya": "ya-lyublyu-borsch",
  "/fotogalereya/uzhin-gurmana-2": "uzhin-gurmana",
  "/fotogalereya/novaya-italiya-2": "novaya-italiya",
  "/fotogalereya/novaya-italiya-3": "novaya-italiya",
  "/fotogalereya/luchshij-uzhin-v-moej-zhizni-2": "luchshiy-uzhin-v-moey-zhizni",
  "/raspisanie/luchshij-uzhin-v-moej-zhizni-3": "luchshiy-uzhin-v-moey-zhizni",
  "/fotogalereya/semejnyj-uzhin-2": "semeynyy-uzhin",
  "/fotogalereya/franczuzskij-poczeluj-2": "frantsuzskiy-potseluy",
  "/fotogalereya/italyano-2": "italyano",
  "/fotogalereya/vecher-v-marsele": "vecher-v-marsele",
  "/fotogalereya/liguriya-2": "liguriya",
  "/raspisanie/liguriya": "liguriya",
  "/fotogalereya/rimskie-kanikuly-2": "rimskie-kanikuly",
  "/fotogalereya/skandinavskaya-kuhnya-2": "skandinavskaya-kuhnya",
  "/fotogalereya/gurme-2": "gurme",
  "/raspisanie/gurme": "gurme",
  "/raspisanie/gurme-chast-2": "gurme",
  "/fotogalereya/marrakesh-2": "marrakesh",
  "/fotogalereya/palermo": "palermo",
  "/raspisanie/steak-party-ili-den-zashhitnikov-grilya-i-otechestva": "vse-o-steykah",
};

/** Остальные старые записи по префиксу раздела. */
export const LEGACY_SECTIONS = [
  ["/fotogalereya/", "/fotogalereya/"],
  ["/video/nasha-studiya", "/nasha-studiya/"],
  ["/video/", "/fotogalereya/"],
  ["/raspisanie/", "/mk"],
  ["/uncategorized/", "/mk"],
];
