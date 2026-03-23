# Paprika Landing

Static landing page for Paprika Studio — a cooking school in Volgograd, Russia.

## Stack

- Plain HTML + modular CSS + minimal vanilla JS
- No build tools, no framework, no Tailwind
- Fonts: Manrope + Merriweather via Google Fonts

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
    events.css      # events section (contains legacy .event-dot selector)
    reviews.css     # reviews cards + nav arrows + rating badges
    gallery.css     # photo gallery grid
    cert.css        # gift certificate section
    contacts.css    # footer contacts + Yandex map
  img/
    logo.webp
    rabbit.png
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

- Global body font-size: `clamp(15px, 17px, 20px)` with `!important` in `base.css`
- All `h2` globally styled with underline + weight + clamp size (contacts style)
- Footer has explicit `height: 1000px`

## Responsive breakpoints

- **Tablet (P):** mc cards 2-per-row, cert `background-size: 50%`, contacts text `15px`
- **Phone (T):** hero rabbit above text, menu column layout, mc 1-per-row, reviews 1-per-row, cert `background-size: 84%`, contacts text `19px`

## Known caveats

- `script.js` toggles `.menu.is-open` but there is no header menu button in DOM
- `events.css` has legacy `.event-dot` selectors no longer used in HTML
- Mobile typography may need a pass due to global font-size override + iterative tweaks

## Development

Open `index.html` directly in browser — no build step required.
