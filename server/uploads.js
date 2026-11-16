import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { HttpError } from "./util.js";

export const MAX_UPLOAD = 15 * 1024 * 1024;

/** Определяем тип по сигнатуре файла, а не по заголовку клиента. */
function detectImage(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (buf.toString("ascii", 0, 4) === "GIF8") return "gif";
  return null;
}

export function saveUpload(uploadsDir, buf) {
  const ext = detectImage(buf);
  if (!ext) throw new HttpError(415, "Можно загружать только JPG, PNG, WebP или GIF");
  const now = new Date();
  const sub = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = path.join(uploadsDir, sub);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${crypto.randomBytes(10).toString("hex")}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf);
  return `/uploads/${sub}/${name}`;
}

/** Удаляет файл загрузки, если на него больше нигде не ссылаются. */
export function removeUploadIfUnused(db, uploadsDir, url) {
  if (typeof url !== "string" || !/^\/uploads\/[\w\-./]+$/.test(url)) return;
  const used =
    db.prepare("SELECT 1 FROM master_class_photos WHERE url = ? LIMIT 1").get(url) ||
    db.prepare("SELECT 1 FROM gallery_photos WHERE url = ? LIMIT 1").get(url) ||
    db.prepare("SELECT 1 FROM reviews WHERE photo = ? LIMIT 1").get(url);
  if (used) return;
  const full = path.resolve(uploadsDir, "." + url.slice("/uploads".length));
  if (!full.startsWith(path.resolve(uploadsDir) + path.sep)) return;
  fs.rm(full, { force: true }, () => {});
}
