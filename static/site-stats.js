"use strict";

const { t, getLocale } = window.LLMStormI18n;
const MAX_VISIBLE_COUNT = 9_999_999;
const VISITOR_STORAGE_KEY = "llmstorm.visitorId";
const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{16,80}$/;

function dashboardMarkup() {
  return `
    <div class="console-top"><span><i></i>CAPACITY SCANNER</span><em>LIVE</em></div>
    <div class="console-body">
      <div class="storm-scope"><i></i><i></i><i></i><span></span></div>
      <div class="signal-bars">
        <div><span>RELAY SIGNAL</span><i class="signal-84"></i></div>
        <div><span>STREAM HEALTH</span><i class="signal-96"></i></div>
        <div><span>LATENCY TRACE</span><i class="signal-68"></i></div>
      </div>
    </div>
    <div id="site-stats" class="hero-stats community-stats" aria-label="站点实时数据" data-i18n-aria="siteStatsAria">
      <div class="site-stat online-stat" data-stat="online" tabindex="0">
        <i class="online-pulse" aria-hidden="true"></i>
        <strong id="online-count">—</strong>
        <span data-i18n="onlineVisitors">实时在线</span>
      </div>
      <div class="site-stat" data-stat="views" tabindex="0">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>
        <strong id="view-count">—</strong>
        <span data-i18n="totalViews">总浏览量</span>
      </div>
      <button id="site-like-button" class="site-stat like-stat" type="button" data-stat="likes" data-i18n-aria="likeButtonAria" aria-label="点赞">
        <span class="like-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24"><path d="M20.8 5.9a5.3 5.3 0 0 0-7.5 0L12 7.2l-1.3-1.3a5.3 5.3 0 1 0-7.5 7.5L12 22l8.8-8.6a5.3 5.3 0 0 0 0-7.5Z"/></svg>
          <i></i>
        </span>
        <strong id="like-count">—</strong>
        <span data-i18n="totalLikes">总点赞量</span>
      </button>
    </div>`;
}

function ensureStatsDashboard() {
  if (document.querySelector("#site-stats")) return;
  const hero = document.querySelector(".directory-hero, .support-hero");
  if (!hero) return;
  if (hero.classList.contains("support-hero")) {
    const copy = document.createElement("div");
    copy.className = "support-hero-copy";
    while (hero.firstChild) copy.appendChild(hero.firstChild);
    hero.appendChild(copy);
  }
  const dashboard = document.createElement("div");
  dashboard.className = "hero-console shared-stats-console";
  dashboard.innerHTML = dashboardMarkup();
  hero.classList.add("has-stats-dashboard");
  hero.appendChild(dashboard);
  window.LLMStormI18n.apply(dashboard);
}

ensureStatsDashboard();

const statElements = {
  online: document.querySelector('[data-stat="online"]'),
  views: document.querySelector('[data-stat="views"]'),
  likes: document.querySelector('[data-stat="likes"]')
};
const countElements = {
  online: document.querySelector("#online-count"),
  views: document.querySelector("#view-count"),
  likes: document.querySelector("#like-count")
};
const likeButton = document.querySelector("#site-like-button");
const seenLikeEvents = new Set();
let latestStats = null;
let eventSource = null;

function randomId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(20);
  window.crypto?.getRandomValues?.(bytes);
  const value = [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
  return value || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_client`;
}

function visitorId() {
  try {
    const stored = window.localStorage.getItem(VISITOR_STORAGE_KEY) || "";
    if (CLIENT_ID_PATTERN.test(stored)) return stored;
    const created = randomId();
    window.localStorage.setItem(VISITOR_STORAGE_KEY, created);
    return created;
  } catch {
    return randomId();
  }
}

const currentVisitorId = visitorId();
const currentSessionId = randomId();

function safeCount(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) return 0;
  return number;
}

function numberFormatter() {
  return new Intl.NumberFormat(getLocale() === "zh" ? "zh-CN" : "en-US");
}

function visibleCount(value) {
  const count = safeCount(value);
  const visible = Math.min(count, MAX_VISIBLE_COUNT);
  return `${numberFormatter().format(visible)}${count > MAX_VISIBLE_COUNT ? "+" : ""}`;
}

function exactCount(value) {
  return numberFormatter().format(safeCount(value));
}

function bump(element) {
  if (!element) return;
  element.classList.remove("count-updated");
  void element.offsetWidth;
  element.classList.add("count-updated");
}

function renderStats(payload, { animate = false } = {}) {
  if (!payload || typeof payload !== "object") return;
  const previous = latestStats;
  latestStats = {
    online: safeCount(payload.online),
    realOnline: safeCount(payload.realOnline),
    synthetic: Boolean(payload.synthetic),
    views: safeCount(payload.views),
    likes: safeCount(payload.likes)
  };

  for (const key of ["online", "views", "likes"]) {
    const countElement = countElements[key];
    const statElement = statElements[key];
    if (!countElement || !statElement) continue;
    countElement.textContent = visibleCount(latestStats[key]);
    const detail = t("exactCount", { count: exactCount(latestStats[key]) });
    statElement.dataset.tooltip = detail;
    statElement.setAttribute(
      "aria-label",
      key === "likes" ? t("likeButtonCountAria", { count: exactCount(latestStats.likes) }) : detail
    );
    if (animate && previous && previous[key] !== latestStats[key]) bump(countElement);
  }
  statElements.online?.classList.toggle("is-synthetic", latestStats.synthetic);
}

function parseEvent(event) {
  try {
    return JSON.parse(event.data);
  } catch {
    return null;
  }
}

function rememberLike(eventId) {
  if (!eventId || seenLikeEvents.has(eventId)) return false;
  seenLikeEvents.add(eventId);
  if (seenLikeEvents.size > 80) seenLikeEvents.delete(seenLikeEvents.values().next().value);
  return true;
}

function animateLikeButton() {
  if (!likeButton) return;
  likeButton.classList.remove("is-liked");
  void likeButton.offsetWidth;
  likeButton.classList.add("is-liked");
}

function showLikeEvent(like) {
  if (!likeButton || !like || !rememberLike(String(like.eventId || ""))) return;
  const notice = document.createElement("span");
  const rect = likeButton.getBoundingClientRect();
  const horizontal = (Math.random() - 0.5) * Math.min(300, window.innerWidth * 0.55);
  const vertical = (Math.random() - 0.5) * 70;
  const left = Math.min(window.innerWidth - 130, Math.max(130, rect.left + rect.width / 2 + horizontal));
  const top = Math.min(window.innerHeight - 60, Math.max(70, rect.top + rect.height / 2 + vertical));
  notice.className = "floating-like-notice";
  notice.textContent = t("anonymousLiked", { id: String(like.anonymousId || "------") });
  notice.style.left = `${left}px`;
  notice.style.top = `${top}px`;
  notice.style.setProperty("--like-drift", `${Math.round((Math.random() - 0.5) * 80)}px`);
  document.body.appendChild(notice);
  notice.addEventListener("animationend", () => notice.remove(), { once: true });
}

function handleLikePayload(payload) {
  if (!payload) return;
  renderStats(payload.stats, { animate: true });
  showLikeEvent(payload.like);
}

function connectLiveStats() {
  if (!("EventSource" in window)) return;
  const query = new URLSearchParams({
    visitorId: currentVisitorId,
    sessionId: currentSessionId
  });
  eventSource = new EventSource(`/api/stats/events?${query}`);
  eventSource.addEventListener("snapshot", (event) => {
    renderStats(parseEvent(event), { animate: true });
  });
  eventSource.addEventListener("like", (event) => {
    handleLikePayload(parseEvent(event));
  });
}

async function recordPageView() {
  try {
    const response = await fetch("/api/stats/view", {
      method: "POST",
      headers: { Accept: "application/json" },
      keepalive: true
    });
    if (response.ok) renderStats(await response.json(), { animate: true });
  } catch {
    // Statistics must never block the application itself.
  }
}

async function addLike() {
  animateLikeButton();
  try {
    const response = await fetch("/api/stats/like", {
      method: "POST",
      headers: { Accept: "application/json" },
      keepalive: true
    });
    if (!response.ok) return;
    handleLikePayload(await response.json());
  } catch {
    // A failed reaction leaves the previously confirmed count intact.
  }
}

likeButton?.addEventListener("click", addLike);
window.addEventListener("llmstorm:localechange", () => {
  if (latestStats) renderStats(latestStats);
});
window.addEventListener("pagehide", () => eventSource?.close());

connectLiveStats();
recordPageView();
