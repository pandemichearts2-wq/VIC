const API_URL = window.VIC_CONFIG?.API_URL || "";
const $ = (id) => document.getElementById(id);
const state = {
  token: sessionStorage.getItem("vicAdminToken") || "",
  tab: "submissions",
  submissions: { offset: 0, hasMore: false },
  profiles: { offset: 0, hasMore: false },
  recommendations: { offset: 0, hasMore: false },
  edit: null
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function fmtDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("ja-JP");
}

function safeUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.href : "";
  } catch (_) {
    return "";
  }
}

async function api(action, payload = {}) {
  if (!API_URL) throw new Error("API URLが設定されていません。");
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, adminToken: state.token, ...payload })
  });
  if (!response.ok) throw new Error(`通信に失敗しました（${response.status}）`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.message || "処理できませんでした。");
  return data;
}

function typeLabel(type) {
  return type === "initial" ? "初回登録" : type === "recommendation" ? "おすすめ追加" : type;
}

function setLoggedIn(loggedIn) {
  $("adminLogin").hidden = loggedIn;
  $("adminShell").hidden = !loggedIn;
  if (loggedIn) loadActiveTab();
}

function logout() {
  state.token = "";
  sessionStorage.removeItem("vicAdminToken");
  $("adminPassword").value = "";
  setLoggedIn(false);
}

$("adminLoginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button");
  const message = $("adminLoginMessage");
  message.textContent = "";
  button.disabled = true;
  try {
    const data = await api("adminLogin", { password: $("adminPassword").value });
    state.token = data.adminToken;
    sessionStorage.setItem("vicAdminToken", state.token);
    setLoggedIn(true);
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("adminLogout").addEventListener("click", logout);

document.querySelectorAll(".admin-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((item) => item.classList.toggle("active", item === button));
    state.tab = button.dataset.adminTab;
    $("adminPanelSubmissions").hidden = state.tab !== "submissions";
    $("adminPanelProfiles").hidden = state.tab !== "profiles";
    $("adminPanelRecommendations").hidden = state.tab !== "recommendations";
    loadActiveTab();
  });
});

function handleAdminError(error, box) {
  if (/ログイン|有効期限|セッション/.test(error.message)) {
    logout();
    return;
  }
  box.innerHTML = `<div class="admin-empty">${esc(error.message)}</div>`;
}

function loadActiveTab() {
  if (state.tab === "submissions") loadSubmissions(true);
  else if (state.tab === "profiles") loadProfiles(true);
  else loadRecommendations(true);
}

function renderSubmissionPayload(item) {
  const payload = item.payload || {};
  const videoUrl = safeUrl(payload.recommendedVideoUrl);
  const point = esc(payload.recommendationPoint || "").replace(/\r?\n/g, "<br>");
  if (item.submissionType === "initial") {
    return `
      <dl class="admin-data-grid">
        <div><dt>活動名</dt><dd>${esc(payload.activityName)}</dd></div>
        <div><dt>よみかた</dt><dd>${esc(payload.reading)}</dd></div>
        <div><dt>個人／企業名</dt><dd>${esc(payload.affiliation)}</dd></div>
        <div><dt>X</dt><dd>${safeUrl(payload.xUrl) ? `<a href="${esc(payload.xUrl)}" target="_blank" rel="noopener noreferrer">リンクを開く</a>` : ""}</dd></div>
        <div><dt>YouTube</dt><dd>${safeUrl(payload.youtubeUrl) ? `<a href="${esc(payload.youtubeUrl)}" target="_blank" rel="noopener noreferrer">チャンネルを開く</a>` : ""}</dd></div>
        <div><dt>おすすめ動画</dt><dd>${videoUrl ? `<a href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer">動画を開く</a>` : ""}</dd></div>
      </dl>
      <div class="admin-point"><strong>おすすめポイント</strong><p>${point}</p></div>`;
  }
  return `
    <dl class="admin-data-grid">
      <div><dt>追加先</dt><dd>${esc(payload.activityName)}</dd></div>
      <div><dt>おすすめ動画</dt><dd>${videoUrl ? `<a href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer">動画を開く</a>` : ""}</dd></div>
    </dl>
    <div class="admin-point"><strong>おすすめポイント</strong><p>${point}</p></div>`;
}

function renderSubmissions(items, root) {
  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "admin-card";
    article.innerHTML = `
      <div class="admin-card-head">
        <div>
          <span class="admin-badge">${esc(typeLabel(item.submissionType))}</span>
          <h3>${esc(item.activityName || "活動名未設定")}</h3>
          <p>${esc(item.submissionId)} / ${esc(fmtDate(item.receivedAt))}</p>
        </div>
        <span class="admin-status-badge">${esc(item.status)}</span>
      </div>
      ${renderSubmissionPayload(item)}
      <label class="admin-review-label">管理メモ
        <textarea class="admin-review-note" rows="3" maxlength="500">${esc(item.reviewNote || "")}</textarea>
      </label>
      <div class="admin-card-actions">
        <button class="admin-button primary" type="button" data-decision="approve">承認して掲載</button>
        <button class="admin-button danger" type="button" data-decision="reject">掲載不可</button>
      </div>`;
    const disabled = item.status !== "確認待ち";
    article.querySelectorAll("[data-decision]").forEach((button) => {
      button.disabled = disabled;
      button.addEventListener("click", async () => {
        const decision = button.dataset.decision;
        const label = decision === "approve" ? "この申請を承認して掲載しますか？" : "この申請を掲載不可にしますか？";
        if (!window.confirm(label)) return;
        article.querySelectorAll("button").forEach((itemButton) => { itemButton.disabled = true; });
        try {
          await api("adminDecideSubmission", {
            submissionId: item.submissionId,
            decision,
            reviewNote: article.querySelector(".admin-review-note").value
          });
          await loadSubmissions(true);
        } catch (error) {
          window.alert(error.message);
          article.querySelectorAll("[data-decision]").forEach((itemButton) => { itemButton.disabled = false; });
        }
      });
    });
    root.appendChild(article);
  });
}

async function loadSubmissions(reset) {
  const box = $("submissionList");
  if (reset) {
    state.submissions.offset = 0;
    box.innerHTML = '<div class="admin-empty">読み込んでいます。</div>';
  }
  try {
    const data = await api("adminListSubmissions", {
      q: $("submissionQuery").value,
      type: $("submissionType").value,
      status: $("submissionStatus").value,
      offset: state.submissions.offset,
      limit: 30
    });
    if (reset) box.innerHTML = "";
    renderSubmissions(data.items || [], box);
    state.submissions.offset = data.nextOffset || 0;
    state.submissions.hasMore = Boolean(data.hasMore);
    $("submissionMore").hidden = !data.hasMore;
    if (!box.children.length) box.innerHTML = '<div class="admin-empty">該当する申請はありません。</div>';
  } catch (error) {
    handleAdminError(error, box);
  }
}

function profileCard(item) {
  const data = item.data || {};
  return `
    <article class="admin-card admin-content-card">
      <div class="admin-card-head">
        <div><span class="admin-badge">VTuber</span><h3>${esc(data.activityName)}</h3><p>${esc([data.reading, data.affiliation].filter(Boolean).join(" / "))}</p></div>
        <span class="admin-status-badge">${esc(data.status || "公開")}</span>
      </div>
      <dl class="admin-data-grid">
        <div><dt>X</dt><dd>${safeUrl(data.xUrl) ? `<a href="${esc(data.xUrl)}" target="_blank" rel="noopener noreferrer">リンクを開く</a>` : "未登録"}</dd></div>
        <div><dt>YouTube</dt><dd>${safeUrl(data.youtubeUrl) ? `<a href="${esc(data.youtubeUrl)}" target="_blank" rel="noopener noreferrer">チャンネルを開く</a>` : "未登録"}</dd></div>
      </dl>
      <div class="admin-card-actions">
        <button class="admin-button primary" type="button" data-edit>編集</button>
        <button class="admin-button danger" type="button" data-delete>削除</button>
      </div>
    </article>`;
}

function recommendationCard(item) {
  const data = item.data || {};
  const thumb = safeUrl(data.thumbnailUrl);
  return `
    <article class="admin-card admin-content-card">
      <div class="admin-card-head">
        <div><span class="admin-badge">おすすめ動画</span><h3>${esc(data.activityName)}</h3><p>${esc(fmtDate(data.approvedAt))}</p></div>
        <span class="admin-status-badge">${esc(data.publicStatus || "公開中")}</span>
      </div>
      ${thumb ? `<a class="admin-thumbnail" href="${esc(data.videoUrl)}" target="_blank" rel="noopener noreferrer"><img src="${esc(thumb)}" alt="${esc(data.activityName)}のおすすめ動画サムネイル"></a>` : ""}
      <div class="admin-point"><strong>おすすめポイント</strong><p>${esc(data.recommendationPoint || "").replace(/\r?\n/g, "<br>")}</p></div>
      <div class="admin-card-actions">
        <button class="admin-button primary" type="button" data-edit>編集</button>
        <button class="admin-button danger" type="button" data-delete>削除</button>
      </div>
    </article>`;
}

function bindContentActions(article, item, type) {
  article.querySelector("[data-edit]").addEventListener("click", () => openEditDialog(type, item));
  article.querySelector("[data-delete]").addEventListener("click", async () => {
    const message = type === "profile"
      ? `「${item.data.activityName}」を削除しますか？\n紐づくおすすめ動画もすべて削除されます。`
      : `「${item.data.activityName}」のこのおすすめ動画を削除しますか？`;
    if (!window.confirm(message)) return;
    try {
      await api(type === "profile" ? "adminDeleteProfile" : "adminDeleteRecommendation", { id: item.id });
      if (type === "profile") await loadProfiles(true);
      else await loadRecommendations(true);
    } catch (error) {
      window.alert(error.message);
    }
  });
}

async function loadProfiles(reset) {
  const box = $("profileAdminList");
  if (reset) {
    state.profiles.offset = 0;
    box.innerHTML = '<div class="admin-empty">読み込んでいます。</div>';
  }
  try {
    const data = await api("adminListProfiles", {
      q: $("profileAdminQuery").value,
      offset: state.profiles.offset,
      limit: 30
    });
    if (reset) box.innerHTML = "";
    (data.items || []).forEach((item) => {
      const holder = document.createElement("div");
      holder.innerHTML = profileCard(item);
      const article = holder.firstElementChild;
      bindContentActions(article, item, "profile");
      box.appendChild(article);
    });
    state.profiles.offset = data.nextOffset || 0;
    $("profileAdminMore").hidden = !data.hasMore;
    if (!box.children.length) box.innerHTML = '<div class="admin-empty">該当するVTuberはいません。</div>';
  } catch (error) {
    handleAdminError(error, box);
  }
}

async function loadRecommendations(reset) {
  const box = $("recommendationAdminList");
  if (reset) {
    state.recommendations.offset = 0;
    box.innerHTML = '<div class="admin-empty">読み込んでいます。</div>';
  }
  try {
    const data = await api("adminListRecommendations", {
      q: $("recommendationAdminQuery").value,
      offset: state.recommendations.offset,
      limit: 30
    });
    if (reset) box.innerHTML = "";
    (data.items || []).forEach((item) => {
      const holder = document.createElement("div");
      holder.innerHTML = recommendationCard(item);
      const article = holder.firstElementChild;
      bindContentActions(article, item, "recommendation");
      box.appendChild(article);
    });
    state.recommendations.offset = data.nextOffset || 0;
    $("recommendationAdminMore").hidden = !data.hasMore;
    if (!box.children.length) box.innerHTML = '<div class="admin-empty">該当するおすすめ動画はありません。</div>';
  } catch (error) {
    handleAdminError(error, box);
  }
}

function inputField(label, name, value, type = "text") {
  if (type === "textarea") return `<label>${esc(label)}<textarea name="${esc(name)}" rows="5" maxlength="800">${esc(value || "")}</textarea></label>`;
  if (type === "select") return `<label>${esc(label)}<select name="${esc(name)}"><option value="公開中" ${value === "公開中" ? "selected" : ""}>公開中</option><option value="非公開" ${value === "非公開" ? "selected" : ""}>非公開</option></select></label>`;
  if (type === "profileStatus") return `<label>${esc(label)}<select name="${esc(name)}"><option value="公開" ${value === "公開" ? "selected" : ""}>公開</option><option value="非公開" ${value === "非公開" ? "selected" : ""}>非公開</option></select></label>`;
  return `<label>${esc(label)}<input name="${esc(name)}" type="${esc(type)}" value="${esc(value || "")}"></label>`;
}

function openEditDialog(type, item) {
  state.edit = { type, item };
  const data = item.data || {};
  $("adminEditMessage").textContent = "";
  if (type === "profile") {
    $("adminEditTitle").textContent = "公開VTuberを編集";
    $("adminEditFields").innerHTML = [
      inputField("活動名", "activityName", data.activityName),
      inputField("活動名（よみかた）", "reading", data.reading),
      inputField("個人 or 企業名", "affiliation", data.affiliation),
      inputField("X（旧Twitter）のリンク", "xUrl", data.xUrl, "url"),
      inputField("YouTubeチャンネルのリンク", "youtubeUrl", data.youtubeUrl, "url"),
      inputField("公開状態", "status", data.status || "公開", "profileStatus")
    ].join("");
  } else {
    $("adminEditTitle").textContent = "公開おすすめを編集";
    $("adminEditFields").innerHTML = [
      inputField("おすすめ動画リンク", "videoUrl", data.videoUrl, "url"),
      inputField("おすすめポイント", "recommendationPoint", data.recommendationPoint, "textarea"),
      inputField("公開状態", "publicStatus", data.publicStatus || "公開中", "select")
    ].join("");
  }
  $("adminEditDialog").showModal();
}

function closeEditDialog() {
  state.edit = null;
  $("adminEditDialog").close();
}

$("adminEditClose").addEventListener("click", closeEditDialog);
$("adminEditCancel").addEventListener("click", closeEditDialog);
$("adminEditDialog").addEventListener("click", (event) => {
  if (event.target === $("adminEditDialog")) closeEditDialog();
});

$("adminEditForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.edit) return;
  const button = $("adminEditSave");
  const message = $("adminEditMessage");
  const data = Object.fromEntries(new FormData(event.currentTarget).entries());
  button.disabled = true;
  message.textContent = "";
  try {
    if (state.edit.type === "profile") {
      await api("adminUpdateProfile", { id: state.edit.item.id, data });
      closeEditDialog();
      await loadProfiles(true);
    } else {
      await api("adminUpdateRecommendation", { id: state.edit.item.id, data });
      closeEditDialog();
      await loadRecommendations(true);
    }
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("submissionSearch").addEventListener("click", () => loadSubmissions(true));
$("submissionMore").addEventListener("click", () => loadSubmissions(false));
$("profileAdminSearch").addEventListener("click", () => loadProfiles(true));
$("profileAdminMore").addEventListener("click", () => loadProfiles(false));
$("recommendationAdminSearch").addEventListener("click", () => loadRecommendations(true));
$("recommendationAdminMore").addEventListener("click", () => loadRecommendations(false));

[$("submissionQuery"), $("profileAdminQuery"), $("recommendationAdminQuery")].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (input === $("submissionQuery")) loadSubmissions(true);
    else if (input === $("profileAdminQuery")) loadProfiles(true);
    else loadRecommendations(true);
  });
});

if (state.token) setLoggedIn(true);
