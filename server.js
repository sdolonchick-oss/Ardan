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
  fs.mkdirSync(UP, { recursive: true });
}

if (!fs.existsSync(DATA)) {
  fs.writeFileSync(
    DATA,
    JSON.stringify({ videos: [] }, null, 2)
  );
}

const load = () => JSON.parse(fs.readFileSync(DATA, "utf8"));

const save = (data) =>
  fs.writeFileSync(DATA, JSON.stringify(data, null, 2));

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
app.use(express.static(path.join(__dirname, "public")));

// ВАЖНО: видео отдаём через Range,
// чтобы браузер мог нормально загружать его частями.
app.get("/uploads/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(UP, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("Видео не найдено");
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;

  const range = req.headers.range;

  if (!range) {
    res.writeHead(200, {
      "Content-Length": fileSize,
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=31536000"
    });

    return fs.createReadStream(filePath).pipe(res);
  }

  const parts = range.replace(/bytes=/, "").split("-");
  const start = parseInt(parts[0], 10);
  const end = parts[1]
    ? parseInt(parts[1], 10)
    : fileSize - 1;

  if (start >= fileSize || end >= fileSize) {
    res.status(416).set({
      "Content-Range": `bytes */${fileSize}`
    });
    return res.end();
  }

  const chunkSize = end - start + 1;

  res.writeHead(206, {
    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
    "Accept-Ranges": "bytes",
    "Content-Length": chunkSize,
    "Content-Type": "video/mp4",
    "Cache-Control": "public, max-age=31536000"
  });

  fs.createReadStream(filePath, {
    start,
    end
  }).pipe(res);
});

const sessions = new Set();

app.post("/api/login", (req, res) => {
  if (req.body.password === OPERATOR_PASSWORD) {
    const token =
      Math.random().toString(36).slice(2) + Date.now();

    sessions.add(token);

    return res.json({ token });
  }

  res.status(401).json({
    error: "Неверный пароль"
  });
});

const auth = (req, res, next) => {
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
};

app.get("/api/videos", (req, res) => {
  res.json(load().videos);
});

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

app.delete("/api/videos/:id", auth, (req, res) => {
  const data = load();

  const video = data.videos.find(
    (x) => x.id === req.params.id
  );

  if (video) {
    try {
      fs.unlinkSync(
        path.join(UP, path.basename(video.file))
      );
    } catch {}

    data.videos = data.videos.filter(
      (x) => x.id !== req.params.id
    );

    save(data);
  }

  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log("Ardan running on port " + PORT);
});
