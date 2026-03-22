# Paprika Landing - Working Notes

## Current state
- Stack: static `index.html` + modular CSS + minimal JS.
- Tailwind is fully removed.
- CSS moved to `assets/css/`.
- Images moved to `assets/img/`.

## File structure
- HTML:
  - `index.html`
- CSS:
  - `assets/css/base.css`
  - `assets/css/menu.css`
  - `assets/css/hero.css`
  - `assets/css/mcblock.css`
  - `assets/css/events.css`
  - `assets/css/reviews.css`
  - `assets/css/gallery.css`
  - `assets/css/cert.css`
  - `assets/css/contacts.css`
- Images:
  - `assets/img/logo.webp`
  - `assets/img/rabbit.png`
  - `assets/img/cert.png`
  - `assets/img/cert.webp`
  - `assets/img/events-bg.jpg`
- Notes:
  - `.ai/PROJECT_NOTES.md`

## Section order on page
1. `hero`
2. `hero-menu`
3. `mc-section`
4. `events-section`
5. `reviews-section`
6. `gallery-section`
7. `cert-section`
8. `site-footer` (contacts + map)

## Implemented content blocks
- `mc-section`: 3 nearest classes + card "Смотреть все мастер классы".
- `events-section`: formats + "Как проходит мероприятие" + pricing cards.
- `reviews-section`: 3 cards + static left/right arrows + Yandex/2GIS rating badges with stars and Yandex award icon.
- `gallery-section`: intro text + grid from Marrakesh album.
- `cert-section`: gift certificate text + CTA, image as background.
- `contacts`: full-width white block, left text + right Yandex map iframe.

## Responsive rules requested by user (T = phone, P = tablet)
- Hero:
  - On P/T rabbit is above text (`background-position: center top` with top padding).
  - P/T hero padding: `15px 0 0`.
- Menu:
  - On T menu is large and line-by-line (column layout).
- Master classes:
  - P: 2 per row.
  - T: 1 per row.
- Reviews:
  - T: 1 card per row.
- Certificate:
  - P: `background-size: 50%`.
  - T: `background-size: 84%`.
- Contacts:
  - P text size: `15px`.
  - T text size: `19px`.

## Design notes currently active
- Global non-heading font-size rule:
  - `clamp(15px, 17px, 20px)` in `base.css` (with `!important`).
- All `h2` globally styled similar to contacts style (underline + weight + clamp size).
- Footer has fixed height `1000px` (explicit request).

## Data sources used
- Schedule cards: `http://5.188.31.156/raspisanie/`
- Gallery photos: `http://5.188.31.156/fotogalereya/marrakesh-2/`

## Caveats to remember
- `script.js` toggles `.menu.is-open`, but currently there is no header menu button in DOM.
- Because of global font-size override + many iterative tweaks, mobile typography may need another pass.
- `events.css` still contains some legacy selectors (`.event-dot`) no longer used in HTML.

## Resume checklist
1. Validate T/P breakpoints visually in browser (hero, menu, mc, reviews, cert, contacts).
2. Re-check global `h2` + global text clamp impact on all sections.
3. If header is not coming back, simplify or remove `script.js`.
