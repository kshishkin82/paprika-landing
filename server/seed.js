// Стартовые данные — то, что раньше было зашито в index.html. Заливаются один раз в пустую базу.
import { getSetting, setSetting } from "./db.js";

export function seed(db, repo, log = console.log) {
  if (getSetting(db, "seeded")) return;
  const empty =
    !db.prepare("SELECT 1 FROM master_classes LIMIT 1").get() &&
    !db.prepare("SELECT 1 FROM reviews LIMIT 1").get() &&
    !db.prepare("SELECT 1 FROM gallery_photos LIMIT 1").get();
  if (empty) {
    const year = new Date().getFullYear() + 1;
    const mcs = [
      {
        title: "Масленица Party",
        next_date: `${year}-03-20T18:00`,
        photos: ["http://5.188.31.156/wp-content/uploads/2026/03/russkaya-768x512.jpeg"],
        description_md:
          "Весёлый вечер русской кухни: **блины** с разными начинками, домашние соусы и чай из самовара.\n\n" +
          "## Что приготовим\n\n- Тонкие блины на молоке\n- Блины с икрой и сметаной\n- Сладкие начинки\n\n" +
          "Продолжительность — около *3 часов*. Все продукты и фартуки — наши.",
      },
      {
        title: "Итальянская кухня",
        next_date: `${year}-02-05T18:00`,
        photos: ["http://5.188.31.156/wp-content/uploads/2026/02/5-1.jpg"],
        description_md: "Готовим свежую пасту руками, соус к ней и классический десерт.\n\n- Паста\n- Соус\n- Тирамису",
      },
      {
        title: "Наслаждение",
        next_date: `${year}-03-19T15:00`,
        photos: ["http://5.188.31.156/wp-content/uploads/2026/03/index-slider-2-768x409.jpg"],
        description_md: "Авторский гастрономический вечер от шефа студии.",
      },
    ];
    for (const mc of mcs) repo.saveMasterClass({ ...mc, published: true, show_on_home: true });

    const reviews = [
      { author: "Алина Ш.", photo: "https://i.pravatar.cc/160?img=5", date: "2025-03-15", text: "Очень уютная атмосфера и понятная подача. За один вечер приготовили 3 блюда и сразу повторили дома." },
      { author: "Михаил К.", photo: "https://i.pravatar.cc/160?img=12", date: "2025-02-10", text: "Пришли компанией на корпоратив. Все вовлечены, много практики, и в итоге реально вкусный ужин." },
      { author: "Екатерина Л.", photo: "https://i.pravatar.cc/160?img=20", date: "2025-01-20", text: "Понравилось, что шеф объясняет без сложных терминов. Наконец-то разобралась с соусами и временем жарки." },
    ];
    for (const r of reviews) repo.saveReview({ ...r, published: true });

    for (const name of ["9-6", "7-7", "1-8", "6-7", "3-7", "4-9", "2-6", "10-6", "8-7", "5-8"]) {
      repo.addGalleryPhoto({ url: `http://5.188.31.156/wp-content/uploads/2026/03/${name}.jpg`, caption: "Мастер-класс «Марракеш»" });
    }
    log("База заполнена стартовыми данными с лендинга.");
  }
  setSetting(db, "seeded", "1");
}
