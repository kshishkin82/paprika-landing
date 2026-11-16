// Минимальный SMTP-клиент без зависимостей: TLS (порт 465) или STARTTLS (587), AUTH PLAIN/LOGIN,
// одно текстовое письмо в UTF-8. Достаточно для Яндекс/Mail.ru/Gmail/почты на своём домене.
import net from "node:net";
import tls from "node:tls";
import os from "node:os";
import crypto from "node:crypto";

const b64 = (s) => Buffer.from(s, "utf8").toString("base64");
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);
const wrap76 = (s) => s.replace(/.{1,76}/g, "$&\r\n");

/** Разбор адреса вида «Имя <a@b.ru>» или «a@b.ru». */
function parseAddress(value) {
  const m = String(value).match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].replace(/^"|"$/g, ""), email: m[2].trim() } : { name: "", email: String(value).trim() };
}
const formatAddress = ({ name, email }) => (name ? `${encodeHeader(name)} <${email}>` : email);

class SmtpConnection {
  constructor(socket, timeout) {
    this.socket = socket;
    this.timeout = timeout;
    this.buffer = "";
    this.waiters = [];
    this.attach(socket);
  }

  attach(socket) {
    socket.setEncoding("utf8");
    socket.setTimeout(this.timeout, () => socket.destroy(Object.assign(new Error("Таймаут SMTP"), { code: "ETIMEDOUT" })));
    socket.on("data", (chunk) => {
      this.buffer += chunk;
      this.flush();
    });
    socket.on("error", (err) => this.fail(err));
    socket.on("close", () => this.fail(new Error("SMTP-сервер закрыл соединение")));
  }

  fail(err) {
    for (const w of this.waiters.splice(0)) w.reject(err);
  }

  flush() {
    // Ответ готов, когда есть строка вида «250 текст» (код + пробел).
    while (this.waiters.length) {
      const lines = this.buffer.split("\r\n");
      const end = lines.findIndex((l) => /^\d{3} /.test(l) || /^\d{3}$/.test(l));
      if (end === -1) return;
      const reply = lines.slice(0, end + 1);
      this.buffer = lines.slice(end + 1).join("\r\n");
      const code = Number(reply[end].slice(0, 3));
      this.waiters.shift().resolve({ code, text: reply.map((l) => l.slice(4)).join("\n"), lines: reply });
    }
  }

  read() {
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
      this.flush();
    });
  }

  async cmd(line, expect, label = line.split(" ")[0]) {
    if (line !== null) this.socket.write(line + "\r\n");
    const reply = await this.read();
    const ok = Array.isArray(expect) ? expect.includes(reply.code) : reply.code === expect;
    if (!ok) throw Object.assign(new Error(`SMTP ${label}: ${reply.code} ${reply.text}`), { smtpCode: reply.code });
    return reply;
  }

  upgrade(host) {
    return new Promise((resolve, reject) => {
      this.socket.removeAllListeners("data");
      this.socket.removeAllListeners("close");
      this.socket.removeAllListeners("error");
      const secure = tls.connect({ socket: this.socket, servername: host }, () => resolve());
      secure.once("error", reject);
      this.socket = secure;
      this.attach(secure);
    });
  }
}

/**
 * @param {object} cfg  host, port, secure (true = TLS сразу, false = STARTTLS если поддерживается), user, pass, timeout
 * @param {object} mail from, to (строка или массив), subject, text
 */
export async function sendMail(cfg, mail) {
  const port = Number(cfg.port || 465);
  const secure = cfg.secure ?? port === 465;
  const timeout = cfg.timeout || 15000;
  const socket = await new Promise((resolve, reject) => {
    const s = secure
      ? tls.connect({ host: cfg.host, port, servername: cfg.host }, () => resolve(s))
      : net.connect({ host: cfg.host, port }, () => resolve(s));
    s.once("error", reject);
    s.setTimeout(timeout, () => s.destroy(Object.assign(new Error("Таймаут подключения к SMTP"), { code: "ETIMEDOUT" })));
  });
  const conn = new SmtpConnection(socket, timeout);
  const helo = cfg.helo || os.hostname() || "localhost";

  try {
    await conn.cmd(null, 220, "приветствие");
    let ehlo = await conn.cmd(`EHLO ${helo}`, 250);
    if (!secure && /STARTTLS/i.test(ehlo.text)) {
      await conn.cmd("STARTTLS", 220);
      await conn.upgrade(cfg.host);
      ehlo = await conn.cmd(`EHLO ${helo}`, 250);
    }
    if (cfg.user) {
      if (/AUTH[ =][^\n]*PLAIN/i.test(ehlo.text)) {
        await conn.cmd(`AUTH PLAIN ${b64(`\0${cfg.user}\0${cfg.pass || ""}`)}`, 235, "AUTH");
      } else {
        await conn.cmd("AUTH LOGIN", 334, "AUTH");
        await conn.cmd(b64(cfg.user), 334, "AUTH");
        await conn.cmd(b64(cfg.pass || ""), 235, "AUTH");
      }
    }

    const from = parseAddress(mail.from);
    const to = (Array.isArray(mail.to) ? mail.to : String(mail.to).split(",")).map((a) => a.trim()).filter(Boolean).map(parseAddress);
    await conn.cmd(`MAIL FROM:<${from.email}>`, 250, "MAIL FROM");
    for (const rcpt of to) await conn.cmd(`RCPT TO:<${rcpt.email}>`, [250, 251], "RCPT TO");
    await conn.cmd("DATA", 354);

    const domain = from.email.split("@")[1] || "localhost";
    const headers = [
      `From: ${formatAddress(from)}`,
      `To: ${to.map(formatAddress).join(", ")}`,
      `Subject: ${encodeHeader(mail.subject || "")}`,
      `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
      `Message-ID: <${crypto.randomUUID()}@${domain}>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: base64",
    ];
    if (mail.replyTo) headers.push(`Reply-To: ${formatAddress(parseAddress(mail.replyTo))}`);
    const body = wrap76(b64(String(mail.text || "").replace(/\r?\n/g, "\r\n")));
    await conn.cmd(`${headers.join("\r\n")}\r\n\r\n${body}.`, 250, "DATA");
    await conn.cmd("QUIT", [221, 250]).catch(() => {});
  } finally {
    conn.socket.end();
  }
}
