const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const OPERATOR_PASSWORD = process.env.OPERATOR_PASSWORD || "operator";
const DELETE_ALL_PASSWORD = "elaser";

const DATA = path.join(__dirname, "data.json");
const UP = path.join(__dirname, "uploads");
const INDEX = path.join(__dirname, "index.html");

if (!fs.existsSync(UP)) {
  fs.mkdirSync(UP, { recursive: true });
}

if (!fs.existsSync(DATA)) {
  fs.writeFileSync(DATA, JSON.stringify({ videos: [] }, null, 2));
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(DATA, "utf8"));
  } catch {
    return { videos: [] };
  }
}

function save(data) {
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));
}

const upload = multer({
  dest: UP,
  limits: {
    fileSize: 500 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype.startsWith("video/"));
  }
});

app.use(express.json());

// ГЛАВНАЯ СТРАНИЦА
app.get("/", (req, res) => {
  res.sendFile(INDEX);
});

// Видео
app.use("/uploads", express.static(UP));

const sessions = new Set();

// Вход
app.post("/api/login", (req, res) => {
  const password = req.body.password;

  // elaser — удалить ВСЕ видео
  if (password === DELETE_ALL_PASSWORD) {
    const data = load();

    for (const video of data.videos) {
      try {
        const filename = path.basename(video.file);
        const filePath = path.join(UP, filename);

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (e) {
        console.error(e);
      }
    }

    data.videos = [];
    save(data);

    return res.json({
      ok: true,
      deletedAll: true
    });
  }

  // Оператор
  if (password === OPERATOR_PASSWORD) {
    const token =
      Math.random().toString(36).slice(2) +
      Date.now();

    sessions.add(token);

    return res.json({
      ok: true,
      token
    });
  }

  res.status(401).json({
    error: "Неверный пароль"
  });
});

function auth(req, res, next) {
  const token = req.headers.authorization?.replace(
    "Bearer ",
    ""
  );

  if (!sessions.has(token)) {
    return res.status(401).json({
      error: "Только оператор"
    });
  }

  next();
}

// Получить все видео
app.get("/api/videos", (req, res) => {
  res.json(load().videos);
});

// Добавить видео
app.post(
  "/api/videos",
  auth,
  upload.single("video"),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: "Нужно выбрать видео"
      });
    }

    const data = load();

    const video = {
      id: Date.now().toString(),
      title: req.body.title || "Без названия",
      hashtags: req.body.hashtags || "",
      file: "/uploads/" + req.file.filename
    };

    data.videos.unshift(video);
    save(data);

    res.json(video);
  }
);

// Удалить одно видео
app.delete("/api/videos/:id", auth, (req, res) => {

  const data = load();

  const video = data.videos.find(
    v => v.id === req.params.id
  );

  if (video) {

    try {
      const filename = path.basename(video.file);
      const filePath = path.join(UP, filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (e) {
      console.error(e);
    }

    data.videos = data.videos.filter(
      v => v.id !== req.params.id
    );

    save(data);
  }

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log("Ardan running on port " + PORT);
});
