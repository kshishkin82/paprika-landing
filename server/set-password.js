// Смена пароля админки, который хранится в базе: npm run password -- <новый пароль>
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openDb, setSetting } from "./db.js";
import { hashPassword } from "./auth.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const password = process.argv[2];
if (!password || password.length < 8) {
  console.error("Использование: npm run password -- <новый пароль не короче 8 символов>");
  process.exit(1);
}
const db = openDb(process.env.DB_FILE || path.join(root, "data", "paprika.db"));
setSetting(db, "admin_password_hash", hashPassword(password));
db.prepare("DELETE FROM sessions").run();
console.log("Пароль обновлён, все активные сессии завершены.");
if (process.env.ADMIN_PASSWORD) console.log("Внимание: задан ADMIN_PASSWORD — пока он есть в окружении, используется он.");
