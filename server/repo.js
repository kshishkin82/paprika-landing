import { transaction } from "./db.js";
import { HttpError, slugify, DATETIME_RE, DATE_RE, safeImageUrl } from "./util.js";

/* ---------- Валидация ---------- */

function str(value, field, { max = 200, required = false } = {}) {
  const s = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
  if (required && !s) throw new HttpError(400, `Заполните поле «${field}»`);
  if (s.length > max) throw new HttpError(400, `Поле «${field}» длиннее ${max} символов`);
  return s;
}

function image(value, field) {
  const s = str(value, field, { max: 500 });
  if (!s) return "";
  const safe = safeImageUrl(s);
  if (!safe) throw new HttpError(400, `Некорректная ссылка на фото («${field}»)`);
  return safe;
}

const bool = (v) => (v === true || v === 1 || v === "1" || v === "on" ? 1 : 0);
const id = (v) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(400, "Некорректный id");
  return n;
};

export const ORDER_KINDS = {
  master_class: "Мастер-класс",
  event: "Корпоратив / праздник",
  certificate: "Подарочный сертификат",
  other: "Другое",
};
export const ORDER_STATUSES = {
  new: "Новая",
  in_progress: "В работе",
  done: "Выполнена",
  cancelled: "Отменена",
};

const GALLERY_COLS = "id, url, caption, description, published, sort";
const galleryRow = (r) => (r ? { ...r, published: Boolean(r.published) } : r);

export function createRepo(db) {
  const plain = (row) => (row ? { ...row } : row);
  const photosOf = (mcId) =>
    db.prepare("SELECT url FROM master_class_photos WHERE master_class_id = ? ORDER BY sort, id").all(mcId).map((r) => r.url);
  const withPhotos = (row) => {
    if (!row) return null;
    const photos = photosOf(row.id);
    return { ...row, published: Boolean(row.published), show_on_home: Boolean(row.show_on_home), photos, cover: photos[0] || "" };
  };

  function uniqueSlug(base, exceptId) {
    let slug = base;
    for (let i = 2; db.prepare("SELECT 1 FROM master_classes WHERE slug = ? AND id != ?").get(slug, exceptId ?? 0); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }

  return {
    /* ---------- Мастер-классы ---------- */
    listMasterClasses({ publishedOnly = false } = {}) {
      const where = publishedOnly ? "WHERE published = 1" : "";
      return db
        .prepare(
          `SELECT * FROM master_classes ${where}
           ORDER BY sort, id`
        )
        .all()
        .map(withPhotos);
    },

    upcomingMasterClasses(now, limit) {
      return db
        .prepare(
          `SELECT * FROM master_classes
           WHERE published = 1 AND next_date IS NOT NULL AND next_date >= ?
           ORDER BY sort, id LIMIT ?`
        )
        .all(now, limit)
        .map(withPhotos);
    },

    /** Для главной: отмеченные «Выводить на главной», опубликованные, без прошедшей даты. */
    homeMasterClasses(now) {
      return db
        .prepare(
          `SELECT * FROM master_classes
           WHERE published = 1 AND show_on_home = 1 AND (next_date IS NULL OR next_date >= ?)
           ORDER BY sort, id`
        )
        .all(now)
        .map(withPhotos);
    },

    getMasterClass(mcId) {
      return withPhotos(db.prepare("SELECT * FROM master_classes WHERE id = ?").get(id(mcId)));
    },

    getMasterClassBySlug(slug) {
      return withPhotos(db.prepare("SELECT * FROM master_classes WHERE slug = ? AND published = 1").get(String(slug)));
    },

    saveMasterClass(input, mcId = null) {
      const title = str(input.title, "Название", { required: true, max: 150 });
      const description = str(input.description_md, "Описание", { max: 20000 });
      const nextDate = str(input.next_date, "Дата", { max: 16 }) || null;
      if (nextDate && !DATETIME_RE.test(nextDate)) throw new HttpError(400, "Дата должна быть в формате ГГГГ-ММ-ДДTЧЧ:ММ");
      const photos = (Array.isArray(input.photos) ? input.photos : []).slice(0, 30).map((p) => image(p, "Галерея")).filter(Boolean);
      const slug = uniqueSlug(slugify(str(input.slug, "Адрес", { max: 80 }) || title), mcId);
      const published = bool(input.published ?? 1);
      const showOnHome = bool(input.show_on_home ?? 0);
      const removed = [];

      const savedId = transaction(db, () => {
        let rowId = mcId;
        if (rowId) {
          const res = db
            .prepare(
              `UPDATE master_classes SET title = ?, slug = ?, description_md = ?, next_date = ?, published = ?,
               show_on_home = ?, updated_at = datetime('now') WHERE id = ?`
            )
            .run(title, slug, description, nextDate, published, showOnHome, rowId);
          if (!res.changes) throw new HttpError(404, "Мастер-класс не найден");
          removed.push(...photosOf(rowId).filter((u) => !photos.includes(u)));
          db.prepare("DELETE FROM master_class_photos WHERE master_class_id = ?").run(rowId);
        } else {
          rowId = Number(
            db
              .prepare(
                `INSERT INTO master_classes (title, slug, description_md, next_date, published, show_on_home, sort)
                 VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort), -1) + 1 FROM master_classes))`
              )
              .run(title, slug, description, nextDate, published, showOnHome).lastInsertRowid
          );
        }
        const ins = db.prepare("INSERT INTO master_class_photos (master_class_id, url, sort) VALUES (?, ?, ?)");
        photos.forEach((url, i) => ins.run(rowId, url, i));
        return rowId;
      });
      return { item: this.getMasterClass(savedId), removed };
    },

    reorderMasterClasses(ids) {
      if (!Array.isArray(ids)) throw new HttpError(400, "Ожидается список id");
      const upd = db.prepare("UPDATE master_classes SET sort = ? WHERE id = ?");
      transaction(db, () => ids.forEach((mcId, i) => upd.run(i, id(mcId))));
    },

    deleteMasterClass(mcId) {
      const photos = photosOf(id(mcId));
      const res = db.prepare("DELETE FROM master_classes WHERE id = ?").run(id(mcId));
      if (!res.changes) throw new HttpError(404, "Мастер-класс не найден");
      return photos;
    },

    /* ---------- Галерея ---------- */
    listGallery({ publishedOnly = false } = {}) {
      const where = publishedOnly ? "WHERE published = 1" : "";
      return db.prepare(`SELECT ${GALLERY_COLS} FROM gallery_photos ${where} ORDER BY sort, id`).all().map(galleryRow);
    },

    addGalleryPhoto(input) {
      const url = image(input.url, "Фото");
      if (!url) throw new HttpError(400, "Нет фото");
      const caption = str(input.caption, "Подпись", { max: 200 });
      const description = str(input.description, "Описание", { max: 1000 });
      const sort = db.prepare("SELECT COALESCE(MAX(sort), -1) + 1 AS s FROM gallery_photos").get().s;
      const rowId = db
        .prepare("INSERT INTO gallery_photos (url, caption, description, published, sort) VALUES (?, ?, ?, ?, ?)")
        .run(url, caption, description, bool(input.published ?? 1), sort).lastInsertRowid;
      return galleryRow(db.prepare(`SELECT ${GALLERY_COLS} FROM gallery_photos WHERE id = ?`).get(rowId));
    },

    updateGalleryPhoto(photoId, input) {
      const current = db.prepare(`SELECT ${GALLERY_COLS} FROM gallery_photos WHERE id = ?`).get(id(photoId));
      if (!current) throw new HttpError(404, "Фото не найдено");
      const caption = input.caption !== undefined ? str(input.caption, "Подпись", { max: 200 }) : current.caption;
      const description = input.description !== undefined ? str(input.description, "Описание", { max: 1000 }) : current.description;
      const published = input.published !== undefined ? bool(input.published) : current.published;
      db.prepare("UPDATE gallery_photos SET caption = ?, description = ?, published = ? WHERE id = ?").run(caption, description, published, id(photoId));
      return galleryRow(db.prepare(`SELECT ${GALLERY_COLS} FROM gallery_photos WHERE id = ?`).get(id(photoId)));
    },

    reorderGallery(ids) {
      if (!Array.isArray(ids)) throw new HttpError(400, "Ожидается список id");
      const upd = db.prepare("UPDATE gallery_photos SET sort = ? WHERE id = ?");
      transaction(db, () => ids.forEach((pid, i) => upd.run(i, id(pid))));
    },

    deleteGalleryPhoto(photoId) {
      const row = db.prepare("SELECT url FROM gallery_photos WHERE id = ?").get(id(photoId));
      if (!row) throw new HttpError(404, "Фото не найдено");
      db.prepare("DELETE FROM gallery_photos WHERE id = ?").run(id(photoId));
      return row.url;
    },

    /* ---------- Отзывы ---------- */
    listReviews({ publishedOnly = false } = {}) {
      const where = publishedOnly ? "WHERE published = 1" : "";
      return db
        .prepare(`SELECT * FROM reviews ${where} ORDER BY date DESC, id DESC`)
        .all()
        .map((r) => ({ ...r, published: Boolean(r.published) }));
    },

    getReview(reviewId) {
      const r = db.prepare("SELECT * FROM reviews WHERE id = ?").get(id(reviewId));
      return r ? { ...r, published: Boolean(r.published) } : null;
    },

    saveReview(input, reviewId = null) {
      const author = str(input.author, "Имя", { required: true, max: 80 });
      const photo = image(input.photo, "Фото автора");
      const date = str(input.date, "Дата", { required: true, max: 10 });
      if (!DATE_RE.test(date)) throw new HttpError(400, "Дата должна быть в формате ГГГГ-ММ-ДД");
      const text = str(input.text, "Отзыв", { required: true, max: 3000 });
      const published = bool(input.published ?? 1);
      let oldPhoto = null;
      if (reviewId) {
        const old = this.getReview(reviewId);
        if (!old) throw new HttpError(404, "Отзыв не найден");
        oldPhoto = old.photo !== photo ? old.photo : null;
        db.prepare("UPDATE reviews SET author = ?, photo = ?, date = ?, text = ?, published = ? WHERE id = ?").run(
          author, photo, date, text, published, id(reviewId)
        );
      } else {
        reviewId = Number(
          db.prepare("INSERT INTO reviews (author, photo, date, text, published) VALUES (?, ?, ?, ?, ?)").run(author, photo, date, text, published)
            .lastInsertRowid
        );
      }
      return { item: this.getReview(reviewId), removed: oldPhoto ? [oldPhoto] : [] };
    },

    deleteReview(reviewId) {
      const old = this.getReview(reviewId);
      if (!old) throw new HttpError(404, "Отзыв не найден");
      db.prepare("DELETE FROM reviews WHERE id = ?").run(id(reviewId));
      return old.photo;
    },

    /* ---------- Заявки ---------- */
    listOrders(status) {
      const rows = status && ORDER_STATUSES[status]
        ? db.prepare("SELECT * FROM orders WHERE status = ? ORDER BY id DESC").all(status)
        : db.prepare("SELECT * FROM orders ORDER BY id DESC").all();
      return rows.map(plain);
    },

    orderCounts() {
      const counts = { all: 0, new: 0, in_progress: 0, done: 0, cancelled: 0 };
      for (const r of db.prepare("SELECT status, COUNT(*) AS n FROM orders GROUP BY status").all()) {
        counts[r.status] = r.n;
        counts.all += r.n;
      }
      return counts;
    },

    createOrder(input) {
      const name = str(input.name, "Имя", { required: true, max: 100 });
      const phone = str(input.phone, "Телефон", { required: true, max: 30 });
      if ((phone.match(/\d/g) || []).length < 6 || !/^[\d\s()+\-.]+$/.test(phone)) {
        throw new HttpError(400, "Проверьте номер телефона");
      }
      const kind = ORDER_KINDS[input.kind] ? input.kind : "other";
      const comment = str(input.comment, "Комментарий", { max: 1000 });
      let guests = input.guests === "" || input.guests == null ? null : Number(input.guests);
      if (guests !== null && (!Number.isInteger(guests) || guests < 1 || guests > 200)) guests = null;
      let mcId = null;
      let mcTitle = "";
      if (kind === "master_class" && input.master_class_id) {
        const mc = db.prepare("SELECT id, title, next_date FROM master_classes WHERE id = ? AND published = 1").get(Number(input.master_class_id));
        if (mc) {
          mcId = mc.id;
          mcTitle = mc.title;
        }
      }
      const rowId = db
        .prepare("INSERT INTO orders (name, phone, kind, master_class_id, master_class_title, guests, comment) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .run(name, phone, kind, mcId, mcTitle, guests, comment).lastInsertRowid;
      return plain(db.prepare("SELECT * FROM orders WHERE id = ?").get(rowId));
    },

    updateOrder(orderId, input) {
      const current = db.prepare("SELECT * FROM orders WHERE id = ?").get(id(orderId));
      if (!current) throw new HttpError(404, "Заявка не найдена");
      const status = input.status !== undefined ? input.status : current.status;
      if (!ORDER_STATUSES[status]) throw new HttpError(400, "Неизвестный статус");
      const note = input.admin_note !== undefined ? str(input.admin_note, "Заметка", { max: 2000 }) : current.admin_note;
      db.prepare("UPDATE orders SET status = ?, admin_note = ? WHERE id = ?").run(status, note, id(orderId));
      return plain(db.prepare("SELECT * FROM orders WHERE id = ?").get(id(orderId)));
    },

    deleteOrder(orderId) {
      const res = db.prepare("DELETE FROM orders WHERE id = ?").run(id(orderId));
      if (!res.changes) throw new HttpError(404, "Заявка не найдена");
    },
  };
}
