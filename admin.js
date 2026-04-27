const PUBLIC_SESSION_KEY = "anna_public_session";
const API_BASE = "";

const loginView = document.getElementById("login-view");
const panelView = document.getElementById("panel-view");
const loginForm = document.getElementById("login-form");
const loginMessage = document.getElementById("login-message");
const logoutBtn = document.getElementById("logout-btn");
const usersCount = document.getElementById("users-count");
const questionsCount = document.getElementById("questions-count");
const usersList = document.getElementById("users-list");
const questionsList = document.getElementById("questions-list");
const replyModal = document.getElementById("reply-modal");
const replyModalInput = document.getElementById("reply-modal-input");
const replyModalSendBtn = document.getElementById("reply-modal-send-btn");
const replyModalCloseBtn = document.getElementById("reply-modal-close-btn");
let activeReplyQuestionId = null;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSession() {
  const raw = localStorage.getItem(PUBLIC_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(payload) {
  localStorage.setItem(PUBLIC_SESSION_KEY, JSON.stringify(payload));
}

function clearSession() {
  localStorage.removeItem(PUBLIC_SESSION_KEY);
}

async function apiRequest(path, options = {}) {
  const session = getSession();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    throw new Error(payload.error || "Ошибка запроса.");
  }
  return payload;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU");
}

function renderReplies(replies) {
  if (!Array.isArray(replies) || !replies.length) {
    return '<p class="reply-history-empty">Ответов пока нет.</p>';
  }
  return replies
    .map(
      (reply) => `
        <div class="reply-history-item">
          <p><strong>Анна:</strong> ${escapeHtml(reply.text || "-")}</p>
          <small>${formatDate(reply.createdAt)}</small>
        </div>
      `
    )
    .join("");
}

function renderList(target, items, renderer, emptyText) {
  if (!target) return;
  if (!items.length) {
    target.innerHTML = `<p>${emptyText}</p>`;
    return;
  }
  target.innerHTML = items.slice().reverse().map(renderer).join("");
}

async function loadOverview() {
  const result = await apiRequest("/api/admin/overview");
  const users = result.users || [];
  const leads = result.interestLeads || [];
  const questions = result.questions || [];

  if (usersCount) usersCount.textContent = String(result.stats?.users ?? users.length);
  if (questionsCount) {
    const questionsValue = Number(result.stats?.questions ?? questions.length);
    questionsCount.textContent = String(questionsValue);
  }

  renderList(
    usersList,
    users,
    (user) => `
      <article class="item">
        <p><strong>${user.name || "Без имени"}</strong></p>
        <p>Email: ${user.email || "-"}</p>
        <p>Роль: ${user.isAdmin ? "Администратор" : "Пользователь"}</p>
        <small>${formatDate(user.createdAt)}</small>
      </article>
    `,
    "Пока нет пользователей."
  );

  const merged = [
    ...leads.map((item) => ({
      sourceType: "lead",
      id: item.id,
      title: "Регистрация",
      name: item.name,
      contact: item.contact,
      message: `Email: ${item.email}`,
      createdAt: item.createdAt,
      replies: [],
    })),
    ...questions.map((item) => ({
      sourceType: "question",
      id: item.id,
      title: "Вопрос",
      name: item.name,
      contact: item.contact,
      message: item.message,
      createdAt: item.createdAt,
      replies: Array.isArray(item.replies) ? item.replies : [],
    })),
  ];

  renderList(
    questionsList,
    merged,
    (item) => `
      <article class="item">
        <p><strong>${escapeHtml(item.title)}: ${escapeHtml(item.name || "Без имени")}</strong></p>
        <p>Контакт: ${escapeHtml(item.contact || "-")}</p>
        <p>${escapeHtml(item.message || "-")}</p>
        <div class="reply-history">${renderReplies(item.replies)}</div>
        ${
          item.sourceType === "question"
            ? `
        <button
          class="reply-btn"
          type="button"
          data-id="${escapeHtml(item.id)}"
          data-name="${escapeHtml(item.name || "")}"
          data-message="${escapeHtml(item.message || "")}"
        >
          Ответить
        </button>
        `
            : `<p class="reply-history-empty">Для регистраций переписка не ведется.</p>`
        }
        <small>${formatDate(item.createdAt)}</small>
      </article>
    `,
    "Пока нет входящих сообщений."
  );
}

function showPanel(isLoggedIn) {
  if (!loginView || !panelView) return;
  loginView.classList.toggle("hidden", isLoggedIn);
  panelView.classList.toggle("hidden", !isLoggedIn);
  if (isLoggedIn) {
    loadOverview().catch((error) => {
      if (loginMessage) loginMessage.textContent = error.message;
    });
  }
}

function openReplyModal(questionId, name, sourceMessage) {
  activeReplyQuestionId = questionId;
  if (replyModalInput) {
    replyModalInput.value = "";
    replyModalInput.focus();
  }
  if (replyModal) replyModal.classList.remove("hidden");
}

function closeReplyModal() {
  activeReplyQuestionId = null;
  if (replyModal) replyModal.classList.add("hidden");
  if (replyModalInput) replyModalInput.value = "";
}

const currentSession = getSession();
if (currentSession?.user?.isAdmin) {
  showPanel(true);
}

if (loginForm && loginMessage) {
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = document.getElementById("email")?.value.trim().toLowerCase() || "";
    const password = document.getElementById("password")?.value.trim() || "";
    try {
      const result = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!result.user?.isAdmin) {
        loginMessage.textContent = "Доступ разрешен только администратору.";
        return;
      }
      saveSession({ token: result.token, user: result.user });
      loginMessage.textContent = "";
      showPanel(true);
    } catch (error) {
      loginMessage.textContent = error.message;
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // Если сервер недоступен, все равно очищаем локальную сессию.
    }
    clearSession();
    showPanel(false);
  });
}

if (questionsList) {
  questionsList.addEventListener("click", (event) => {
    const button = event.target.closest(".reply-btn");
    if (!button) return;
    const questionId = Number(button.getAttribute("data-id"));
    if (!Number.isFinite(questionId)) return;
    const name = button.getAttribute("data-name") || "клиент";
    const sourceMessage = button.getAttribute("data-message") || "";
    openReplyModal(questionId, name, sourceMessage);
  });
}

if (replyModalCloseBtn) {
  replyModalCloseBtn.addEventListener("click", closeReplyModal);
}

if (replyModal) {
  replyModal.addEventListener("click", (event) => {
    if (event.target === replyModal) closeReplyModal();
  });
}

if (replyModalSendBtn && replyModalInput) {
  replyModalSendBtn.addEventListener("click", async () => {
    const text = replyModalInput.value.trim();
    if (!Number.isFinite(activeReplyQuestionId)) return;
    if (!text) {
      replyModalInput.focus();
      return;
    }
    try {
      await apiRequest(`/api/admin/questions/${activeReplyQuestionId}/reply`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      closeReplyModal();
      await loadOverview();
    } catch (error) {
      if (replyModalInput) {
        replyModalInput.value = `${text}\n\n[Ошибка: ${error.message}]`;
      }
    }
  });
}

closeReplyModal();
