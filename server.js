import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./server/db.js";
import { initAuth } from "./server/auth.js";
import { createRepo } from "./server/repo.js";
import { createNotifier } from "./server/notify.js";
import { createRenderer } from "./server/render.js";
import { PAGES, REDIRECTS, LEGACY_MC, LEGACY_SECTIONS } from "./server/pages.js";
import { seed } from "./server/seed.js";
import { saveUpload, removeUploadIfUnused, MAX_UPLOAD } from "./server/uploads.js";
import { HttpError, send, sendJson, sendHtml, readJson, readBody, serveFile, clientIp, rateLimiter, nowLocal } from "./server/util.js";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const TZ = process.env.SITE_TZ || "Europe/Volgograd";
const UPLOADS = process.env.UPLOADS_DIR || path.join(ROOT, "uploads");

const db = openDb(process.env.DB_FILE || path.join(ROOT, "data", "paprika.db"));
const repo = createRepo(db);
const auth = initAuth(db);
seed(db, repo);
const render = createRenderer({ root: ROOT, repo, now: () => nowLocal(TZ) });
const orderLimiter = rateLimiter(5, 10 * 60 * 1000);
const notifier = createNotifier();
if (notifier.channels.length) console.log(`Уведомления о заявках: ${notifier.channels.join(", ")}`);

const cleanup = (urls) => urls.forEach((u) => removeUploadIfUnused(db, UPLOADS, u));

/* ---------- API админки ---------- */

async function adminApi(req, res, route) {
  const { method } = req;

  if (route === "login" && method === "POST") {
    const { password } = await readJson(req, 4096);
    const cookie = auth.login(req, password);
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": cookie });
  }
  if (route === "logout" && method === "POST") {
    return sendJson(res, 200, { ok: true }, { "Set-Cookie": auth.logout(req) });
  }
  if (route === "me" && method === "GET") {
    return sendJson(res, 200, { authed: auth.isAuthed(req) });
  }

  auth.requireAdmin(req);
  let m;

  if (route === "summary" && method === "GET") {
    return sendJson(res, 200, { orders: repo.orderCounts() });
  }

  if (route === "upload" && method === "POST") {
    const buf = await readBody(req, MAX_UPLOAD);
    return sendJson(res, 201, { url: saveUpload(UPLOADS, buf) });
  }

  // Мастер-классы
  if (route === "master-classes") {
    if (method === "GET") return sendJson(res, 200, repo.listMasterClasses());
    if (method === "POST") {
      const { item } = repo.saveMasterClass(await readJson(req));
      return sendJson(res, 201, item);
    }
  }
  if (route === "master-classes/order" && method === "PUT") {
    repo.reorderMasterClasses((await readJson(req)).ids);
    return sendJson(res, 200, { ok: true });
  }
  if ((m = route.match(/^master-classes\/(\d+)$/))) {
    if (method === "GET") {
      const item = repo.getMasterClass(m[1]);
      if (!item) throw new HttpError(404, "Мастер-класс не найден");
      return sendJson(res, 200, item);
    }
    if (method === "PUT") {
      const { item, removed } = repo.saveMasterClass(await readJson(req), Number(m[1]));
      cleanup(removed);
      return sendJson(res, 200, item);
    }
    if (method === "DELETE") {
      cleanup(repo.deleteMasterClass(m[1]));
      return sendJson(res, 200, { ok: true });
    }
  }

  // Галерея
  if (route === "gallery") {
    if (method === "GET") return sendJson(res, 200, repo.listGallery());
    if (method === "POST") return sendJson(res, 201, repo.addGalleryPhoto(await readJson(req)));
  }
  if (route === "gallery/order" && method === "PUT") {
    repo.reorderGallery((await readJson(req)).ids);
    return sendJson(res, 200, { ok: true });
  }
  if ((m = route.match(/^gallery\/(\d+)$/))) {
    if (method === "PATCH") return sendJson(res, 200, repo.updateGalleryPhoto(m[1], await readJson(req)));
    if (method === "DELETE") {
      cleanup([repo.deleteGalleryPhoto(m[1])]);
      return sendJson(res, 200, { ok: true });
    }
  }

  // Отзывы
  if (route === "reviews") {
    if (method === "GET") return sendJson(res, 200, repo.listReviews());
    if (method === "POST") return sendJson(res, 201, repo.saveReview(await readJson(req)).item);
  }
  if ((m = route.match(/^reviews\/(\d+)$/))) {
    if (method === "GET") {
      const item = repo.getReview(m[1]);
      if (!item) throw new HttpError(404, "Отзыв не найден");
      return sendJson(res, 200, item);
    }
    if (method === "PUT") {
      const { item, removed } = repo.saveReview(await readJson(req), Number(m[1]));
      cleanup(removed);
      return sendJson(res, 200, item);
    }
    if (method === "DELETE") {
      cleanup([repo.deleteReview(m[1])]);
      return sendJson(res, 200, { ok: true });
    }
  }

  // Заявки
  if (route === "orders" && method === "GET") {
    const status = new URL(req.url, "http://x").searchParams.get("status");
    return sendJson(res, 200, { items: repo.listOrders(status), counts: repo.orderCounts() });
  }
  if ((m = route.match(/^orders\/(\d+)$/))) {
    if (method === "PATCH") return sendJson(res, 200, repo.updateOrder(m[1], await readJson(req)));
    if (method === "DELETE") {
      repo.deleteOrder(m[1]);
      return sendJson(res, 200, { ok: true });
    }
  }

  throw new HttpError(404, "Не найдено");
}

/* ---------- Маршруты ---------- */

const TEXT_HEADERS = (type) => ({ "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "public, max-age=3600" });

/** Куда вести старый адрес (WordPress-сайт) или null. */
function legacyTarget(p) {
  const key = p.replace(/\/+$/, "").toLowerCase();
  if (REDIRECTS[key]) return REDIRECTS[key];
  const mcSlug = LEGACY_MC[key];
  if (mcSlug && repo.getMasterClassBySlug(mcSlug)) return `/mk/${mcSlug}`;
  const section = LEGACY_SECTIONS.find(([prefix]) => (key + "/").startsWith(prefix));
  return section ? section[1] : null;
}

/** Адрес сайта для sitemap/robots: SITE_URL из .env, иначе — из заголовков запроса. */
function siteBase(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, "");
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`).split(",")[0].trim();
  return `${proto}://${host}`;
}

async function handle(req, res) {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  if (p.startsWith("/api/admin/")) return adminApi(req, res, p.slice("/api/admin/".length).replace(/\/+$/, ""));

  if (p === "/api/orders" && req.method === "POST") {
    const body = await readJson(req, 16 * 1024);
    if (body.website) return sendJson(res, 201, { ok: true }); // бот заполнил скрытое поле
    if (!orderLimiter(clientIp(req))) throw new HttpError(429, "Слишком много заявок. Позвоните нам, пожалуйста.");
    const order = repo.createOrder(body);
    notifier.notifyOrder(order);
    return sendJson(res, 201, { ok: true });
  }

  if (p.startsWith("/api/")) throw new HttpError(404, "Не найдено");
  if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(405, "Метод не поддерживается");

  if (p === "/robots.txt") return send(res, 200, render.robots(siteBase(req)), TEXT_HEADERS("text/plain"));
  if (p === "/sitemap.xml") return send(res, 200, render.sitemap(siteBase(req)), TEXT_HEADERS("application/xml"));

  if (p === "/" || p === "/index.html") return sendHtml(res, 200, render.landing());
  if (p === "/mk" || p === "/mk/") return sendHtml(res, 200, render.masterClassList());
  let m;
  if ((m = p.match(/^\/mk\/([a-z0-9-]+)\/?$/))) {
    const mc = repo.getMasterClassBySlug(m[1]);
    return mc ? sendHtml(res, 200, render.masterClassPage(mc)) : sendHtml(res, 404, render.notFound());
  }

  if ((m = p.match(/^\/([a-z-]+)(\/?)$/)) && Object.hasOwn(PAGES, m[1])) {
    if (!m[2]) return send(res, 301, null, { Location: `/${m[1]}/${url.search}` });
    return sendHtml(res, 200, render.staticPage(m[1]));
  }
  const legacy = legacyTarget(p);
  if (legacy) return send(res, 301, null, { Location: legacy });

  if (p === "/admin") return send(res, 301, null, { Location: "/admin/" });
  if (p === "/admin/") {
    if (serveFile(req, res, path.join(ROOT, "admin"), "index.html", "no-cache")) return;
  }
  if (p.startsWith("/admin/") && serveFile(req, res, path.join(ROOT, "admin"), p.slice(7), "no-cache")) return;
  if (p.startsWith("/assets/") && serveFile(req, res, path.join(ROOT, "assets"), p.slice(8), "no-cache")) return;
  if (p.startsWith("/shared/") && serveFile(req, res, path.join(ROOT, "shared"), p.slice(8), "no-cache")) return;
  if (p.startsWith("/uploads/") && serveFile(req, res, UPLOADS, p.slice(9), "public, max-age=31536000, immutable")) return;
  if (p === "/script.js" && serveFile(req, res, ROOT, "script.js", "no-cache")) return;
  if (p === "/favicon.ico" && serveFile(req, res, path.join(ROOT, "assets", "img"), "favicon.ico", "public, max-age=86400")) return;

  sendHtml(res, 404, render.notFound());
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    const status = err instanceof HttpError ? err.status : 500;
    if (status === 500) console.error(err);
    if (res.headersSent) return res.end();
    sendJson(res, status, { error: status === 500 ? "Ошибка сервера" : err.message });
  });
});

server.listen(PORT, () => {
  console.log(`Paprika: сайт http://localhost:${PORT}  ·  админка http://localhost:${PORT}/admin/`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close();
    db.close();
    process.exit(0);
  });
}
