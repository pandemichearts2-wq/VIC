const API_URL = window.VIC_CONFIG?.API_URL || "";
const $ = (id) => document.getElementById(id);

function safeHttpsUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch (_) {
    return "";
  }
}

function japanDateKey() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatJapanDate() {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "long",
    day: "numeric",
    weekday: "short"
  }).format(new Date());
}

async function requestDailyRecommendation() {
  if (!API_URL) throw new Error("API URLが設定されていません。");
  const url = new URL(API_URL);
  url.searchParams.set("action", "dailyRecommendation");
  url.searchParams.set("date", japanDateKey());
  url.searchParams.set("nonce", String(Date.now()));
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error(`おすすめを取得できませんでした（${response.status}）`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.message || "おすすめを取得できませんでした。");
  return data.recommendation || null;
}

function renderRecommendation(item) {
  const root = $("dailyRecommendation");
  const status = $("dailyRecommendationStatus");
  if (!root) return;

  if (!item) {
    root.hidden = false;
    $("dailyRecommendationLink").hidden = true;
    status.textContent = "公開中のおすすめはまだありません。";
    $("dailyRecommendationDate").textContent = formatJapanDate();
    return;
  }

  const videoUrl = safeHttpsUrl(item.videoUrl);
  const thumbnailUrl = safeHttpsUrl(item.thumbnailUrl);
  if (!videoUrl) throw new Error("おすすめ動画のリンクを表示できませんでした。");

  $("dailyRecommendationName").textContent = item.activityName || "活動名未設定";
  $("dailyRecommendationMeta").textContent = [item.reading, item.affiliation].filter(Boolean).join(" / ") || "登録VTuber";
  $("dailyRecommendationPoint").textContent = item.recommendationPoint || "";
  $("dailyRecommendationDate").textContent = formatJapanDate();
  $("dailyRecommendationDate").setAttribute("datetime", japanDateKey());

  const link = $("dailyRecommendationLink");
  link.href = videoUrl;
  link.hidden = false;
  link.setAttribute("aria-label", `本日のおすすめVTuber、${item.activityName || "VTuber"}のおすすめ動画を見る`);

  const thumbnail = $("dailyRecommendationThumbnail");
  if (thumbnailUrl) {
    thumbnail.src = thumbnailUrl;
    thumbnail.alt = `${item.activityName || "VTuber"}のおすすめ動画サムネイル`;
    thumbnail.parentElement.hidden = false;
  } else {
    thumbnail.removeAttribute("src");
    thumbnail.alt = "";
    thumbnail.parentElement.hidden = true;
  }

  status.textContent = "";
  root.hidden = false;
}

async function setupDailyRecommendation() {
  try {
    renderRecommendation(await requestDailyRecommendation());
  } catch (error) {
    console.error(error);
    const root = $("dailyRecommendation");
    if (root) root.hidden = false;
    const link = $("dailyRecommendationLink");
    if (link) link.hidden = true;
    const status = $("dailyRecommendationStatus");
    if (status) status.textContent = error.message || "おすすめを読み込めませんでした。";
    const date = $("dailyRecommendationDate");
    if (date) date.textContent = formatJapanDate();
  }
}

function setupBgm() {
  const audio = $("bgmAudio");
  const toggle = $("bgmToggle");
  if (!audio || !toggle) return;

  audio.volume = 0.28;
  let enabled = localStorage.getItem("vicBgmEnabled") === "true";

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
      enabled = false;
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
}

setupDailyRecommendation();
setupBgm();
