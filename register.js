const API_URL = window.VIC_CONFIG?.API_URL || "";
const $ = (id) => document.getElementById(id);
const VIDEO_GENRES = ["雑談", "歌枠", "ゲーム実況", "お絵描き", "ASMR", "料理", "開封", "旅行・旅", "作業", "企画", "耐久", "コラボ", "案件", "ニュース", "読書・朗読", "その他"];
const state = { selectedProfile: null, searchTimer: 0, searchRequest: 0 };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function isHttpsUrl(value) {
  try { return new URL(String(value || "")).protocol === "https:"; }
  catch (_) { return false; }
}

async function postJson(payload) {
  if (!API_URL) throw new Error("API URLが設定されていません。");
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error(`送信に失敗しました（${response.status}）`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.message || "送信できませんでした。");
  return data;
}

function setMessage(form, text, type = "") {
  const message = form.querySelector(".form-message");
  message.textContent = text;
  message.className = `form-message${type ? ` ${type}` : ""}`;
}

function setupTabs() {
  const initialTab = $("initialTab");
  const additionTab = $("additionTab");
  const initialPanel = $("initialPanel");
  const additionPanel = $("additionPanel");

  const activate = (mode) => {
    const initial = mode === "initial";
    initialTab.classList.toggle("active", initial);
    additionTab.classList.toggle("active", !initial);
    initialTab.setAttribute("aria-selected", String(initial));
    additionTab.setAttribute("aria-selected", String(!initial));
    initialPanel.hidden = !initial;
    additionPanel.hidden = initial;
  };

  initialTab.addEventListener("click", () => activate("initial"));
  additionTab.addEventListener("click", () => activate("addition"));
}

function validateInitial(data) {
  if (!String(data.activityName || "").trim()) throw new Error("活動名を入力してください。");
  for (const key of ["xUrl", "youtubeUrl", "otherLink1", "otherLink2", "otherLink3"]) {
    if (String(data[key] || "").trim() && !isHttpsUrl(data[key])) {
      throw new Error("入力したリンクは https:// から入力してください。");
    }
  }
  const videoUrl = String(data.recommendedVideoUrl || "").trim();
  if (videoUrl && !isHttpsUrl(videoUrl)) throw new Error("おすすめ動画リンクは https:// から入力してください。");
  if (data.genre && !VIDEO_GENRES.includes(String(data.genre))) throw new Error("動画ジャンルを選択してください。");
}

function validateAddition(data) {
  if (!state.selectedProfile || !data.profileId) throw new Error("登録済みVTuberを選択してください。");
  if (!VIDEO_GENRES.includes(String(data.genre || ""))) throw new Error("動画ジャンルを選択してください。");
  if (!String(data.recommendedVideoUrl || "").trim() || !String(data.recommendationPoint || "").trim()) {
    throw new Error("おすすめ動画リンクとおすすめポイントを入力してください。");
  }
  if (!isHttpsUrl(data.recommendedVideoUrl)) throw new Error("リンクは https:// から入力してください。");
}

function setupForms() {
  const initialForm = $("initialForm");
  const additionForm = $("additionForm");

  initialForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = initialForm.querySelector('[type="submit"]');
    const data = Object.fromEntries(new FormData(initialForm).entries());
    setMessage(initialForm, "");
    try {
      validateInitial(data);
      button.disabled = true;
      button.textContent = "送信中…";
      await postJson({ action: "submitInitial", ...data });
      initialForm.reset();
      setMessage(initialForm, "送信しました。確認後におすすめへ反映されます。", "success");
    } catch (error) {
      setMessage(initialForm, error.message || "送信できませんでした。", "error");
    } finally {
      button.disabled = false;
      button.textContent = "初回登録を送信する";
    }
  });

  additionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = additionForm.querySelector('[type="submit"]');
    const data = Object.fromEntries(new FormData(additionForm).entries());
    setMessage(additionForm, "");
    try {
      validateAddition(data);
      button.disabled = true;
      button.textContent = "送信中…";
      await postJson({ action: "submitRecommendation", ...data });
      additionForm.reset();
      clearSelectedProfile(false);
      setMessage(additionForm, "送信しました。確認後におすすめ候補へ追加されます。", "success");
    } catch (error) {
      setMessage(additionForm, error.message || "送信できませんでした。", "error");
    } finally {
      button.disabled = false;
      button.textContent = "おすすめを追加申請する";
    }
  });
}

async function searchProfiles(query) {
  if (!API_URL) throw new Error("API URLが設定されていません。");
  const url = new URL(API_URL);
  url.searchParams.set("action", "profileSearch");
  url.searchParams.set("q", String(query || "").trim());
  url.searchParams.set("limit", "20");
  url.searchParams.set("nonce", String(Date.now()));
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  if (!response.ok) throw new Error("登録済みVTuberを検索できませんでした。");
  const data = await response.json();
  if (!data.ok) throw new Error(data.message || "登録済みVTuberを検索できませんでした。");
  return Array.isArray(data.profiles) ? data.profiles : [];
}

function renderSearchResults(profiles) {
  const root = $("profileSearchResults");
  const status = $("profileSearchStatus");
  if (!profiles.length) {
    root.innerHTML = "";
    root.hidden = true;
    status.textContent = "一致する登録済みVTuberが見つかりません。";
    return;
  }

  root.innerHTML = profiles.map((profile, index) => `
    <button class="profile-result-button" type="button" role="option" data-profile-index="${index}">
      <strong>${escapeHtml(profile.activityName || "活動名未設定")}</strong>
      <span>${escapeHtml(profile.reading || "よみかた未登録")}</span>
      <small>${escapeHtml(profile.affiliation || "個人・企業名未登録")}</small>
    </button>`).join("");
  root.hidden = false;
  status.textContent = `${profiles.length}件の候補があります。`;
  root.querySelectorAll("[data-profile-index]").forEach((button) => {
    button.addEventListener("click", () => selectProfile(profiles[Number(button.dataset.profileIndex)]));
  });
}

function selectProfile(profile) {
  state.selectedProfile = profile;
  $("additionProfileId").value = String(profile.profileId || "");
  $("additionActivityName").value = String(profile.activityName || "");
  $("profileSearchInput").value = String(profile.activityName || "");
  $("profileSearchResults").hidden = true;

  const selected = $("selectedProfile");
  selected.innerHTML = `
    <p>Selected VTuber</p>
    <strong>${escapeHtml(profile.activityName || "活動名未設定")}</strong>
    <span>${escapeHtml([profile.reading, profile.affiliation].filter(Boolean).join(" / "))}</span>
    <button id="clearSelectedProfile" type="button">選び直す</button>`;
  selected.hidden = false;
  $("clearSelectedProfile").addEventListener("click", () => clearSelectedProfile(true));
  $("profileSearchStatus").textContent = "選択しました。おすすめ動画リンクとおすすめポイントを入力してください。";
}

function clearSelectedProfile(focusSearch = true) {
  state.selectedProfile = null;
  $("additionProfileId").value = "";
  $("additionActivityName").value = "";
  $("profileSearchInput").value = "";
  $("selectedProfile").hidden = true;
  $("selectedProfile").innerHTML = "";
  $("profileSearchResults").hidden = true;
  $("profileSearchResults").innerHTML = "";
  $("profileSearchStatus").textContent = "名前を入力すると候補を表示します。";
  if (focusSearch) $("profileSearchInput").focus();
}

function setupProfileSearch() {
  const input = $("profileSearchInput");
  input.addEventListener("input", () => {
    if (state.selectedProfile && input.value !== state.selectedProfile.activityName) clearSelectedProfile(false);
    clearTimeout(state.searchTimer);
    const query = input.value.trim();
    if (!query) {
      $("profileSearchResults").hidden = true;
      $("profileSearchStatus").textContent = "名前を入力すると候補を表示します。";
      return;
    }
    state.searchTimer = window.setTimeout(async () => {
      const request = ++state.searchRequest;
      $("profileSearchStatus").textContent = "検索しています…";
      try {
        const profiles = await searchProfiles(query);
        if (request === state.searchRequest) renderSearchResults(profiles);
      } catch (error) {
        if (request === state.searchRequest) $("profileSearchStatus").textContent = error.message;
      }
    }, 280);
  });
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
  const resume = () => { if (enabled && audio.paused) play(); };
  document.addEventListener("pointerdown", resume, { once: true });
  document.addEventListener("keydown", resume, { once: true });
  audio.addEventListener("play", sync);
  audio.addEventListener("pause", sync);
  sync();
  if (enabled) play();
}

setupTabs();
setupForms();
setupProfileSearch();
setupBgm();
