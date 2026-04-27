const PUBLIC_SESSION_KEY = "anna_public_session";
const API_BASE = String(window.APP_CONFIG?.API_BASE || "").trim();

const authOpenBtn = document.getElementById("auth-open-btn");
const accountRegisterForm = document.getElementById("account-register-form");
const accountRegisterMessage = document.getElementById("account-register-message");
const loginFormPublic = document.getElementById("login-form-public");
const loginPublicMessage = document.getElementById("login-public-message");
const forgotPasswordOpenBtn = document.getElementById("forgot-password-open-btn");
const forgotRequestBtn = document.getElementById("forgot-request-btn");
const forgotPasswordCancelBtn = document.getElementById("forgot-password-cancel-btn");
const forgotPasswordCloseBtn = document.getElementById("forgot-password-close-btn");
const forgotPasswordModal = document.getElementById("forgot-password-modal");
const forgotPasswordForm = document.getElementById("forgot-password-form");
const forgotPasswordMessage = document.getElementById("forgot-password-message");
const authSessionStatus = document.getElementById("auth-session-status");
const authSessionText = document.getElementById("auth-session-text");
const authAdminLink = document.getElementById("auth-admin-link");
const authLogoutBtn = document.getElementById("auth-logout-btn");
const authModal = document.getElementById("auth-modal");
const authOpenLink = document.getElementById("auth-open-link");
const navAdminPanelLink = document.getElementById("nav-admin-panel-link");
const authCloseBtn = document.getElementById("auth-close-btn");
const questionModal = document.getElementById("question-modal");
const questionOpenBtn = document.getElementById("question-open-btn");
const questionCloseBtn = document.getElementById("question-close-btn");
const questionForm = document.getElementById("question-form");
const questionFormMessage = document.getElementById("question-form-message");
const qNameInput = document.getElementById("q-name");
const qContactInput = document.getElementById("q-contact");
const threadContactInput = document.getElementById("thread-contact");
const threadLoadBtn = document.getElementById("thread-load-btn");
const threadList = document.getElementById("thread-list");
const reviewsMarquee = document.querySelector(".reviews-marquee");
const reviewsTrack = document.querySelector(".reviews-track");
const reviewsPrevBtn = document.getElementById("reviews-prev-btn");
const reviewsNextBtn = document.getElementById("reviews-next-btn");
const passwordToggleButtons = document.querySelectorAll(".password-toggle-btn");
let failedLoginAttempts = 0;
let isThreadExpanded = false;

function sanitizeEmail(value) {
  return String(value || "").trim().toLowerCase().normalize("NFKC");
}

function normalizeContact(value) {
  return String(value || "").trim().toLowerCase().normalize("NFKC");
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ru-RU");
}

function applyThreadViewMode() {
  if (!threadList || !threadLoadBtn) return;
  threadList.classList.toggle("thread-list-expanded", isThreadExpanded);
  threadList.classList.toggle("thread-list-collapsed", !isThreadExpanded);
  threadLoadBtn.textContent = isThreadExpanded ? "Свернуть переписку" : "Показать переписку";
}

function saveSession(token, user) {
  localStorage.setItem(
    PUBLIC_SESSION_KEY,
    JSON.stringify({
      token,
      user,
    })
  );
}

function clearSession() {
  localStorage.removeItem(PUBLIC_SESSION_KEY);
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

async function apiRequest(path, options = {}) {
  const session = getSession();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch {
    if (window.location.hostname.includes("github.io") && !API_BASE) {
      throw new Error("Сервер API не настроен для GitHub Pages. Укажите APP_CONFIG.API_BASE в config.js.");
    }
    throw new Error("Сервер недоступен. Проверьте, запущен ли backend.");
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const errorText = String(payload.error || "").toLowerCase();
    const isSessionError = response.status === 401 && (
      errorText.includes("сессия") ||
      errorText.includes("авторизац") ||
      errorText.includes("пользователь не найден")
    );
    if (isSessionError) {
      clearSession();
      renderAuthSessionStatus();
      renderAuthTrigger();
      if (loginPublicMessage) {
        loginPublicMessage.textContent = "Сессия истекла. Войдите снова.";
      }
      openAuthModal();
      throw new Error("Сессия истекла. Выполните вход снова.");
    }
    throw new Error(payload.error || "Ошибка запроса.");
  }
  return payload;
}

function renderAuthSessionStatus() {
  if (!authSessionStatus || !authSessionText) return;
  const session = getSession();
  if (!session?.user) {
    authSessionStatus.classList.add("hidden");
    authSessionText.textContent = "";
    if (authAdminLink) authAdminLink.classList.add("hidden");
    return;
  }
  authSessionStatus.classList.remove("hidden");
  if (session.user.isAdmin) {
    authSessionText.textContent = `Вы вошли как администратор: ${session.user.email}`;
    if (authAdminLink) authAdminLink.classList.remove("hidden");
  } else {
    authSessionText.textContent = `Вы вошли как ${session.user.name}`;
    if (authAdminLink) authAdminLink.classList.add("hidden");
  }
}

function renderAuthTrigger() {
  const session = getSession();
  if (navAdminPanelLink) {
    if (session?.user?.isAdmin) {
      navAdminPanelLink.classList.remove("hidden");
    } else {
      navAdminPanelLink.classList.add("hidden");
    }
  }

  if (authOpenLink) {
    if (!session?.user) {
      authOpenLink.textContent = "Вход / Регистрация";
    } else if (session.user.isAdmin) {
      authOpenLink.textContent = "Аккаунт (админ)";
    } else {
      authOpenLink.textContent = `Аккаунт: ${session.user.name}`;
    }
  }
}

function openForgotPasswordForm() {
  if (forgotPasswordModal) forgotPasswordModal.classList.remove("hidden");
  const loginEmail = sanitizeEmail(document.getElementById("login-email")?.value);
  const forgotEmailInput = document.getElementById("forgot-email");
  if (forgotEmailInput && loginEmail) forgotEmailInput.value = loginEmail;
  if (forgotPasswordMessage) forgotPasswordMessage.textContent = "";
}

function closeForgotPasswordForm() {
  if (forgotPasswordModal) forgotPasswordModal.classList.add("hidden");
  if (forgotPasswordForm) forgotPasswordForm.reset();
  if (forgotPasswordMessage) forgotPasswordMessage.textContent = "";
}

if (accountRegisterForm && accountRegisterMessage) {
  accountRegisterForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = document.getElementById("account-name")?.value.trim() || "";
    const email = sanitizeEmail(document.getElementById("account-email")?.value);
    const password = document.getElementById("account-password")?.value.trim() || "";

    if (!name || !email || !password) {
      accountRegisterMessage.textContent = "Заполните все поля.";
      return;
    }

    try {
      const result = await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      accountRegisterMessage.textContent = result.message || "Регистрация выполнена.";
      try {
        const loginResult = await apiRequest("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        saveSession(loginResult.token, loginResult.user);
        if (loginPublicMessage) {
          loginPublicMessage.textContent = `Добро пожаловать, ${loginResult.user?.name || name}!`;
        }
        renderAuthSessionStatus();
        renderAuthTrigger();
      } catch {
        if (loginPublicMessage) {
          loginPublicMessage.textContent = "Регистрация успешна. Выполните вход.";
        }
      }
      accountRegisterForm.reset();
    } catch (error) {
      accountRegisterMessage.textContent = error.message;
    }
  });
}

if (loginFormPublic && loginPublicMessage) {
  loginFormPublic.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = sanitizeEmail(document.getElementById("login-email")?.value);
    const password = document.getElementById("login-password")?.value.trim() || "";
    try {
      const result = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      failedLoginAttempts = 0;
      saveSession(result.token, result.user);
      loginPublicMessage.textContent = result.user?.isAdmin
        ? "Вход выполнен. Дополнительные возможности доступны в этом окне."
        : `Добро пожаловать, ${result.user?.name || "пользователь"}!`;
      renderAuthSessionStatus();
      renderAuthTrigger();
      loginFormPublic.reset();
    } catch (error) {
      loginPublicMessage.textContent = error.message;
      failedLoginAttempts += 1;
      if (failedLoginAttempts >= 3) openForgotPasswordForm();
    }
  });
}

passwordToggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.getAttribute("data-password-target");
    if (!targetId) return;
    const input = document.getElementById(targetId);
    if (!input) return;
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    button.textContent = isHidden ? "🙈" : "👁";
    button.setAttribute("aria-label", isHidden ? "Скрыть пароль" : "Показать пароль");
  });
});

if (forgotPasswordOpenBtn) {
  forgotPasswordOpenBtn.addEventListener("click", openForgotPasswordForm);
}

if (forgotPasswordCancelBtn) {
  forgotPasswordCancelBtn.addEventListener("click", closeForgotPasswordForm);
}

if (forgotPasswordCloseBtn) {
  forgotPasswordCloseBtn.addEventListener("click", closeForgotPasswordForm);
}

if (forgotPasswordModal) {
  forgotPasswordModal.addEventListener("click", (event) => {
    if (event.target === forgotPasswordModal) closeForgotPasswordForm();
  });
}

if (forgotPasswordForm && forgotPasswordMessage) {
  forgotPasswordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = sanitizeEmail(document.getElementById("forgot-email")?.value);
    const token = String(document.getElementById("forgot-reset-token")?.value || "").trim();
    const newPassword = document.getElementById("forgot-new-password")?.value.trim() || "";

    if (!token || !newPassword) {
      forgotPasswordMessage.textContent = "Введите токен и новый пароль.";
      return;
    }
    try {
      const result = await apiRequest("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      forgotPasswordMessage.textContent = result.message || "Пароль обновлен.";
      if (loginPublicMessage) loginPublicMessage.textContent = "Теперь выполните вход с новым паролем.";
      failedLoginAttempts = 0;
      forgotPasswordForm.reset();
      if (email) {
        const loginEmailInput = document.getElementById("login-email");
        if (loginEmailInput) loginEmailInput.value = email;
      }
    } catch (error) {
      forgotPasswordMessage.textContent = error.message;
    }
  });
}

if (forgotRequestBtn && forgotPasswordMessage) {
  forgotRequestBtn.addEventListener("click", async () => {
    const email = sanitizeEmail(document.getElementById("forgot-email")?.value);
    if (!email) {
      forgotPasswordMessage.textContent = "Введите email для отправки ссылки.";
      return;
    }
    try {
      const result = await apiRequest("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      forgotPasswordMessage.textContent = result.message || "Проверьте почту.";
      if (result.debugResetLink) {
        forgotPasswordMessage.textContent += ` Тестовая ссылка: ${result.debugResetLink}`;
      }
    } catch (error) {
      forgotPasswordMessage.textContent = error.message;
    }
  });
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const targetId = link.getAttribute("href");
    if (!targetId || targetId === "#") return;
    const target = document.querySelector(targetId);
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

function openQuestionModal() {
  if (questionModal) questionModal.classList.remove("hidden");
  isThreadExpanded = false;
  applyThreadViewMode();
  const session = getSession();
  const isLoggedIn = !!session?.token;

  if (!isLoggedIn && questionFormMessage) {
    questionFormMessage.textContent = "Для отправки вопроса и просмотра ответов выполните вход.";
  }

  if (qNameInput) {
    if (isLoggedIn) {
      qNameInput.value = session?.user?.name || "";
      qNameInput.readOnly = true;
    } else {
      qNameInput.readOnly = false;
    }
  }

  if (qContactInput) {
    if (isLoggedIn && !qContactInput.value.trim()) {
      qContactInput.value = session?.user?.email || "";
    }
  }

  const fallbackContact = threadContactInput?.value || qContactInput?.value || session?.user?.email || "";
  if (threadContactInput && fallbackContact) {
    threadContactInput.value = fallbackContact;
    void renderQuestionThreadByContact(fallbackContact);
  }
}

function closeQuestionModal() {
  if (questionModal) questionModal.classList.add("hidden");
}

if (questionOpenBtn) questionOpenBtn.addEventListener("click", openQuestionModal);
if (questionCloseBtn) questionCloseBtn.addEventListener("click", closeQuestionModal);

if (questionModal) {
  questionModal.addEventListener("click", (event) => {
    if (event.target === questionModal) closeQuestionModal();
  });
}

if (questionForm && questionFormMessage) {
  questionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const session = getSession();
    const name = (session?.user?.name || qNameInput?.value || "").trim();
    const contact = (qContactInput?.value || session?.user?.email || "").trim();
    const message = document.getElementById("q-message")?.value.trim() || "";

    if (!name || !contact || !message) {
      questionFormMessage.textContent = "Заполните все поля.";
      return;
    }

    try {
      await apiRequest("/api/questions", {
        method: "POST",
        body: JSON.stringify({ name, contact, message }),
      });
      questionFormMessage.textContent = "Спасибо! Вопрос отправлен Анне.";
      if (threadContactInput) threadContactInput.value = contact;
      await renderQuestionThreadByContact(contact);
      questionForm.reset();
    } catch (error) {
      questionFormMessage.textContent = error.message;
    }
  });
}

async function renderQuestionThreadByContact(rawContact) {
  if (!threadList) return;
  const contact = normalizeContact(rawContact);
  if (!contact) {
    threadList.innerHTML = "<p>Укажите контакт, чтобы увидеть переписку.</p>";
    return;
  }
  let questions = [];
  try {
    const result = await apiRequest("/api/questions/my");
    questions = (result.questions || [])
      .filter((item) => normalizeContact(item.contact) === contact)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  } catch (error) {
    threadList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!questions.length) {
    threadList.innerHTML = "<p>По этому контакту пока нет вопросов.</p>";
    applyThreadViewMode();
    return;
  }

  threadList.innerHTML = questions
    .map((item) => {
      const replies = Array.isArray(item.replies) ? item.replies : [];
      const repliesHtml = replies.length
        ? replies
            .map(
              (reply) => `
                <div class="thread-reply">
                  <p><strong>Анна:</strong> ${escapeHtml(reply.text || "-")}</p>
                  <small>${formatDateTime(reply.createdAt)}</small>
                </div>
              `
            )
            .join("")
        : '<p class="reply-history-empty">Ответа пока нет.</p>';

      return `
        <article class="thread-item">
          <p><strong>Вы:</strong> ${escapeHtml(item.message || "-")}</p>
          <small>${formatDateTime(item.createdAt)}</small>
          ${repliesHtml}
        </article>
      `;
    })
    .join("");
  applyThreadViewMode();
}

if (threadLoadBtn) {
  threadLoadBtn.addEventListener("click", async () => {
    isThreadExpanded = !isThreadExpanded;
    applyThreadViewMode();
    if (!threadList?.textContent?.trim()) {
      await renderQuestionThreadByContact(threadContactInput?.value || "");
    }
  });
}

applyThreadViewMode();

function openAuthModal() {
  if (authModal) authModal.classList.remove("hidden");
  renderAuthSessionStatus();
}

function closeAuthModal() {
  if (authModal) authModal.classList.add("hidden");
}

if (authOpenLink) {
  authOpenLink.addEventListener("click", (event) => {
    event.preventDefault();
    openAuthModal();
  });
}

if (authOpenBtn) {
  authOpenBtn.addEventListener("click", (event) => {
    event.preventDefault();
    openAuthModal();
  });
}

if (authCloseBtn) {
  authCloseBtn.addEventListener("click", closeAuthModal);
}

if (authModal) {
  authModal.addEventListener("click", (event) => {
    if (event.target === authModal) closeAuthModal();
  });
}

if (authLogoutBtn) {
  authLogoutBtn.addEventListener("click", async () => {
    try {
      await apiRequest("/api/auth/logout", { method: "POST" });
    } catch {
      // Игнорируем ошибку сервера, локально всё равно завершаем сессию.
    }
    clearSession();
    if (loginPublicMessage) loginPublicMessage.textContent = "Вы вышли из аккаунта.";
    if (accountRegisterMessage) accountRegisterMessage.textContent = "";
    renderAuthSessionStatus();
    renderAuthTrigger();
  });
}

function setupReviewsScrolling() {
  if (!reviewsMarquee || !reviewsTrack) return;

  let autoScrollPaused = false;
  let manualPauseTimeout = null;

  const pauseAutoScrollTemporarily = () => {
    autoScrollPaused = true;
    if (manualPauseTimeout) clearTimeout(manualPauseTimeout);
    manualPauseTimeout = setTimeout(() => {
      autoScrollPaused = false;
    }, 4000);
  };

  const autoScrollStep = () => {
    if (!autoScrollPaused) {
      const loopPoint = reviewsTrack.scrollWidth / 2;
      reviewsMarquee.scrollLeft += 0.55;
      if (reviewsMarquee.scrollLeft >= loopPoint) {
        reviewsMarquee.scrollLeft = 0;
      }
    }
    requestAnimationFrame(autoScrollStep);
  };

  requestAnimationFrame(autoScrollStep);

  reviewsMarquee.addEventListener("mouseenter", () => {
    autoScrollPaused = true;
  });

  reviewsMarquee.addEventListener("mouseleave", () => {
    autoScrollPaused = false;
  });

  reviewsMarquee.addEventListener("wheel", (event) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
      event.preventDefault();
      reviewsMarquee.scrollLeft += event.deltaY;
      pauseAutoScrollTemporarily();
    }
  }, { passive: false });

  if (reviewsPrevBtn) {
    reviewsPrevBtn.addEventListener("click", () => {
      reviewsMarquee.scrollBy({ left: -360, behavior: "smooth" });
      pauseAutoScrollTemporarily();
    });
  }

  if (reviewsNextBtn) {
    reviewsNextBtn.addEventListener("click", () => {
      reviewsMarquee.scrollBy({ left: 360, behavior: "smooth" });
      pauseAutoScrollTemporarily();
    });
  }
}

setupReviewsScrolling();
renderAuthSessionStatus();
renderAuthTrigger();

const urlParams = new URLSearchParams(window.location.search);
const resetTokenFromUrl = urlParams.get("resetToken");
if (resetTokenFromUrl) {
  openForgotPasswordForm();
  const tokenInput = document.getElementById("forgot-reset-token");
  if (tokenInput) tokenInput.value = resetTokenFromUrl;
}
if (urlParams.get("verified") === "ok" && accountRegisterMessage) {
  accountRegisterMessage.textContent = "Email подтвержден. Теперь можете войти.";
}

const revealTargets = document.querySelectorAll(
  ".hero-grid > div, .hero-card, .why-knit, .photo-card, .card, .subscribe, .contact-card, .auth-card"
);
revealTargets.forEach((element) => element.classList.add("reveal"));

if ("IntersectionObserver" in window && revealTargets.length > 0) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14 }
  );
  revealTargets.forEach((element) => revealObserver.observe(element));
} else {
  revealTargets.forEach((element) => element.classList.add("is-visible"));
}
