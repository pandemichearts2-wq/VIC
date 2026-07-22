const API_URL = window.VIC_CONFIG?.API_URL || "";
const $ = (id) => document.getElementById(id);
const DISPLAY_LIMIT = 10;

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

setupRecommendationControls();
setupBgm();
