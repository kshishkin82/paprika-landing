import fs from "node:fs";
import path from "node:path";

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

const BASE_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "SAMEORIGIN",
};

export function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...BASE_HEADERS, ...headers });
  res.end(body);
}

export function sendJson(res, status, data, headers = {}) {
  send(res, status, JSON.stringify(data), {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
}

export function sendHtml(res, status, html) {
  send(res, status, html, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-cache" });
}

export function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > limit) {
      reject(new HttpError(413, "Слишком большой запрос"));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, "Слишком большой запрос"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function readJson(req, limit = 1024 * 1024) {
  const type = req.headers["content-type"] || "";
  if (!type.includes("application/json")) throw new HttpError(415, "Ожидается JSON");
  const buf = await readBody(req, limit);
  try {
    return buf.length ? JSON.parse(buf.toString("utf8")) : {};
  } catch {
    throw new HttpError(400, "Некорректный JSON");
  }
}

/** Отдаёт файл из root, не выпуская за его пределы. Возвращает false, если файла нет. */
export function serveFile(req, res, root, relPath, cacheControl) {
  let decoded;
  try {
    decoded = decodeURIComponent(relPath);
  } catch {
    return false;
  }
  const full = path.resolve(root, "." + path.posix.normalize("/" + decoded));
  if (!full.startsWith(path.resolve(root) + path.sep)) return false;
  let stat;
  try {
    stat = fs.statSync(full);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const type = MIME[path.extname(full).toLowerCase()];
  if (!type) return false;
  const etag = `W/"${stat.size.toString(16)}-${stat.mtimeMs.toString(16)}"`;
  if (req.headers["if-none-match"] === etag) {
    send(res, 304, null, { ETag: etag, "Cache-Control": cacheControl });
    return true;
  }
  res.writeHead(200, {
    ...BASE_HEADERS,
    "Content-Type": type,
    "Content-Length": stat.size,
    "Cache-Control": cacheControl,
    ETag: etag,
  });
  if (req.method === "HEAD") res.end();
  else fs.createReadStream(full).pipe(res);
  return true;
}

export function clientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  return (typeof fwd === "string" && fwd.split(",")[0].trim()) || req.socket.remoteAddress || "?";
}

/** Простой лимитер: не больше max событий за windowMs для ключа. */
export function rateLimiter(max, windowMs) {
  const hits = new Map();
  return (key) => {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      hits.set(key, { count: 1, reset: now + windowMs });
      if (hits.size > 5000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return true;
    }
    entry.count += 1;
    return entry.count <= max;
  };
}

/* ---------- Текст и даты ---------- */

const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(text) {
  const slug = String(text)
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "master-class";
}

const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const MONTHS_NOM = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

export const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** '2026-03-20T18:00' → '20 марта (пт), 18:00' */
export function formatEventDate(value) {
  if (!value || !DATETIME_RE.test(value)) return "";
  const [d, t] = value.split("T");
  const [y, m, day] = d.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, day)).getUTCDay()];
  return `${day} ${MONTHS_GEN[m - 1]} (${weekday}), ${t}`;
}

/** '2025-03-14' → 'Март 2025' */
export function formatMonthYear(value) {
  if (!value || !DATE_RE.test(value)) return "";
  const [y, m] = value.split("-").map(Number);
  return `${MONTHS_NOM[m - 1]} ${y}`;
}

/** Текущее местное время студии в формате 'YYYY-MM-DDTHH:MM'. */
export function nowLocal(tz) {
  return new Date().toLocaleString("sv-SE", { timeZone: tz }).replace(" ", "T").slice(0, 16);
}

/** Разрешаем только свои загрузки и http(s)-ссылки — для src и url() в стилях. */
export function safeImageUrl(url) {
  if (typeof url !== "string") return "";
  const u = url.trim();
  if (/^\/uploads\/[\w\-./]+$/.test(u) || /^\/assets\/[\w\-./]+$/.test(u)) return u;
  if (/^https?:\/\/[\w\-.:]+(\/[\w\-./%~+=&?]*)?$/i.test(u)) return u;
  return "";
}
