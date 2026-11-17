# Paprika Landing

Static landing page for Paprika Studio — a cooking school in Volgograd, Russia.

## Stack

- Plain HTML + modular CSS + minimal vanilla JS
- No build tools, no framework, no Tailwind
- Fonts: Manrope + Merriweather via Google Fonts
- CMS: Node.js (>= 22.13) + built-in `node:sqlite`, **zero npm dependencies**
  - `server.js` — HTTP server: renders the landing from DB, `/mk`, `/mk/<slug>`, `/admin/`, JSON API
  - `server/` — `db.js` (schema), `repo.js` (data access + validation), `render.js` (SSR), `auth.js` (password + sessions), `uploads.js`, `seed.js`, `set-password.js`
  - `shared/md.js` — safe Markdown renderer used by both server and admin preview
  - `admin/` — vanilla JS admin SPA (orders, master classes, gallery, reviews)
  - Data: `data/paprika.db`, uploads: `uploads/` (both gitignored); config via `.env` (see `.env.example`)
  - Order notifications: `server/notify.js` (Telegram, MAX, email via `server/smtp.js`), configured in `.env`; `npm run notify:test` / `notify:ids`; setup guide `docs/notifications.md`; `certs/russian_trusted_root_ca.pem` is used only for MAX API requests
- `index.html` is a template: content between `<!--cms:mc-->`, `<!--cms:reviews-->`, `<!--cms:gallery-->`, `<!--cms:order-modal-->` markers is replaced by the server; the static content inside stays as a fallback when the file is opened directly

## File structure

```
index.html
script.js
assets/
  css/
    base.css        # global reset, typography, clamp font sizes
    menu.css        # hero-menu nav
    hero.css        # hero section
    mcblock.css     # master-class cards grid
    events.css      # events section (formats + "how it goes" panel + CTA)
    reviews.css     # reviews cards + nav arrows + rating badges
    gallery.css     # photo gallery grid
    cert.css        # gift certificate section
    contacts.css    # footer contacts + Yandex map
  img/
    logo.webp
    rabbit.png / rabbit.webp   # webp is served via image-set, png is fallback
    cert.png / cert.webp
    events-bg.jpg
.ai/PROJECT_NOTES.md   # detailed working notes
```

## Page section order

1. `hero`
2. `hero-menu`
3. `mc-section` (#mc)
4. `events-section` (#events)
5. `reviews-section` (#reviews)
6. `gallery-section` (#gallery)
7. `cert-section` (#cert)
8. `site-footer` (#contacts) — also serves as the footer

## Key design rules

- Global body font-size: `clamp(15px, 17px, 20px)` with `!important` in `base.css` — any other size on `p`/`a`/`span`/`li`/`strong`/`button` (chips, labels, buttons) needs its own `!important`
- All `h2` globally styled with underline + weight + clamp size (contacts style)
- Footer (#contacts) is one screen tall under the sticky menu (`min-height: calc(100dvh - var(--menu-h))`), copyright pinned to its bottom; grows with content on short screens; the map stretches to the free height
- Palette tokens live in `base.css`: dark sections use `--bg`/`--ink`/`--chalk`, light sections (reviews, contacts) use `--paper`/`--paper-ink`/`--paper-muted`/`--paper-line`; accent is `--hot` (white text needs `--hot` or darker for contrast)
- Shadows are neutral (black); the red accent is used for fills, rings and background gradients, not for glows
- Hero: top row with logo + address link, eyebrow line above `h1`; sticky menu shows the «Записаться» button (`.menu-cta`) once the hero is scrolled away (`.is-stuck`, desktop ≥ 1024px)
- Master-class card: photo fills the card, bottom scrim, date chip above the title; markup comes from `server/render.js` (`mcCard`) and the static fallback in `index.html`
- Cards revealed by JS get `.reveal`; hover lift on them needs a selector at least as specific as `.js .reveal.is-visible` (see `.mc-grid a.mc-card:hover`)

## Responsive breakpoints

- **Tablet (P):** mc cards 2-per-row, cert `background-size: 50%`, contacts text `15px`
- **Phone (T):** hero rabbit above text, menu column layout, mc 1-per-row, reviews 1-per-row, gallery 2-per-row, cert `background-size: 84%` (bottom padding of `.cert-inner` is tied to the image height via `vw`), contacts text `19px`

## Known caveats

- `script.js`: scroll-spy for `.hero-menu`, reveal-on-scroll (`.js .reveal`), reviews carousel (scroll-snap, arrows hide when nothing to scroll), gallery lightbox (`[data-lightbox]`), footer year
- Phone: floating `.call-fab` call button (styles in `contacts.css`)
- Photos for mc-cards / gallery are hotlinked from `5.188.31.156` — if that server is down, cards show a dark fallback
- Mobile typography may need a pass due to global font-size override + iterative tweaks

## Development

- `cp .env.example .env`, set `ADMIN_PASSWORD`, then `npm run dev` → site http://localhost:3000, admin http://localhost:3000/admin/
- `Makefile` wraps the same commands: `make` (help), `make env`, `make dev`, `make start`, `make password PASS=<new>`, `make notify-test`, `make notify-ids`, `make reset` (asks before deleting `data/`)
- `npm start` for production; `npm run password -- <new>` changes the DB-stored password (used when `ADMIN_PASSWORD` is not set)
- Reset local data: stop the server and delete `data/` (seed refills it from the old static content)
- Static-only preview still works: open `index.html` directly (no CMS data, no order form)
