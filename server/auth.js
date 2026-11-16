import crypto from "node:crypto";
import { getSetting, setSetting } from "./db.js";
import { HttpError, rateLimiter, clientIp } from "./util.js";

const COOKIE = "paprika_sid";
const SESSION_DAYS = 30;
const loginLimiter = rateLimiter(10, 15 * 60 * 1000);

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyHash(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const actual = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === actual.length && crypto.timingSafeEqual(actual, expected);
}

/** Готовит проверку пароля: ADMIN_PASSWORD из окружения или хэш в базе. */
export function initAuth(db, log = console.log) {
  const envPassword = process.env.ADMIN_PASSWORD;
  let envHash = null;
  if (envPassword) {
    envHash = hashPassword(envPassword);
    log("Админка: пароль берётся из ADMIN_PASSWORD.");
  } else if (!getSetting(db, "admin_password_hash")) {
    const generated = crypto.randomBytes(9).toString("base64url");
    setSetting(db, "admin_password_hash", hashPassword(generated));
    log(`Админка: создан пароль «${generated}». Сменить: npm run password -- <новый пароль>`);
  }
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());

  const checkPassword = (password) =>
    typeof password === "string" &&
    password.length > 0 &&
    verifyHash(password, envHash ?? getSetting(db, "admin_password_hash"));

  function readToken(req) {
    const cookie = req.headers.cookie || "";
    const m = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([A-Za-z0-9_-]+)`));
    return m ? m[1] : null;
  }

  function cookieHeader(token, maxAge) {
    const secure = process.env.COOKIE_SECURE === "1" ? "; Secure" : "";
    return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
  }

  return {
    isAuthed(req) {
      const token = readToken(req);
      if (!token) return false;
      const row = db.prepare("SELECT expires_at FROM sessions WHERE token_hash = ?").get(sha256(token));
      return Boolean(row && row.expires_at > Date.now());
    },

    /** Мутирующие запросы админки: сессия + свой заголовок (защита от CSRF). */
    requireAdmin(req) {
      if (!this.isAuthed(req)) throw new HttpError(401, "Нужно войти");
      if (req.method !== "GET" && req.method !== "HEAD" && req.headers["x-cms"] !== "1") {
        throw new HttpError(403, "Запрос отклонён");
      }
    },

    login(req, password) {
      if (!loginLimiter(clientIp(req))) throw new HttpError(429, "Слишком много попыток, попробуйте позже");
      if (!checkPassword(password)) throw new HttpError(401, "Неверный пароль");
      const token = crypto.randomBytes(32).toString("base64url");
      const maxAge = SESSION_DAYS * 24 * 3600;
      db.prepare("INSERT INTO sessions (token_hash, expires_at) VALUES (?, ?)").run(sha256(token), Date.now() + maxAge * 1000);
      return cookieHeader(token, maxAge);
    },

    logout(req) {
      const token = readToken(req);
      if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
      return cookieHeader("", 0);
    },
  };
}
