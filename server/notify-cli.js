// Диагностика уведомлений.
//   npm run notify:test — отправить тестовое сообщение во все настроенные каналы
//   npm run notify:ids  — показать ID чатов/пользователей, которые видит бот (чтобы заполнить .env)
import { createNotifier, orderText } from "./notify.js";

const env = process.env;
const notifier = createNotifier(env);
const cmd = process.argv[2];
const mask = (t) => (t ? `${t.slice(0, 4)}…${t.slice(-3)}` : "не задан");

async function test() {
  console.log(`Telegram: токен ${mask(env.TELEGRAM_BOT_TOKEN)}, чат ${env.TELEGRAM_CHAT_ID || "не задан"}`);
  console.log(`Почта:    ${env.SMTP_HOST ? `${env.SMTP_HOST}:${env.SMTP_PORT || 465}, логин ${env.SMTP_USER || "—"}` : "SMTP_HOST не задан"} → ${env.MAIL_TO || "MAIL_TO не задан"}`);
  console.log(`MAX:      токен ${mask(env.MAX_BOT_TOKEN)}, ${env.MAX_CHAT_ID ? `chat_id ${env.MAX_CHAT_ID}` : env.MAX_USER_ID ? `user_id ${env.MAX_USER_ID}` : "получатель не задан"}`);
  if (!notifier.channels.length) {
    console.log("\nНи один канал не настроен — заполните переменные в .env (см. .env.example).");
    process.exitCode = 1;
    return;
  }
  const text = `🧪 Тестовое сообщение от сайта Paprika Studio\n\n${orderText(
    { kind: "master_class", master_class_title: "Palermo", name: "Тест", phone: "+7 900 000-00-00", guests: 2, comment: "Проверка уведомлений" },
    env.SITE_URL
  )}`;
  const results = await notifier.sendText(text, "Тест уведомлений с сайта Paprika Studio");
  console.log("");
  for (const r of results) console.log(`${r.ok ? "✅" : "❌"} ${r.channel}${r.ok ? ": отправлено" : `: ${r.error}`}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

async function ids() {
  if (env.TELEGRAM_BOT_TOKEN) {
    console.log("— Telegram (последние сообщения боту):");
    try {
      const res = await notifier.telegramUpdates();
      const chats = new Map();
      for (const u of res.json?.result || []) {
        const chat = (u.message || u.channel_post || u.my_chat_member)?.chat;
        if (chat) chats.set(chat.id, `${chat.type}: ${chat.title || [chat.first_name, chat.last_name].filter(Boolean).join(" ") || chat.username}`);
      }
      if (!res.json?.ok) console.log(`  ошибка: ${res.json?.description || res.status}`);
      else if (!chats.size) console.log("  пусто — напишите боту (или в группу с ботом) любое сообщение и повторите");
      for (const [id, name] of chats) console.log(`  TELEGRAM_CHAT_ID=${id}   (${name})`);
    } catch (err) {
      console.log(`  ошибка: ${err.message}`);
    }
  } else console.log("— Telegram: TELEGRAM_BOT_TOKEN не задан");

  if (env.MAX_BOT_TOKEN) {
    console.log("— MAX:");
    try {
      const me = await notifier.maxRequest("/me");
      if (me.status !== 200) throw new Error(`MAX ответил ${me.status}: ${me.json?.message || me.raw.slice(0, 120)}`);
      console.log(`  бот: ${me.json.name || me.json.first_name || ""} (@${me.json.username || "?"}), id ${me.json.user_id}`);
      const chats = await notifier.maxRequest("/chats?count=50");
      for (const c of chats.json?.chats || []) console.log(`  MAX_CHAT_ID=${c.chat_id}   (${c.type}: ${c.title || "без названия"})`);
      const upd = await notifier.maxRequest("/updates?limit=100&timeout=0");
      const users = new Map();
      for (const u of upd.json?.updates || []) {
        const s = u.message?.sender || u.user;
        if (s?.user_id) users.set(s.user_id, s.name || [s.first_name, s.last_name].filter(Boolean).join(" ") || s.username || "");
      }
      for (const [id, name] of users) console.log(`  MAX_USER_ID=${id}   (${name})`);
      if (!(chats.json?.chats || []).length && !users.size) {
        console.log("  пусто — добавьте бота в групповой чат или напишите ему в личку и повторите");
      }
    } catch (err) {
      console.log(`  ошибка: ${err.code ? "сертификат/сеть: " + err.code : err.message}`);
    }
  } else console.log("— MAX: MAX_BOT_TOKEN не задан");
}

if (cmd === "test") await test();
else if (cmd === "ids") await ids();
else console.log("Использование: npm run notify:test | npm run notify:ids");
