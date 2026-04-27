const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@gmail.com").toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "240426";
const REQUIRE_EMAIL_CONFIRMATION =
  String(process.env.REQUIRE_EMAIL_CONFIRMATION || "false") === "true";
const DB_PATH = path.join(__dirname, "data", "db.json");

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      users: [],
      interestLeads: [],
      questions: [],
      sessions: [],
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), "utf8");
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, "utf8");
  return JSON.parse(raw);
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), "utf8");
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, user) {
  const hash = crypto.scryptSync(password, user.passwordSalt, 64).toString("hex");
  return hash === user.passwordHash;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: !!user.isAdmin,
    emailConfirmed: !!user.emailConfirmed,
    createdAt: user.createdAt,
  };
}

function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function createMailer() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false") === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    return {
      enabled: false,
      async send() {
        return { accepted: [], rejected: [] };
      },
      from,
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });

  return {
    enabled: true,
    from,
    async send(options) {
      return transporter.sendMail(options);
    },
  };
}

const mailer = createMailer();

function ensureAdminUser() {
  const db = readDb();
  const existing = db.users.find((u) => u.email === ADMIN_EMAIL);
  const { hash, salt } = hashPassword(ADMIN_PASSWORD);
  if (existing) {
    existing.name = existing.name || "Администратор";
    existing.passwordHash = hash;
    existing.passwordSalt = salt;
    existing.emailConfirmed = true;
    existing.isAdmin = true;
    existing.updatedAt = new Date().toISOString();
  } else {
    db.users.push({
      id: Date.now(),
      name: "Администратор",
      email: ADMIN_EMAIL,
      passwordHash: hash,
      passwordSalt: salt,
      emailConfirmed: true,
      isAdmin: true,
      verifyToken: null,
      createdAt: new Date().toISOString(),
    });
  }
  writeDb(db);
}

function authRequired(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return res.status(401).json({ error: "Требуется авторизация." });

  const db = readDb();
  const session = db.sessions.find((s) => s.token === token);
  if (!session) return res.status(401).json({ error: "Сессия недействительна." });

  const user = db.users.find((u) => u.id === session.userId);
  if (!user) return res.status(401).json({ error: "Пользователь не найден." });

  req.user = user;
  req.db = db;
  req.session = session;
  next();
}

function adminRequired(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: "Только для администратора." });
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mailEnabled: mailer.enabled });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "Заполните имя, email и пароль." });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const db = readDb();
  if (db.users.some((u) => u.email === normalizedEmail)) {
    return res.status(409).json({ error: "Аккаунт с таким email уже существует." });
  }

  const { hash, salt } = hashPassword(String(password));
  const verifyToken = createToken();
  const user = {
    id: Date.now(),
    name: String(name).trim(),
    email: normalizedEmail,
    passwordHash: hash,
    passwordSalt: salt,
    emailConfirmed: !REQUIRE_EMAIL_CONFIRMATION,
    isAdmin: false,
    verifyToken,
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  writeDb(db);

  if (!REQUIRE_EMAIL_CONFIRMATION) {
    return res.status(201).json({
      ok: true,
      message: "Регистрация завершена. Можно сразу входить.",
    });
  }

  const confirmLink = `${APP_BASE_URL}/api/auth/confirm?token=${verifyToken}`;
  const mailSubject = "Подтверждение регистрации — Anna Knit Studio";
  const mailHtml = `
    <p>Здравствуйте, ${user.name}!</p>
    <p>Подтвердите ваш email, чтобы завершить регистрацию:</p>
    <p><a href="${confirmLink}">${confirmLink}</a></p>
  `;

  let confirmationMode = "email";
  try {
    await mailer.send({
      from: mailer.from,
      to: user.email,
      subject: mailSubject,
      html: mailHtml,
    });
  } catch (_error) {
    confirmationMode = "fallback";
  }

  if (!mailer.enabled) confirmationMode = "fallback";

  return res.status(201).json({
    ok: true,
    message:
      confirmationMode === "email"
        ? "Письмо с подтверждением отправлено на вашу почту."
        : "SMTP не настроен. Используйте тестовую ссылку подтверждения.",
    debugConfirmLink: confirmationMode === "fallback" ? confirmLink : undefined,
  });
});

app.get("/api/auth/confirm", (req, res) => {
  const token = String(req.query.token || "");
  if (!token) {
    return res.redirect("/index.html?verified=error");
  }

  const db = readDb();
  const user = db.users.find((u) => u.verifyToken === token);
  if (!user) return res.redirect("/index.html?verified=invalid");

  user.emailConfirmed = true;
  user.verifyToken = null;
  user.updatedAt = new Date().toISOString();
  writeDb(db);
  return res.redirect("/index.html?verified=ok");
});

app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const db = readDb();
  const user = db.users.find((u) => u.email === normalizedEmail);
  if (!user) return res.status(401).json({ error: "Неверный email или пароль." });
  if (!verifyPassword(String(password || ""), user)) {
    return res.status(401).json({ error: "Неверный email или пароль." });
  }
  if (REQUIRE_EMAIL_CONFIRMATION && !user.emailConfirmed) {
    return res.status(403).json({ error: "Сначала подтвердите email по ссылке в письме." });
  }

  const token = createToken();
  db.sessions.push({
    token,
    userId: user.id,
    createdAt: new Date().toISOString(),
  });
  writeDb(db);

  return res.json({
    ok: true,
    token,
    user: sanitizeUser(user),
  });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  if (!email) {
    return res.status(400).json({ error: "Укажите email." });
  }

  const db = readDb();
  const user = db.users.find((u) => u.email === email);
  const genericMessage = "Если аккаунт существует, мы отправили инструкцию по восстановлению.";
  if (!user) {
    return res.json({ ok: true, message: genericMessage });
  }

  const resetToken = createToken();
  user.resetTokenHash = hashToken(resetToken);
  user.resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  user.updatedAt = new Date().toISOString();
  writeDb(db);

  const resetLink = `${APP_BASE_URL}/index.html?resetToken=${encodeURIComponent(resetToken)}`;
  const mailSubject = "Восстановление пароля — Anna Knit Studio";
  const mailHtml = `
    <p>Здравствуйте, ${user.name || "пользователь"}!</p>
    <p>Чтобы сбросить пароль, откройте ссылку:</p>
    <p><a href="${resetLink}">${resetLink}</a></p>
    <p>Ссылка действует 1 час.</p>
  `;

  let emailSent = true;
  try {
    await mailer.send({
      from: mailer.from,
      to: user.email,
      subject: mailSubject,
      html: mailHtml,
    });
  } catch (_error) {
    emailSent = false;
  }

  if (!mailer.enabled) emailSent = false;

  return res.json({
    ok: true,
    message: genericMessage,
    debugResetLink: emailSent ? undefined : resetLink,
  });
});

app.post("/api/auth/reset-password", (req, res) => {
  const token = String(req.body?.token || "").trim();
  const newPassword = String(req.body?.newPassword || "");
  if (!token || !newPassword) {
    return res.status(400).json({ error: "Нужны token и новый пароль." });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Пароль должен быть не короче 6 символов." });
  }

  const db = readDb();
  const tokenHash = hashToken(token);
  const user = db.users.find((u) => u.resetTokenHash === tokenHash);
  if (!user || !user.resetTokenExpiresAt) {
    return res.status(400).json({ error: "Токен недействителен или истек." });
  }
  if (new Date(user.resetTokenExpiresAt).getTime() < Date.now()) {
    return res.status(400).json({ error: "Токен недействителен или истек." });
  }

  const { hash, salt } = hashPassword(newPassword);
  user.passwordHash = hash;
  user.passwordSalt = salt;
  user.emailConfirmed = true;
  user.resetTokenHash = null;
  user.resetTokenExpiresAt = null;
  user.updatedAt = new Date().toISOString();
  db.sessions = db.sessions.filter((s) => s.userId !== user.id);
  writeDb(db);

  return res.json({ ok: true, message: "Пароль успешно обновлен." });
});

app.post("/api/public/register-interest", (req, res) => {
  const { name, contact, email } = req.body || {};
  if (!name || !contact || !email) {
    return res.status(400).json({ error: "Заполните имя, контакт и email." });
  }
  const db = readDb();
  db.interestLeads.push({
    id: Date.now(),
    name: String(name).trim(),
    contact: String(contact).trim(),
    email: String(email).trim(),
    createdAt: new Date().toISOString(),
  });
  writeDb(db);
  return res.status(201).json({ ok: true });
});

app.post("/api/public/question", (req, res) => {
  const { name, contact, message } = req.body || {};
  if (!name || !contact || !message) {
    return res.status(400).json({ error: "Заполните все поля." });
  }
  const db = readDb();
  db.questions.push({
    id: Date.now(),
    name: String(name).trim(),
    contact: String(contact).trim(),
    message: String(message).trim(),
    createdAt: new Date().toISOString(),
  });
  writeDb(db);
  return res.status(201).json({ ok: true });
});

app.post("/api/questions", authRequired, (req, res) => {
  const { name, contact, message } = req.body || {};
  if (!name || !contact || !message) {
    return res.status(400).json({ error: "Заполните все поля." });
  }
  const db = req.db;
  db.questions.push({
    id: Date.now(),
    userId: req.user.id,
    name: String(name).trim(),
    contact: String(contact).trim(),
    message: String(message).trim(),
    replies: [],
    createdAt: new Date().toISOString(),
  });
  writeDb(db);
  return res.status(201).json({ ok: true });
});

app.get("/api/questions/my", authRequired, (req, res) => {
  const db = req.db;
  const list = db.questions
    .filter((item) => item.userId === req.user.id)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  return res.json({ ok: true, questions: list });
});

app.get("/api/admin/overview", authRequired, adminRequired, (req, res) => {
  const db = req.db;
  const users = db.users.map(sanitizeUser);
  const unansweredQuestionsCount = db.questions.filter(
    (question) => !Array.isArray(question.replies) || question.replies.length === 0
  ).length;
  res.json({
    ok: true,
    users,
    interestLeads: db.interestLeads,
    questions: db.questions,
    stats: {
      users: users.length,
      interestLeads: db.interestLeads.length,
      questions: unansweredQuestionsCount,
    },
  });
});

app.post("/api/admin/questions/:id/reply", authRequired, adminRequired, (req, res) => {
  const id = Number(req.params.id);
  const text = String(req.body?.text || "").trim();
  if (!Number.isFinite(id) || !text) {
    return res.status(400).json({ error: "Нужны id вопроса и текст ответа." });
  }
  const db = req.db;
  const question = db.questions.find((q) => Number(q.id) === id);
  if (!question) {
    return res.status(404).json({ error: "Вопрос не найден." });
  }
  if (!Array.isArray(question.replies)) question.replies = [];
  question.replies.push({
    from: "admin",
    text,
    createdAt: new Date().toISOString(),
  });
  writeDb(db);
  return res.json({ ok: true });
});

app.post("/api/auth/logout", authRequired, (req, res) => {
  const db = req.db;
  db.sessions = db.sessions.filter((session) => session.token !== req.session.token);
  writeDb(db);
  res.json({ ok: true });
});

ensureAdminUser();

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server started on ${APP_BASE_URL}`);
});
