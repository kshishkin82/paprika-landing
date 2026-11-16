// Уведомления о новых заявках: Telegram, MAX и почта (SMTP).
// Каналы включаются переменными окружения (см. .env.example); не настроенный канал просто пропускается.
// Ошибка отправки никогда не мешает сохранению заявки — она только пишется в лог.
import https from "node:https";
import tls from "node:tls";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sendMail } from "./smtp.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MAX_CA = path.join(ROOT, "certs", "russian_trusted_root_ca.pem");
const TIMEOUT_MS = 8000;

const KINDS = {
  master_class: "Мастер-класс",
  event: "Корпоратив / праздник",
  certificate: "Подарочный сертификат",
  other: "Другое",
};

export function orderText(order, siteUrl = "") {
  return [
    "🆕 Новая заявка с сайта",
    `${KINDS[order.kind] || order.kind}${order.master_class_title ? `: ${order.master_class_title}` : ""}`,
    `Имя: ${order.name}`,
    `Телефон: ${order.phone}`,
    order.guests ? `Гостей: ${order.guests}` : "",
    order.comment ? `Комментарий: ${order.comment}` : "",
    siteUrl ? `Все заявки: ${siteUrl.replace(/\/+$/, "")}/admin/#/orders` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** HTTPS-запрос с JSON без зависимостей; ca — дополнительные корневые сертификаты. */
function request(url, { method = "GET", headers = {}, body, ca } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = https.request(
      url,
      {
        method,
        headers: { ...headers, ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}) },
        ...(ca ? { ca } : {}),
        timeout: TIMEOUT_MS,
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let json = null;
          try {
            json = raw ? JSON.parse(raw) : null;
          } catch {
            /* не JSON */
          }
          resolve({ status: res.statusCode, json, raw });
        });
      }
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("Таймаут запроса"), { code: "ETIMEDOUT" })));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function explain(err) {
  if (err.smtpCode === 535) return "неверный логин или пароль приложения (SMTP 535)";
  if (["UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(err.code)) {
    return "сервер не доверяет сертификату (для MAX нужен сертификат Минцифры, см. MAX_CA_FILE)";
  }
  return err.code ? `${err.code}: ${err.message}` : err.message;
}

export function createNotifier(env = process.env, log = console) {
  const siteUrl = env.SITE_URL || "";

  /* ---------- Telegram ---------- */
  const tg = env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? { token: env.TELEGRAM_BOT_TOKEN, chat: env.TELEGRAM_CHAT_ID } : null;

  async function sendTelegram(text) {
    const res = await request(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
      method: "POST",
      body: { chat_id: tg.chat, text, disable_web_page_preview: true },
    });
    if (res.status !== 200 || !res.json?.ok) throw new Error(`Telegram ответил ${res.status}: ${res.json?.description || res.raw.slice(0, 200)}`);
  }

  /* ---------- MAX ---------- */
  const maxTarget = env.MAX_CHAT_ID ? { key: "chat_id", value: env.MAX_CHAT_ID } : env.MAX_USER_ID ? { key: "user_id", value: env.MAX_USER_ID } : null;
  const max = env.MAX_BOT_TOKEN && maxTarget ? { token: env.MAX_BOT_TOKEN, target: maxTarget } : null;
  const maxApi = (env.MAX_API_URL || "https://platform-api2.max.ru").replace(/\/+$/, "");
  let maxCa;

  function maxCaList() {
    if (maxCa !== undefined) return maxCa;
    const files = (env.MAX_CA_FILE ?? DEFAULT_MAX_CA).split(",").map((f) => f.trim()).filter(Boolean);
    const extra = [];
    for (const file of files) {
      try {
        extra.push(fs.readFileSync(path.resolve(ROOT, file), "utf8"));
      } catch (err) {
        log.error(`MAX: не удалось прочитать сертификат ${file}: ${err.message}`);
      }
    }
    maxCa = extra.length ? [...tls.rootCertificates, ...extra] : null;
    return maxCa;
  }

  function maxRequest(pathAndQuery, opts = {}) {
    return request(`${maxApi}${pathAndQuery}`, {
      ...opts,
      headers: { Authorization: env.MAX_BOT_TOKEN, ...(opts.headers || {}) },
      ca: maxCaList() || undefined,
    });
  }

  async function sendMax(text) {
    const q = `${max.target.key}=${encodeURIComponent(max.target.value)}&disable_link_preview=true`;
    const res = await maxRequest(`/messages?${q}`, { method: "POST", body: { text } });
    if (res.status !== 200) throw new Error(`MAX ответил ${res.status}: ${res.json?.message || res.raw.slice(0, 200)}`);
  }

  /* ---------- Почта ---------- */
  const mail =
    env.SMTP_HOST && env.MAIL_TO
      ? {
          host: env.SMTP_HOST,
          port: Number(env.SMTP_PORT || 465),
          // SMTP_SECURE: 1 — TLS сразу (порт 465), 0 — STARTTLS (порт 587); по умолчанию по номеру порта
          secure: env.SMTP_SECURE === undefined || env.SMTP_SECURE === "" ? undefined : env.SMTP_SECURE === "1",
          user: env.SMTP_USER || "",
          pass: env.SMTP_PASS || "",
          from: env.MAIL_FROM || (env.SMTP_USER ? `Paprika Studio <${env.SMTP_USER}>` : ""),
          to: env.MAIL_TO,
        }
      : null;

  async function sendEmail(text, subject = "Новая заявка с сайта Paprika Studio") {
    if (!mail.from) throw new Error("Не задан MAIL_FROM (или SMTP_USER)");
    await sendMail(mail, { from: mail.from, to: mail.to, subject, text });
  }

  const channels = [
    tg && { name: "Telegram", send: sendTelegram },
    max && { name: "MAX", send: sendMax },
    mail && { name: "Почта", send: sendEmail },
  ].filter(Boolean);

  async function sendText(text, subject) {
    return Promise.all(
      channels.map(async (ch) => {
        try {
          await ch.send(text, subject);
          return { channel: ch.name, ok: true };
        } catch (err) {
          return { channel: ch.name, ok: false, error: explain(err) };
        }
      })
    );
  }

  return {
    channels: channels.map((c) => c.name),
    sendText,

    /** Отправка заявки во все настроенные каналы; не бросает исключений. */
    notifyOrder(order) {
      if (!channels.length) return Promise.resolve([]);
      const subject = `Заявка №${order.id}: ${order.name}, ${KINDS[order.kind] || order.kind}${order.master_class_title ? ` «${order.master_class_title}»` : ""}`;
      return sendText(orderText(order, siteUrl), subject).then((results) => {
        for (const r of results) if (!r.ok) log.error(`Уведомление ${r.channel}: ${r.error}`);
        return results;
      });
    },

    /* Для диагностики (npm run notify:ids) */
    telegramUpdates: () => request(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/getUpdates`),
    maxRequest,
  };
}
