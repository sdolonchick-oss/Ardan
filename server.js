const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// Пароль оператора
const OPERATOR_PASSWORD =
  process.env.OPERATOR_PASSWORD || "ardan";

// Папки и файл данных
const DATA = path.join(__dirname, "data.json");
const UPLOADS = path.join(__dirname, "uploads");

// Создаём uploads
if (!fs.existsSync(UPLOADS)) {
  fs.mkdirSync(UPLOADS, { recursive: true });
}

// Создаём data.json
if (!fs.existsSync(DATA)) {
  fs.writeFileSync(
    DATA,
    JSON.stringify({ videos: [] }, null, 2)
  );
}

// Работа с данными
function loadData() {
  return JSON.parse(
    fs.readFileSync(DATA, "utf8")
  );
}

function saveData(data) {
  fs.writeFileSync(
    DATA,
    JSON.stringify(data, null, 2)
  );
}

// Загрузка видео
const upload = multer({
  dest: UPLOADS,
  limits: {
    fileSize: 500 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("video/")) {
      cb(null, true);
    } else {
      cb(new Error("Можно загружать только видео"));
    }
  }
});

// ВАЖНО:
// index.html находится в корне репозитория
app.use(express.json());
app.use(express.static(__dirname));

// Видео доступны всем
app.use(
  "/uploads",
  express.static(UPLOADS)
);

// Сессии операторов
const sessions = new Set();

// Вход оператора
app.post("/api/login", (req, res) => {
  if (req.body.password === OPERATOR_PASSWORD) {
    const token =
      Math.random().toString(36).slice(2) +
      Date.now().toString(36);

    sessions.add(token);

    return res.json({
      ok: true,
      token: token
    });
  }

  res.status(401).json({
    ok: false,
    error: "Неверный пароль"
  });
});

// Проверка оператора
function auth(req, res, next) {
  const header =
    req.headers.authorization || "";

  const token =
    header.replace("Bearer ", "");

  if (!sessions.has(token)) {
    return res.status(401).json({
      error: "Только оператор"
    });
  }

  next();
}

// Получить все видео
// Доступно всем посетителям
app.get("/api/videos", (req, res) => {
  const data = loadData();

  res.json(data.videos);
});

// Добавить видео
// Только оператор
app.post(
  "/api/videos",
  auth,
  upload.single("video"),
  (req, res) => {

    if (!req.file) {
      return res.status(400).json({
        error: "Видео не загружено"
      });
    }

    const data = loadData();

    const video = {
      id: Date.now().toString(),
      title:
        req.body.title ||
        "Без названия",
      hashtags:
        req.body.hashtags ||
        "",
      file:
        "/uploads/" +
        req.file.filename
    };

    data.videos.unshift(video);

    saveData(data);

    res.json(video);
  }
);

// Удалить видео
// Только оператор
app.delete(
  "/api/videos/:id",
  auth,
  (req, res) => {

    const data = loadData();

    const video = data.videos.find(
      v => v.id === req.params.id
    );

    if (video) {
      try {
        fs.unlinkSync(
          path.join(
            UPLOADS,
            path.basename(video.file)
          )
        );
      } catch (e) {}

      data.videos =
        data.videos.filter(
          v => v.id !== req.params.id
        );

      saveData(data);
    }

    res.json({
      ok: true
    });
  }
);

// Запуск сервера
app.listen(PORT, () => {
  console.log(
    "Ardan running on port " + PORT
  );
});
