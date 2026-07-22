const API_URL = window.VIC_CONFIG?.API_URL || "";
const $ = (id) => document.getElementById(id);
const DISPLAY_LIMIT = 10;
const publicFeaturedState = { items: [], currentIndex: -1, timer: 0 };

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch (_) {
    return "";
  }
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

async function requestRecommendations(genre = "") {
  if (!API_URL) throw new Error("API URLが設定されていません。");
  const url = new URL(API_URL);
  url.searchParams.set("action", "recommendations");
  url.searchParams.set("genre", genre);
  url.searchParams.set("limit", String(DISPLAY_LIMIT));
  url.searchParams.set("nonce", `${Date.now()}-${Math.random()}`);
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error(`おすすめを取得できませんでした（${response.status}）`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.message || "おすすめを取得できませんでした。");
  return Array.isArray(data.recommendations) ? data.recommendations.slice(0, DISPLAY_LIMIT) : [];
}


async function requestFeaturedVideos() {
  if (!API_URL) throw new Error("API URLが設定されていません。");
  const url = new URL(API_URL);
  url.searchParams.set("action", "featuredVideos");
  url.searchParams.set("nonce", `${Date.now()}-${Math.random()}`);
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error(`管理人おすすめを取得できませんでした（${response.status}）`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.message || "管理人おすすめを取得できませんでした。");
  return Array.isArray(data.items) ? data.items : [];
}

function pickNextPublicFeaturedIndex() {
  const length = publicFeaturedState.items.length;
  if (!length) return -1;
  if (length === 1) return 0;
  let next = publicFeaturedState.currentIndex;
  while (next === publicFeaturedState.currentIndex) next = Math.floor(Math.random() * length);
  return next;
}

function showNextPublicFeaturedVideo() {
  const stack = $("publicFeaturedStack");
  if (!stack || !publicFeaturedState.items.length) return;
  const nextIndex = pickNextPublicFeaturedIndex();
  if (nextIndex < 0) return;
  publicFeaturedState.currentIndex = nextIndex;
  const item = publicFeaturedState.items[nextIndex] || {};
  const videoUrl = safeHttpsUrl(item.videoUrl);
  const thumbnailUrl = safeHttpsUrl(item.thumbnailUrl);
  if (!videoUrl || !thumbnailUrl) return;

  stack.querySelectorAll(".vic-featured-slide").forEach((slide) => slide.classList.add("is-leaving"));
  const link = document.createElement("a");
  link.className = "vic-featured-slide is-entering";
  link.href = videoUrl;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.setAttribute("aria-label", `${item.category || "管理人おすすめ"}をYouTubeで開く`);
  link.innerHTML = `
    <img src="${esc(thumbnailUrl)}" alt="${esc(item.category || "管理人おすすめ動画")}のサムネイル">
    <span class="vic-featured-overlay">
      <small>Administrator's Pick</small>
      <strong>${esc(item.category || "管理人おすすめ")}</strong>
      <em>動画を見る ↗</em>
    </span>`;
  stack.appendChild(link);
  $("publicFeaturedEmpty")?.remove();
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    link.classList.remove("is-entering");
    link.classList.add("is-active");
  }));
  window.setTimeout(() => {
    stack.querySelectorAll(".vic-featured-slide.is-leaving").forEach((slide) => slide.remove());
  }, 1500);
}

async function setupPublicFeaturedShowcase() {
  const stack = $("publicFeaturedStack");
  if (!stack) return;
  window.clearInterval(publicFeaturedState.timer);
  try {
    publicFeaturedState.items = await requestFeaturedVideos();
    publicFeaturedState.currentIndex = -1;
    stack.querySelectorAll(".vic-featured-slide").forEach((slide) => slide.remove());
    if (!publicFeaturedState.items.length) {
      stack.innerHTML = `<div id="publicFeaturedEmpty" class="vic-featured-empty"><span>Administrator's Pick</span><strong>管理人おすすめを登録すると、ここに表示されます</strong></div>`;
      return;
    }
    showNextPublicFeaturedVideo();
    publicFeaturedState.timer = window.setInterval(showNextPublicFeaturedVideo, 5000);
  } catch (error) {
    console.error(error);
    stack.innerHTML = `<div id="publicFeaturedEmpty" class="vic-featured-empty"><span>Administrator's Pick</span><strong>管理人おすすめを読み込めませんでした</strong></div>`;
  }
}

function recommendationCard(item, index) {
  const videoUrl = safeHttpsUrl(item.videoUrl);
  if (!videoUrl) return "";
  const thumbnailUrl = safeHttpsUrl(item.thumbnailUrl);
  const activityName = item.activityName || "活動名未設定";
  const meta = [item.reading, item.affiliation].filter(Boolean).join(" / ") || "登録VTuber";
  const point = item.recommendationPoint || "";
  const genre = item.genre || "その他";
  const media = thumbnailUrl ? `
    <span class="daily-recommendation-media" aria-hidden="true">
      <img src="${esc(thumbnailUrl)}" alt="" loading="${index < 2 ? "eager" : "lazy"}" decoding="async">
      <span class="daily-recommendation-play">▶</span>
    </span>` : "";

  return `
    <a class="daily-recommendation-card" href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer"
       aria-label="${esc(activityName)}の${esc(genre)}おすすめ動画を見る">
      <span class="daily-recommendation-seal" aria-hidden="true"><span>VIC</span></span>
      <span class="daily-recommendation-copy">
        <span class="daily-recommendation-kicker">VIC Recommendation ${String(index + 1).padStart(2, "0")}</span>
        <span class="recommendation-genre">${esc(genre)}</span>
        <strong>${esc(activityName)}</strong>
        <span class="daily-recommendation-meta">${esc(meta)}</span>
        <span class="daily-recommendation-point">${esc(point)}</span>
        <span class="daily-recommendation-action">おすすめ動画を見る</span>
      </span>
      ${media}
    </a>`;
}

function renderRecommendations(items, genre) {
  const list = $("recommendationList");
  const status = $("recommendationStatus");
  if (!list || !status) return;

  const cards = (Array.isArray(items) ? items : [])
    .slice(0, DISPLAY_LIMIT)
    .map(recommendationCard)
    .filter(Boolean)
    .join("");

  if (!cards) {
    list.innerHTML = "";
    status.textContent = genre
      ? `「${genre}」で公開中のおすすめはまだありません。`
      : "公開中のおすすめはまだありません。";
  } else {
    list.innerHTML = cards;
    status.textContent = `${genre || "すべてのジャンル"}から${items.length}件をランダム表示しています。`;
  }
}

async function loadRecommendations() {
  const genre = $("recommendationGenre")?.value || "";
  const list = $("recommendationList");
  const status = $("recommendationStatus");
  const buttons = [$("recommendationShuffle"), $("recommendationRefresh")].filter(Boolean);
  if (list) list.innerHTML = '<p class="status-message">おすすめを選んでいます。</p>';
  if (status) status.textContent = "";
  buttons.forEach((button) => { button.disabled = true; });
  try {
    renderRecommendations(await requestRecommendations(genre), genre);
  } catch (error) {
    console.error(error);
    if (list) list.innerHTML = "";
    if (status) status.textContent = error.message || "おすすめを読み込めませんでした。";
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
  }
}

function setupRecommendationControls() {
  $("recommendationGenre")?.addEventListener("change", loadRecommendations);
  $("recommendationShuffle")?.addEventListener("click", loadRecommendations);
  $("recommendationRefresh")?.addEventListener("click", loadRecommendations);
  loadRecommendations();
}

function setupBgm() {
  const audio = $("bgmAudio");
  const toggle = $("bgmToggle");
  if (!audio || !toggle) return;

  audio.volume = 0.28;
  // 初回はBGM再生を既定にする。利用者が明示的に停止した場合だけ次回も停止する。
  let enabled = localStorage.getItem("vicBgmEnabled") !== "false";

  const sync = () => {
    const playing = !audio.paused;
    toggle.textContent = playing ? "BGMを停止" : "BGMを再生";
    toggle.setAttribute("aria-pressed", String(playing));
  };

  const play = async () => {
    try {
      await audio.play();
      enabled = true;
      localStorage.setItem("vicBgmEnabled", "true");
    } catch (_) {
      // 音声付き自動再生を禁止するブラウザでは、最初の操作時に再試行する。
    }
    sync();
  };

  toggle.addEventListener("click", async () => {
    if (audio.paused) await play();
    else {
      audio.pause();
      enabled = false;
      localStorage.setItem("vicBgmEnabled", "false");
      sync();
    }
  });

  const resumeAfterInteraction = () => {
    if (enabled && audio.paused) play();
  };
  document.addEventListener("pointerdown", resumeAfterInteraction, { once: true });
  document.addEventListener("keydown", resumeAfterInteraction, { once: true });
  audio.addEventListener("play", sync);
  audio.addEventListener("pause", sync);
  sync();
  if (enabled) play();
}

setupPublicFeaturedShowcase();
setupRecommendationControls();
setupBgm();
window.addEventListener("pagehide", () => window.clearInterval(publicFeaturedState.timer));
