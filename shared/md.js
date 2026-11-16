// Минимальный безопасный Markdown → HTML.
// Сначала экранируем весь HTML, затем размечаем: заголовки, списки, цитаты,
// **жирный**, *курсив*, `код`, [ссылки](https://...), разделитель ---.
// Работает и в Node (рендер страниц), и в браузере (предпросмотр в админке).

const escapeHtml = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

function inline(text) {
  let s = escapeHtml(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    codes.push(c);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
    const raw = url.replace(/&amp;/g, "&");
    if (!SAFE_URL.test(raw)) return label;
    const ext = /^https?:/i.test(raw) ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${url}"${ext}>${label}</a>`;
  });
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(?=\S)([\s\S]*?\S)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*(?=\S)([^*]*?\S)\*(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/(^|[^_\w])_(?=\S)([^_]*?\S)_(?!\w)/g, "$1<em>$2</em>");
  s = s.replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<del>$1</del>");
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

export function renderMarkdown(src = "") {
  const lines = String(src).replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let para = [];
  let list = null; // { type: 'ul'|'ol', items: [] }
  let quote = [];

  const flushPara = () => {
    if (para.length) out.push(`<p>${para.map(inline).join("<br />")}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) out.push(`<${list.type}>${list.items.map((i) => `<li>${inline(i)}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushQuote = () => {
    if (quote.length) out.push(`<blockquote>${renderMarkdown(quote.join("\n"))}</blockquote>`);
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    let m;
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      flushList();
      quote.push(line.replace(/^\s*>\s?/, ""));
      continue;
    }
    flushQuote();

    if (!line.trim()) {
      flushPara();
      flushList();
    } else if ((m = line.match(/^\s*(#{1,4})\s+(.+?)\s*#*\s*$/))) {
      flushAll();
      const level = Math.min(m[1].length + 1, 5); // # → h2 (h1 занят заголовком страницы)
      out.push(`<h${level}>${inline(m[2])}</h${level}>`);
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushAll();
      out.push("<hr />");
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flushPara();
      if (!list || list.type !== "ul") {
        flushList();
        list = { type: "ul", items: [] };
      }
      list.items.push(m[1]);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (!list || list.type !== "ol") {
        flushList();
        list = { type: "ol", items: [] };
      }
      list.items.push(m[1]);
    } else if (list && /^\s{2,}\S/.test(line)) {
      list.items[list.items.length - 1] += " " + line.trim();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushAll();
  return out.join("\n");
}

// Короткий текст без разметки — для превью и meta description.
export function markdownToText(src = "", max = 160) {
  const text = String(src)
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\-*+\d.)\s]+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? text.slice(0, max - 1).trimEnd() + "…" : text;
}

export { escapeHtml };
