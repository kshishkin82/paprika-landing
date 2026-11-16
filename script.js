document.documentElement.classList.add("js");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Текущий год в футере ---------- */
document.querySelectorAll("[data-year]").forEach((el) => {
  el.textContent = String(new Date().getFullYear());
});

/* ---------- Отступ якорей ровно под липкое меню ---------- */
const stickyMenu = document.querySelector(".hero-menu");
if (stickyMenu) {
  const syncMenuHeight = () => {
    const sticky = getComputedStyle(stickyMenu).position === "sticky";
    const height = sticky ? Math.round(stickyMenu.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty("--menu-h", `${height}px`);
  };
  syncMenuHeight();
  if ("ResizeObserver" in window) new ResizeObserver(syncMenuHeight).observe(stickyMenu);
  window.addEventListener("resize", syncMenuHeight);

  /* меню «прилипло» (hero ушёл за экран) — показываем в нём кнопку записи */
  const hero = document.querySelector(".hero");
  if (hero && "IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => stickyMenu.classList.toggle("is-stuck", !entry.isIntersecting)).observe(hero);
  }
}

/* ---------- Кнопка «Позвонить» прячется в блоке контактов ---------- */
const callFab = document.querySelector(".call-fab");
const contactsBlock = document.getElementById("contacts");
if (callFab && contactsBlock && "IntersectionObserver" in window) {
  new IntersectionObserver(([entry]) => callFab.classList.toggle("is-away", entry.isIntersecting), {
    threshold: 0.25,
  }).observe(contactsBlock);
}

/* ---------- Подсветка активного пункта меню ---------- */
const menuLinks = [...document.querySelectorAll(".hero-menu a[href^='#']:not(.menu-cta)")];
const sections = menuLinks
  .map((link) => document.querySelector(link.getAttribute("href")))
  .filter(Boolean);

if ("IntersectionObserver" in window && sections.length) {
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const id = `#${entry.target.id}`;
        menuLinks.forEach((link) => {
          const active = link.getAttribute("href") === id;
          link.classList.toggle("is-active", active);
          if (active) link.setAttribute("aria-current", "true");
          else link.removeAttribute("aria-current");
        });
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  sections.forEach((section) => spy.observe(section));
}

/* ---------- Плавное появление блоков ---------- */
const revealItems = document.querySelectorAll(".reveal, .mc-card, .event-type, .review-card, .gallery-item");
if ("IntersectionObserver" in window && !prefersReducedMotion) {
  revealItems.forEach((el) => el.classList.add("reveal"));
  const revealer = new IntersectionObserver(
    (entries, obs) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px" }
  );
  revealItems.forEach((el) => revealer.observe(el));
} else {
  revealItems.forEach((el) => el.classList.add("is-visible"));
}

/* ---------- Карусель отзывов ---------- */
const track = document.querySelector(".reviews-grid");
const prevBtn = document.querySelector(".reviews-nav-left");
const nextBtn = document.querySelector(".reviews-nav-right");

if (track && prevBtn && nextBtn) {
  const step = () => {
    const card = track.querySelector(".review-card");
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    return card ? card.getBoundingClientRect().width + gap : track.clientWidth;
  };

  const updateNav = () => {
    const max = track.scrollWidth - track.clientWidth - 2;
    const scrollable = max > 0;
    prevBtn.disabled = !scrollable || track.scrollLeft <= 2;
    nextBtn.disabled = !scrollable || track.scrollLeft >= max;
    prevBtn.hidden = nextBtn.hidden = !scrollable;
  };

  const behavior = prefersReducedMotion ? "auto" : "smooth";
  prevBtn.addEventListener("click", () => track.scrollBy({ left: -step(), behavior }));
  nextBtn.addEventListener("click", () => track.scrollBy({ left: step(), behavior }));
  track.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") track.scrollBy({ left: step(), behavior });
    if (event.key === "ArrowLeft") track.scrollBy({ left: -step(), behavior });
  });
  track.addEventListener("scroll", updateNav, { passive: true });
  window.addEventListener("resize", updateNav);
  updateNav();
}

/* ---------- Лайтбокс галереи ---------- */
const galleryLinks = [...document.querySelectorAll("[data-lightbox]")];

if (galleryLinks.length) {
  const box = document.createElement("div");
  box.className = "lightbox";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Просмотр фотографии");
  box.hidden = true;
  box.innerHTML = `
    <button class="lightbox-btn lightbox-close" type="button" aria-label="Закрыть">×</button>
    <button class="lightbox-btn lightbox-prev" type="button" aria-label="Предыдущее фото">‹</button>
    <figure class="lightbox-figure">
      <img class="lightbox-img" alt="" />
      <figcaption>
        <p class="lightbox-desc" hidden></p>
        <span class="lightbox-caption"></span>
      </figcaption>
    </figure>
    <button class="lightbox-btn lightbox-next" type="button" aria-label="Следующее фото">›</button>
  `;
  document.body.append(box);

  const img = box.querySelector(".lightbox-img");
  const caption = box.querySelector(".lightbox-caption");
  const desc = box.querySelector(".lightbox-desc");
  const closeBtn = box.querySelector(".lightbox-close");
  let index = 0;
  let lastFocus = null;

  const show = (i) => {
    index = (i + galleryLinks.length) % galleryLinks.length;
    const link = galleryLinks[index];
    const alt = link.querySelector("img")?.alt || "";
    img.src = link.href;
    img.alt = alt;
    caption.textContent = `${index + 1} / ${galleryLinks.length}`;
    const text = link.dataset.description || "";
    desc.textContent = text;
    desc.hidden = !text;
  };

  const open = (i) => {
    lastFocus = document.activeElement;
    show(i);
    box.hidden = false;
    document.body.classList.add("no-scroll");
    closeBtn.focus();
  };

  const close = () => {
    box.hidden = true;
    document.body.classList.remove("no-scroll");
    lastFocus?.focus();
  };

  galleryLinks.forEach((link, i) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      open(i);
    });
  });

  closeBtn.addEventListener("click", close);
  box.querySelector(".lightbox-prev").addEventListener("click", () => show(index - 1));
  box.querySelector(".lightbox-next").addEventListener("click", () => show(index + 1));
  box.addEventListener("click", (event) => {
    if (event.target === box) close();
  });
  document.addEventListener("keydown", (event) => {
    if (box.hidden) return;
    if (event.key === "Escape") close();
    if (event.key === "ArrowLeft") show(index - 1);
    if (event.key === "ArrowRight") show(index + 1);
  });
}

/* ---------- Форма заявки ---------- */
const orderModal = document.getElementById("order-modal");

if (orderModal && typeof orderModal.showModal === "function") {
  const form = orderModal.querySelector(".order-form");
  const success = orderModal.querySelector(".order-success");
  const errorBox = form.querySelector(".order-error");
  const submitBtn = form.querySelector(".order-submit");
  const kindSelect = form.elements.kind;
  const mcSelect = form.elements.master_class_id;

  const syncKind = () => {
    form.querySelectorAll("[data-kind-only]").forEach((field) => {
      field.hidden = !field.dataset.kindOnly.split(" ").includes(kindSelect.value);
    });
  };

  const openOrder = (kind = "master_class", mcId = "") => {
    form.reset();
    form.hidden = false;
    success.hidden = true;
    errorBox.hidden = true;
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    kindSelect.value = kind;
    if (mcId && [...mcSelect.options].some((o) => o.value === String(mcId))) mcSelect.value = String(mcId);
    syncKind();
    orderModal.showModal();
    form.elements.name.focus();
  };

  document.querySelectorAll("[data-order]").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      openOrder(btn.dataset.order, btn.dataset.orderMc || "");
    });
  });

  orderModal.addEventListener("click", (event) => {
    if (event.target === orderModal || event.target.closest("[data-order-close]")) orderModal.close();
  });
  kindSelect.addEventListener("change", syncKind);

  /* кнопки − / + у количества гостей */
  form.querySelectorAll(".order-stepper").forEach((stepper) => {
    const input = stepper.querySelector("input");
    const min = Number(input.min) || 1;
    const max = Number(input.max) || 200;
    stepper.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-step]");
      if (!btn) return;
      const current = parseInt(input.value, 10);
      const next = Number.isNaN(current) ? min : current + Number(btn.dataset.step);
      input.value = String(Math.min(max, Math.max(min, next)));
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorBox.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    /* у гостей есть значение по умолчанию — не отправляем его, когда поле скрыто (сертификат, «другое») */
    if (form.elements.guests.closest(".order-field").hidden) data.guests = "";
    const invalid = [];
    if (!data.name.trim()) invalid.push(form.elements.name);
    if ((data.phone.match(/\d/g) || []).length < 6) invalid.push(form.elements.phone);
    form.querySelectorAll("[aria-invalid]").forEach((el) => el.removeAttribute("aria-invalid"));
    if (invalid.length) {
      invalid.forEach((el) => el.setAttribute("aria-invalid", "true"));
      errorBox.textContent = "Укажите имя и телефон, чтобы мы могли связаться с вами.";
      errorBox.hidden = false;
      invalid[0].focus();
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = "Отправляем…";
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Не удалось отправить заявку");
      form.hidden = true;
      success.hidden = false;
      success.querySelector("button.btn").focus();
    } catch (err) {
      errorBox.textContent = `${err.message}. Попробуйте ещё раз или позвоните: +7 (937) 530-10-90.`;
      errorBox.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Отправить заявку";
    }
  });
}
