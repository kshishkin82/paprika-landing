# Paprika Landing - Working Notes

## Project state
- Stack: static HTML + CSS + tiny JS (`script.js` only for mobile menu toggle, currently header removed so JS mostly unused).
- Tailwind removed. Styles split by domain:
  - `base.css`
  - `menu.css`
  - `hero.css`
  - `mcblock.css`
  - `events.css`
  - `reviews.css`
  - `gallery.css`
  - `cert.css`
  - `contacts.css`
- Main page: `index.html`.

## Current section order
1. `hero`
2. `hero-menu` (menu under hero)
3. `mc-section` (4 cards: 3 nearest workshops + "Смотреть все мастер классы")
4. `events-section`
5. `reviews-section`
6. `gallery-section`
7. `cert-section`
8. `site-footer` (contacts + map iframe)

## Assets in `design/`
- `logo.webp`
- `rabbit.png`
- `cert.png`
- `cert.webp`
- `events-bg.jpg` (used as blurred/dimmed background for events section)

## Important styling decisions implemented
- Dark theme for most sections with custom CSS variables in `:root`.
- Hero rabbit is a background image (not `<img>`), positioned and tuned via `hero.css`.
- Workshop cards:
  - fixed 4-column grid
  - hover zoom applies to background layer only (`::before`), not card size.
- Reviews:
  - white background section
  - static decorative left/right arrow buttons
  - right-aligned rating badges (Yandex + 2GIS), star ratings, Yandex "Хорошее место 2026" icon.
- Gallery:
  - text intro above grid
  - hover zoom only inside clipped card.
- Certificate block:
  - background image from `design/cert.png`
  - black/dark background and min-height configured.
- Contacts:
  - full-width white card
  - 2-column layout with map iframe on right.

## Content/data sources used
- Workshops and dates were taken from:
  - `http://5.188.31.156/raspisanie/`
- Gallery images were taken from:
  - `http://5.188.31.156/fotogalereya/marrakesh-2/`

## Known caveats
- `script.js` still toggles `.menu.is-open`; currently no header menu button in DOM after header removal.
- Some media-query values were heavily customized during iteration; re-check mobile layout before release.
- Footer has forced `height: 1000px` by explicit user request.

## Quick resume checklist for next session
1. Open `index.html` and verify final visual hierarchy after latest tweaks.
2. Check `events-title` visibility over blurred background (`events-head-wrap` with z-index).
3. Validate responsive behavior for `events`, `reviews-meta` badges, `contacts-layout`.
4. If needed, remove/adjust obsolete JS in `script.js`.
