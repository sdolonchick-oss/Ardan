const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

const PORT = process.env.PORT || 3000;
const OPERATOR_PASSWORD =
  process.env.OPERATOR_PASSWORD || "change-me";

const DATA = path.join(__dirname, "data.json");
const UP = path.join(__dirname, "uploads");

if (!fs.existsSync(UP)) {
  fs.mkdirSync(UP);
}

if (!fs.existsSync(DATA)) {
  fs.writeFileSync(
    DATA,
    JSON.stringify({ videos: [] }, null, 2)
  );
}

const load = () =>
  JSON.parse(fs.readFileSync(DATA));

const save = (x) =>
  fs.writeFileSync(
    DATA,
    JSON.stringify(x, null, 2)
  );

const upload = multer({
  dest: UP,
  limits: {
    fileSize: 500 * 1024 * 1024
  },
  fileFilter: (req, file, cb) =>
    cb(null, file.mimetype.startsWith("video/"))
});

app.use(express.json());

/* Главная страница */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

/* Статические файлы */
app.use(express.static(path.join(__dirname, "public")));

app.use(
  "/uploads",
  express.static(UP)
);

const sessions = new Set();

/* Вход оператора */
app.post("/api/login", (req, res) => {
  if (req.body.password === OPERATOR_PASSWORD) {
    const token =
      Math.random().toString(36).slice(2) +
      Date.now();

    sessions.add(token);

    return res.json({
      token: token
    });
  }

  res.status(401).json({
    error: "Неверный пароль"
  });
});

/* Проверка оператора */
const auth = (req, res, next) => {
  const token =
    req.headers.authorization?.replace(
      "Bearer ",
      ""
    );

  if (!sessions.has(token)) {
    return res.status(401).json({
      error: "Только оператор"
    });
  }

  next();
};

/* Получить видео */
app.get("/api/videos", (req, res) => {
  res.json(load().videos);
});

/* Загрузить видео */
app.post(
  "/api/videos",
  auth,
  upload.single("video"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "Нужно видео"
      });
    }

    let d = load();

    let v = {
      id: Date.now().toString(),
      title: req.body.title || "Без названия",
      hashtags: req.body.hashtags || "",
      file: "/uploads/" + req.file.filename
    };

    d.videos.unshift(v);

    save(d);

    res.json(v);
  }
);

/* Удалить видео */
app.delete(
  "/api/videos/:id",
  auth,
  (req, res) => {
    let d = load();

    let v = d.videos.find(
      x => x.id === req.params.id
    );

    if (v) {
      try {
        fs.unlinkSync(
          path.join(
            UP,
            path.basename(v.file)
          )
        );
      } catch {}

      d.videos = d.videos.filter(
        x => x.id !== req.params.id
      );

      save(d);
    }

    res.json({
      ok: true
    });
  }
);

app.listen(PORT, () => {
  console.log(
    "Ardan running on " + PORT
  );
});
