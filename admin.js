const API_URL = window.VIC_CONFIG?.API_URL || "";
const $ = (id) => document.getElementById(id);
const VIDEO_GENRES = ["雑談", "歌枠", "ゲーム実況", "お絵描き", "ASMR", "料理", "開封", "旅行・旅", "作業", "企画", "耐久", "コラボ", "案件", "ニュース", "読書・朗読", "その他"];
const FEATURED_CATEGORIES = ["管理人おすすめ歌みた", "管理人おすすめ歌枠"];
const state = {
  token: sessionStorage.getItem("vicAdminToken") || "",
  tab: "submissions",
  submissions: { offset: 0, hasMore: false, selected: new Set() },
  feedback: { offset: 0, hasMore: false },
  profiles: { offset: 0, hasMore: false },
  featured: { items: [] },
  fanart: { offset: 0, hasMore: false },
  edit: null,
  notificationTimer: 0
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

function setNotificationBadge(id, count, label) {
  const badge = $(id);
  if (!badge) return;
  const value = Math.max(0, Number(count) || 0);
  const countElement = badge.querySelector("[data-badge-count]");
  const displayValue = value > 99 ? "99+" : String(value);
  if (countElement) countElement.textContent = displayValue;
  else badge.textContent = displayValue;
  badge.hidden = value === 0;
  badge.setAttribute("aria-label", `${label}${value}件`);
}

async function refreshAdminNotificationCounts() {
  if (!state.token) return;
  try {
    const data = await api("adminNotificationCounts");
    setNotificationBadge("submissionNotificationBadge", data.submissions, "確認待ちの申請");
    const breakdown = data.breakdown || {};
    setNotificationBadge("feedbackUnconfirmedBadge", breakdown.feedbackUnconfirmed, "未確認のお問い合わせ");
    setNotificationBadge("feedbackInProgressBadge", breakdown.feedbackInProgress, "対応中のお問い合わせ");
    const group = $("feedbackNotificationGroup");
    if (group) group.hidden = !(Number(breakdown.feedbackUnconfirmed) || Number(breakdown.feedbackInProgress));
  } catch (error) {
    if (/ログイン|有効期限|セッション/.test(error.message)) {
      logout();
      return;
    }
    console.warn("件数バッジを更新できませんでした。", error);
  }
}

function startNotificationPolling() {
  window.clearInterval(state.notificationTimer);
  state.notificationTimer = window.setInterval(refreshAdminNotificationCounts, 60000);
}

function stopNotificationPolling() {
  window.clearInterval(state.notificationTimer);
  state.notificationTimer = 0;
}

function typeLabel(type) {
  return type === "initial" ? "初回登録" : type === "recommendation" ? "おすすめ追加" : type === "fanartGeneral" ? "通常FA" : type === "fanartAdult" ? "成人向けFA" : type;
}

function setLoggedIn(loggedIn) {
  $("adminLogin").hidden = loggedIn;
  $("adminShell").hidden = !loggedIn;
  if (loggedIn) {
    loadActiveTab();
    refreshAdminNotificationCounts();
    startNotificationPolling();
  } else {
    stopNotificationPolling();
  }
}

function logout() {
  state.token = "";
  sessionStorage.removeItem("vicAdminToken");
  state.submissions.selected.clear();
  syncSubmissionBulkUi();
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

$("adminPageRefresh").addEventListener("click", () => window.location.reload());

document.querySelectorAll(".admin-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((item) => item.classList.toggle("active", item === button));
    state.tab = button.dataset.adminTab;
    $("adminPanelSubmissions").hidden = state.tab !== "submissions";
    $("adminPanelFeedback").hidden = state.tab !== "feedback";
    $("adminPanelProfiles").hidden = state.tab !== "profiles";
    $("adminPanelFeatured").hidden = state.tab !== "featured";
    $("adminPanelFanArt").hidden = state.tab !== "fanart";
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
  else if (state.tab === "feedback") loadFeedback(true);
  else if (state.tab === "profiles") loadProfiles(true);
  else if (state.tab === "featured") loadFeaturedAdmin();
  else if (state.tab === "fanart") loadFanArtsAdmin(true);
}

function syncSubmissionBulkUi() {
  const count = state.submissions.selected.size;
  const countElement = $("submissionSelectedCount");
  if (countElement) countElement.textContent = `${count}件選択`;
  const approve = $("submissionBulkApprove");
  const remove = $("submissionBulkDelete");
  if (approve) approve.disabled = count === 0;
  if (remove) remove.disabled = count === 0;
}

function clearSubmissionSelection() {
  state.submissions.selected.clear();
  document.querySelectorAll("#submissionList [data-submission-check]").forEach((input) => {
    input.checked = false;
    input.closest(".admin-card")?.classList.remove("is-selected");
  });
  syncSubmissionBulkUi();
}

function setVisibleSubmissionSelection(checked) {
  document.querySelectorAll("#submissionList [data-submission-check]").forEach((input) => {
    input.checked = checked;
    const id = String(input.dataset.submissionId || "");
    if (checked) state.submissions.selected.add(id);
    else state.submissions.selected.delete(id);
    input.closest(".admin-card")?.classList.toggle("is-selected", checked);
  });
  syncSubmissionBulkUi();
}

function renderSubmissionPayload(item) {
  const payload = item.payload || {};
  const videoUrl = safeUrl(payload.recommendedVideoUrl);
  const point = esc(payload.recommendationPoint || "").replace(/\r?\n/g, "<br>");
  if (item.submissionType === "fanartGeneral" || item.submissionType === "fanartAdult") {
    const imageUrl = safeUrl(payload.imageUrl);
    return `<div class="admin-fanart-preview"><div>${imageUrl ? `<img src="${esc(imageUrl)}" alt="申請ファンアート" loading="lazy">` : "画像を表示できません"}</div><div><dl class="admin-data-grid"><div><dt>作品名</dt><dd>${esc(payload.title || "無題")}</dd></div><div><dt>作者</dt><dd>${esc(payload.authorName || "匿名")}</dd></div><div><dt>区分</dt><dd>${item.submissionType === "fanartAdult" ? "成人向けFA" : "通常FA"}</dd></div><div><dt>補足</dt><dd>${esc(payload.note || "")}</dd></div></dl>${payload.fileId ? `<div class="admin-fanart-actions"><button class="admin-button admin-download-button" type="button" data-download-fanart data-file-id="${esc(payload.fileId)}">画像をダウンロード</button></div>` : ""}</div></div>`;
  }
  if (item.submissionType === "initial") {
    return `
      <dl class="admin-data-grid">
        <div><dt>活動名</dt><dd>${esc(payload.activityName)}</dd></div>
        <div><dt>よみかた</dt><dd>${esc(payload.reading)}</dd></div>
        <div><dt>個人／企業名</dt><dd>${esc(payload.affiliation)}</dd></div>
        <div><dt>X</dt><dd>${safeUrl(payload.xUrl) ? `<a href="${esc(payload.xUrl)}" target="_blank" rel="noopener noreferrer">リンクを開く</a>` : ""}</dd></div>
        <div><dt>YouTube</dt><dd>${safeUrl(payload.youtubeUrl) ? `<a href="${esc(payload.youtubeUrl)}" target="_blank" rel="noopener noreferrer">チャンネルを開く</a>` : ""}</dd></div>
        <div><dt>その他リンク1</dt><dd>${safeUrl(payload.otherLink1) ? `<a href="${esc(payload.otherLink1)}" target="_blank" rel="noopener noreferrer">リンクを開く</a>` : ""}</dd></div>
        <div><dt>その他リンク2</dt><dd>${safeUrl(payload.otherLink2) ? `<a href="${esc(payload.otherLink2)}" target="_blank" rel="noopener noreferrer">リンクを開く</a>` : ""}</dd></div>
        <div><dt>その他リンク3</dt><dd>${safeUrl(payload.otherLink3) ? `<a href="${esc(payload.otherLink3)}" target="_blank" rel="noopener noreferrer">リンクを開く</a>` : ""}</dd></div>
        <div><dt>動画ジャンル</dt><dd>${esc(payload.genre || "その他")}</dd></div>
        <div><dt>おすすめ動画</dt><dd>${videoUrl ? `<a href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer">動画を開く</a>` : ""}</dd></div>
      </dl>
      <div class="admin-point"><strong>おすすめポイント</strong><p>${point}</p></div>`;
  }
  return `
    <dl class="admin-data-grid">
      <div><dt>追加先</dt><dd>${esc(payload.activityName)}</dd></div>
      <div><dt>動画ジャンル</dt><dd>${esc(payload.genre || "その他")}</dd></div>
      <div><dt>おすすめ動画</dt><dd>${videoUrl ? `<a href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer">動画を開く</a>` : ""}</dd></div>
    </dl>
    <div class="admin-point"><strong>おすすめポイント</strong><p>${point}</p></div>`;
}

function renderSubmissions(items, root) {
  items.forEach((item) => {
    const article = document.createElement("article");
    const submissionId = String(item.submissionId || "");
    const checked = state.submissions.selected.has(submissionId);
    article.className = `admin-card${checked ? " is-selected" : ""}`;
    article.innerHTML = `
      <div class="admin-card-head">
        <div class="admin-card-heading">
          <label class="admin-select-control">
            <input data-submission-check data-submission-id="${esc(submissionId)}" type="checkbox" ${checked ? "checked" : ""}>
            <span>選択</span>
          </label>
          <div>
            <span class="admin-badge">${esc(typeLabel(item.submissionType))}</span>
            <h3>${esc(item.activityName || "活動名未設定")}</h3>
            <p>${esc(item.submissionId)} / ${esc(fmtDate(item.receivedAt))}</p>
          </div>
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

    const checkbox = article.querySelector("[data-submission-check]");
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) state.submissions.selected.add(submissionId);
      else state.submissions.selected.delete(submissionId);
      article.classList.toggle("is-selected", checkbox.checked);
      syncSubmissionBulkUi();
    });

    article.querySelector("[data-download-fanart]")?.addEventListener("click", async (event) => {
      const button = event.currentTarget; button.disabled = true;
      try { await downloadFanArtFile(button.dataset.fileId); } catch (error) { window.alert(error.message); } finally { button.disabled = false; }
    });

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
          await refreshAdminNotificationCounts();
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
    state.submissions.selected.clear();
    syncSubmissionBulkUi();
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
    syncSubmissionBulkUi();
    if (reset) refreshAdminNotificationCounts();
  } catch (error) {
    handleAdminError(error, box);
  }
}


function renderFeedback(items, root) {
  items.forEach((item) => {
    const article = document.createElement("article");
    article.className = "admin-card";
    article.innerHTML = `
      <div class="admin-card-head">
        <div>
          <span class="admin-badge">お問い合わせ</span>
          <h3>${esc(item.relatedActivityName || "サイト全般")}</h3>
          <p>${esc(item.feedbackId)} / ${esc(fmtDate(item.receivedAt))}</p>
        </div>
        <span class="admin-status-badge">${esc(item.status || "未確認")}</span>
      </div>
      <div class="admin-feedback-message">${esc(item.message || "")}</div>
      ${item.pageUrl ? `<p class="admin-feedback-page">送信ページ：<a href="${esc(item.pageUrl)}" target="_blank" rel="noopener noreferrer">ページを開く</a></p>` : ""}
      <div class="admin-feedback-controls">
        <label>対応状況
          <select class="admin-feedback-status">
            <option value="未確認">未確認</option>
            <option value="対応中">対応中</option>
            <option value="対応済み">対応済み</option>
            <option value="対応不要">対応不要</option>
          </select>
        </label>
        <label>対応メモ
          <textarea class="admin-feedback-note" rows="3" maxlength="1000">${esc(item.reviewNote || "")}</textarea>
        </label>
        <button class="admin-button primary" type="button">保存</button>
      </div>`;
    const select = article.querySelector(".admin-feedback-status");
    select.value = item.status || "未確認";
    article.querySelector("button.admin-button").addEventListener("click", async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        await api("adminUpdateFeedback", {
          feedbackId: item.feedbackId,
          status: select.value,
          reviewNote: article.querySelector(".admin-feedback-note").value
        });
        await loadFeedback(true);
        await refreshAdminNotificationCounts();
      } catch (error) {
        window.alert(error.message);
        button.disabled = false;
      }
    });
    root.appendChild(article);
  });
}

async function loadFeedback(reset) {
  const box = $("feedbackAdminList");
  if (reset) {
    state.feedback.offset = 0;
    box.innerHTML = '<div class="admin-empty">読み込んでいます。</div>';
  }
  try {
    const data = await api("adminListFeedback", {
      q: $("feedbackAdminQuery").value,
      status: $("feedbackAdminStatus").value,
      offset: state.feedback.offset,
      limit: 30
    });
    if (reset) box.innerHTML = "";
    renderFeedback(data.items || [], box);
    state.feedback.offset = data.nextOffset || 0;
    state.feedback.hasMore = Boolean(data.hasMore);
    $("feedbackAdminMore").hidden = !data.hasMore;
    if (!box.children.length) box.innerHTML = '<div class="admin-empty">該当するお問い合わせはありません。</div>';
  } catch (error) {
    handleAdminError(error, box);
  }
}

function profileCard(item) {
  const data = item.data || {};
  const recommendationCount = Math.max(0, Number(item.recommendationCount) || 0);
  return `
    <article class="admin-card admin-content-card" data-profile-card="${esc(item.id)}">
      <div class="admin-card-head">
        <div><span class="admin-badge">VTuber</span><h3>${esc(data.activityName)}</h3><p>${esc([data.reading, data.affiliation].filter(Boolean).join(" / "))}</p></div>
        <span class="admin-status-badge">${esc(data.status || "公開")}</span>
      </div>
      <dl class="admin-data-grid">
        <div><dt>X</dt><dd>${safeUrl(data.xUrl) ? `<a href="${esc(data.xUrl)}" target="_blank" rel="noopener noreferrer">リンクを開く</a>` : "未登録"}</dd></div>
        <div><dt>YouTube</dt><dd>${safeUrl(data.youtubeUrl) ? `<a href="${esc(data.youtubeUrl)}" target="_blank" rel="noopener noreferrer">チャンネルを開く</a>` : "未登録"}</dd></div>
        <div><dt>その他リンク1</dt><dd>${safeUrl(data.otherLink1) ? `<a href="${esc(data.otherLink1)}" target="_blank" rel="noopener noreferrer">リンクを開く</a>` : "未登録"}</dd></div>
        <div><dt>その他リンク2</dt><dd>${safeUrl(data.otherLink2) ? `<a href="${esc(data.otherLink2)}" target="_blank" rel="noopener noreferrer">リンクを開く</a>` : "未登録"}</dd></div>
        <div><dt>その他リンク3</dt><dd>${safeUrl(data.otherLink3) ? `<a href="${esc(data.otherLink3)}" target="_blank" rel="noopener noreferrer">リンクを開く</a>` : "未登録"}</dd></div>
      </dl>
      <details class="admin-profile-recommendations">
        <summary>
          <span>おすすめ動画</span>
          <strong data-recommendation-count>${recommendationCount}件</strong>
        </summary>
        <div class="admin-profile-recommendation-list" data-profile-recommendation-list>
          ${recommendationCount ? '<div class="admin-recommendation-loading">開くとおすすめ動画を読み込みます。</div>' : '<div class="admin-recommendation-empty">登録されているおすすめ動画はありません。</div>'}
        </div>
      </details>
      <div class="admin-card-actions">
        <button class="admin-button primary" type="button" data-edit-profile>VTuber情報を編集</button>
        <button class="admin-button danger" type="button" data-delete-profile>VTuberを削除</button>
      </div>
    </article>`;
}

function recommendationCard(item) {
  const data = item.data || {};
  const thumb = safeUrl(data.thumbnailUrl);
  const videoUrl = safeUrl(data.videoUrl);
  return `
    <article class="admin-recommendation-item">
      <div class="admin-recommendation-item-head">
        <div>
          <span class="admin-badge">${esc(data.genre || "その他")}</span>
          <p>${esc(fmtDate(data.approvedAt))}</p>
        </div>
        <span class="admin-status-badge">${esc(data.publicStatus || "公開中")}</span>
      </div>
      <div class="admin-recommendation-item-body">
        ${thumb && videoUrl ? `<a class="admin-recommendation-thumbnail" href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer"><img src="${esc(thumb)}" alt="${esc(data.activityName)}のおすすめ動画サムネイル"></a>` : ""}
        <div class="admin-recommendation-copy">
          <div class="admin-point"><strong>おすすめポイント</strong><p>${esc(data.recommendationPoint || "").replace(/\r?\n/g, "<br>")}</p></div>
          ${videoUrl ? `<a class="admin-video-link" href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer">YouTubeで動画を開く ↗</a>` : ""}
        </div>
      </div>
      <div class="admin-card-actions admin-recommendation-actions">
        <button class="admin-button primary" type="button" data-edit-recommendation>おすすめを編集</button>
        <button class="admin-button danger" type="button" data-delete-recommendation>おすすめを削除</button>
      </div>
    </article>`;
}

async function loadProfileRecommendations(details, profileId, force = false) {
  const list = details.querySelector("[data-profile-recommendation-list]");
  if (!list || (!force && details.dataset.loaded === "true")) return;
  details.dataset.loaded = "loading";
  list.innerHTML = '<div class="admin-recommendation-loading">読み込んでいます。</div>';
  try {
    const data = await api("adminListProfileRecommendations", { profileId });
    const items = data.items || [];
    list.innerHTML = "";
    items.forEach((item) => {
      const holder = document.createElement("div");
      holder.innerHTML = recommendationCard(item);
      const article = holder.firstElementChild;
      bindRecommendationActions(article, item);
      list.appendChild(article);
    });
    if (!items.length) list.innerHTML = '<div class="admin-recommendation-empty">登録されているおすすめ動画はありません。</div>';
    const count = details.querySelector("[data-recommendation-count]");
    if (count) count.textContent = `${items.length}件`;
    details.dataset.loaded = "true";
  } catch (error) {
    details.dataset.loaded = "false";
    list.innerHTML = `<div class="admin-recommendation-empty">${esc(error.message)}</div>`;
  }
}

function bindRecommendationActions(article, item) {
  article.querySelector("[data-edit-recommendation]").addEventListener("click", () => openEditDialog("recommendation", item));
  article.querySelector("[data-delete-recommendation]").addEventListener("click", async () => {
    if (!window.confirm(`「${item.data.activityName}」のこのおすすめ動画を削除しますか？`)) return;
    try {
      await api("adminDeleteRecommendation", { id: item.id });
      await loadProfiles(true);
    } catch (error) {
      window.alert(error.message);
    }
  });
}

function bindProfileActions(article, item) {
  article.querySelector("[data-edit-profile]").addEventListener("click", () => openEditDialog("profile", item));
  article.querySelector("[data-delete-profile]").addEventListener("click", async () => {
    if (!window.confirm(`「${item.data.activityName}」を削除しますか？\n紐づくおすすめ動画もすべて削除されます。`)) return;
    try {
      await api("adminDeleteProfile", { id: item.id });
      await loadProfiles(true);
    } catch (error) {
      window.alert(error.message);
    }
  });
  const details = article.querySelector(".admin-profile-recommendations");
  details.addEventListener("toggle", () => {
    if (details.open) loadProfileRecommendations(details, item.id);
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
      bindProfileActions(article, item);
      box.appendChild(article);
    });
    state.profiles.offset = data.nextOffset || 0;
    $("profileAdminMore").hidden = !data.hasMore;
    if (!box.children.length) box.innerHTML = '<div class="admin-empty">該当するVTuberはいません。</div>';
  } catch (error) {
    handleAdminError(error, box);
  }
}

function featuredCard(item) {
  const data = item.data || {};
  const videoUrl = safeUrl(data.videoUrl);
  const thumbnailUrl = safeUrl(data.thumbnailUrl);
  return `
    <article class="admin-card admin-featured-admin-card">
      <div class="admin-featured-admin-media">
        ${videoUrl && thumbnailUrl ? `<a href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer"><img src="${esc(thumbnailUrl)}" alt="${esc(data.category || "管理人おすすめ")}のサムネイル"></a>` : ""}
      </div>
      <div class="admin-featured-admin-copy">
        <div class="admin-card-head">
          <div><span class="admin-badge">管理人おすすめ</span><h3>${esc(data.category || "管理人おすすめ")}</h3><p>${esc(fmtDate(data.updatedAt || data.createdAt))}</p></div>
          <span class="admin-status-badge">${esc(data.publicStatus || "公開中")}</span>
        </div>
        ${videoUrl ? `<a class="admin-video-link" href="${esc(videoUrl)}" target="_blank" rel="noopener noreferrer">YouTubeで動画を開く ↗</a>` : ""}
        <div class="admin-card-actions">
          <button class="admin-button primary" type="button" data-edit-featured>編集</button>
          <button class="admin-button danger" type="button" data-delete-featured>削除</button>
        </div>
      </div>
    </article>`;
}

function bindFeaturedActions(article, item) {
  article.querySelector("[data-edit-featured]").addEventListener("click", () => openEditDialog("featured", item));
  article.querySelector("[data-delete-featured]").addEventListener("click", async () => {
    if (!window.confirm(`「${item.data.category || "管理人おすすめ"}」を削除しますか？`)) return;
    try {
      await api("adminDeleteFeaturedVideo", { id: item.id });
      await loadFeaturedAdmin();
    } catch (error) {
      window.alert(error.message);
    }
  });
}

async function loadFeaturedAdmin() {
  const box = $("featuredAdminList");
  if (!box) return;
  box.innerHTML = '<div class="admin-empty">読み込んでいます。</div>';
  try {
    const data = await api("adminListFeaturedVideos");
    state.featured.items = data.items || [];
    box.innerHTML = "";
    state.featured.items.forEach((item) => {
      const holder = document.createElement("div");
      holder.innerHTML = featuredCard(item);
      const article = holder.firstElementChild;
      bindFeaturedActions(article, item);
      box.appendChild(article);
    });
    if (!box.children.length) box.innerHTML = '<div class="admin-empty">管理人おすすめはまだ登録されていません。</div>';
  } catch (error) {
    handleAdminError(error, box);
  }
}

async function runSubmissionBulkOperation(operation) {
  const ids = [...state.submissions.selected];
  if (!ids.length) return;
  const isApprove = operation === "approve";
  const message = isApprove
    ? `選択した${ids.length}件の申請を一括承認して掲載しますか？`
    : `選択した${ids.length}件の申請履歴を一括削除しますか？\n確認待ちのFA画像はGoogle Driveのゴミ箱へ移動します。\n公開済みのVTuber・おすすめ動画・FAそのものは削除されません。`;
  if (!window.confirm(message)) return;

  const buttons = [$("submissionBulkApprove"), $("submissionBulkDelete"), $("submissionSelectAll"), $("submissionClearAll")].filter(Boolean);
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const data = await api("adminBulkSubmissions", { operation, submissionIds: ids });
    const summary = `${data.success || 0}件を処理しました。${data.failed ? `\n${data.failed}件は処理できませんでした。` : ""}`;
    if (Array.isArray(data.errors) && data.errors.length) {
      const details = data.errors.slice(0, 10).map((item) => `${item.submissionId}: ${item.message}`).join("\n");
      window.alert(`${summary}\n\n${details}${data.errors.length > 10 ? "\nほかにもエラーがあります。" : ""}`);
    } else {
      window.alert(summary);
    }
    await loadSubmissions(true);
    await refreshAdminNotificationCounts();
  } catch (error) {
    window.alert(error.message);
  } finally {
    buttons.forEach((button) => { button.disabled = false; });
    syncSubmissionBulkUi();
  }
}


function base64ToBlob(base64, mimeType) {
  const binary = atob(String(base64 || ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType || "application/octet-stream" });
}
async function downloadFanArtFile(fileId) {
  const data = await api("adminDownloadFanArt", { fileId });
  const url = URL.createObjectURL(base64ToBlob(data.base64, data.mimeType));
  const link = document.createElement("a"); link.href = url; link.download = String(data.fileName || "fanart-image").replace(/[\\/:*?"<>|]/g, "_");
  document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function fanArtAdminCard(item) {
  const data=item.data||{},imageUrl=safeUrl(data.imageUrl),adult=item.category==="adult";
  return `<article class="admin-card admin-fanart-card${adult?" is-adult":""}"><div class="admin-card-head"><div><span class="admin-badge">${adult?"成人向けFA":"通常FA"}</span><h3>${esc(data.title||"無題のFA")}</h3><p>${esc(data.activityName||"")} / ${esc(data.authorName||"匿名")} / ${esc(fmtDate(data.approvedAt))}</p></div><span class="admin-status-badge">${esc(data.publicStatus||"公開中")}</span></div><div class="admin-fanart-preview"><div>${imageUrl?`<img src="${esc(imageUrl)}" alt="${esc(data.title||"FA画像")}" loading="lazy">`:"画像を表示できません"}</div><div><div class="admin-point"><strong>補足</strong><p>${esc(data.note||"").replace(/\\r?\\n/g,"<br>")}</p></div><div class="admin-fanart-actions"><button class="admin-button primary" type="button" data-edit-fanart>FA情報を編集</button><button class="admin-button admin-download-button" type="button" data-download-public-fanart>画像をダウンロード</button><button class="admin-button danger" type="button" data-delete-fanart>FAを削除</button></div></div></div></article>`;
}
function bindFanArtActions(article,item){
  article.querySelector("[data-edit-fanart]").addEventListener("click",()=>openEditDialog("fanart",item));
  article.querySelector("[data-download-public-fanart]").addEventListener("click",async e=>{const button=e.currentTarget;button.disabled=true;try{await downloadFanArtFile(item.data.fileId);}catch(error){window.alert(error.message);}finally{button.disabled=false;}});
  article.querySelector("[data-delete-fanart]").addEventListener("click",async()=>{if(!window.confirm(`「${item.data.title||"無題のFA"}」を画像ファイルごと削除しますか？`))return;try{await api("adminDeleteFanArt",{id:item.id,category:item.category});await loadFanArtsAdmin(true);}catch(error){window.alert(error.message);}});
}
async function loadFanArtsAdmin(reset){
  const box=$("fanArtAdminList");if(!box)return;if(reset){state.fanart.offset=0;box.innerHTML='<div class="admin-empty">読み込んでいます。</div>';}
  try{const data=await api("adminListFanArts",{category:$("fanArtAdminCategory").value,q:$("fanArtAdminQuery").value,offset:state.fanart.offset,limit:30});if(reset)box.innerHTML="";(data.items||[]).forEach(item=>{const holder=document.createElement("div");holder.innerHTML=fanArtAdminCard(item);const article=holder.firstElementChild;bindFanArtActions(article,item);box.appendChild(article);});state.fanart.offset=data.nextOffset||0;state.fanart.hasMore=Boolean(data.hasMore);$("fanArtAdminMore").hidden=!data.hasMore;if(!box.children.length)box.innerHTML='<div class="admin-empty">該当する公開FAはありません。</div>';}catch(error){handleAdminError(error,box);}
}

function inputField(label, name, value, type = "text") {
  if (type === "textarea") return `<label>${esc(label)}<textarea name="${esc(name)}" rows="5" maxlength="800">${esc(value || "")}</textarea></label>`;
  if (type === "select") return `<label>${esc(label)}<select name="${esc(name)}"><option value="公開中" ${value === "公開中" ? "selected" : ""}>公開中</option><option value="非公開" ${value === "非公開" ? "selected" : ""}>非公開</option></select></label>`;
  if (type === "profileStatus") return `<label>${esc(label)}<select name="${esc(name)}"><option value="公開" ${value === "公開" ? "selected" : ""}>公開</option><option value="非公開" ${value === "非公開" ? "selected" : ""}>非公開</option></select></label>`;
  if (type === "genreSelect") return `<label>${esc(label)}<select name="${esc(name)}">${VIDEO_GENRES.map((genre) => `<option value="${esc(genre)}" ${genre === (value || "その他") ? "selected" : ""}>${esc(genre)}</option>`).join("")}</select></label>`;
  if (type === "featuredCategory") return `<label>${esc(label)}<select name="${esc(name)}">${FEATURED_CATEGORIES.map((category) => `<option value="${esc(category)}" ${category === value ? "selected" : ""}>${esc(category)}</option>`).join("")}</select></label>`;
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
      inputField("その他リンク1", "otherLink1", data.otherLink1, "url"),
      inputField("その他リンク2", "otherLink2", data.otherLink2, "url"),
      inputField("その他リンク3", "otherLink3", data.otherLink3, "url"),
      inputField("公開状態", "status", data.status || "公開", "profileStatus")
    ].join("");
  } else if (type === "recommendation") {
    $("adminEditTitle").textContent = "おすすめ動画を編集";
    $("adminEditFields").innerHTML = [
      inputField("動画ジャンル", "genre", data.genre || "その他", "genreSelect"),
      inputField("おすすめ動画リンク", "videoUrl", data.videoUrl, "url"),
      inputField("おすすめポイント", "recommendationPoint", data.recommendationPoint, "textarea"),
      inputField("公開状態", "publicStatus", data.publicStatus || "公開中", "select")
    ].join("");
  } else if (type === "fanart") {
    $("adminEditTitle").textContent = "公開FAを編集";
    $("adminEditFields").innerHTML = [
      inputField("VTuberの活動名", "activityName", data.activityName), inputField("作品名", "title", data.title),
      inputField("作者名", "authorName", data.authorName), inputField("補足", "note", data.note, "textarea"),
      inputField("公開状態", "publicStatus", data.publicStatus || "公開中", "select")
    ].join("");
  } else {
    $("adminEditTitle").textContent = "管理人おすすめを編集";
    $("adminEditFields").innerHTML = [
      inputField("表示名", "category", data.category || FEATURED_CATEGORIES[0], "featuredCategory"),
      inputField("YouTube動画リンク", "videoUrl", data.videoUrl, "url"),
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
    } else if (state.edit.type === "recommendation") {
      await api("adminUpdateRecommendation", { id: state.edit.item.id, data });
      closeEditDialog();
      await loadProfiles(true);
    } else if (state.edit.type === "fanart") {
      await api("adminUpdateFanArt", { id: state.edit.item.id, category: state.edit.item.category, data });
      closeEditDialog(); await loadFanArtsAdmin(true);
    } else {
      await api("adminUpdateFeaturedVideo", { id: state.edit.item.id, data });
      closeEditDialog(); await loadFeaturedAdmin();
    }
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("featuredAdminForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  const message = $("featuredAdminMessage");
  button.disabled = true;
  message.textContent = "";
  try {
    await api("adminCreateFeaturedVideo", {
      category: $("featuredAdminCategory").value,
      videoUrl: $("featuredAdminVideoUrl").value
    });
    $("featuredAdminVideoUrl").value = "";
    message.textContent = "管理人おすすめに登録しました。";
    await loadFeaturedAdmin();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$("submissionSelectAll").addEventListener("click", () => setVisibleSubmissionSelection(true));
$("submissionClearAll").addEventListener("click", clearSubmissionSelection);
$("submissionBulkApprove").addEventListener("click", () => runSubmissionBulkOperation("approve"));
$("submissionBulkDelete").addEventListener("click", () => runSubmissionBulkOperation("delete"));

$("submissionSearch").addEventListener("click", () => loadSubmissions(true));
$("submissionMore").addEventListener("click", () => loadSubmissions(false));
$("feedbackAdminSearch").addEventListener("click", () => loadFeedback(true));
$("feedbackAdminMore").addEventListener("click", () => loadFeedback(false));
$("profileAdminSearch").addEventListener("click", () => loadProfiles(true));
$("profileAdminMore").addEventListener("click", () => loadProfiles(false));
$("fanArtAdminSearch").addEventListener("click", () => loadFanArtsAdmin(true));
$("fanArtAdminMore").addEventListener("click", () => loadFanArtsAdmin(false));
$("fanArtAdminCategory").addEventListener("change", () => loadFanArtsAdmin(true));

[$("submissionQuery"), $("feedbackAdminQuery"), $("profileAdminQuery"), $("fanArtAdminQuery")].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (input === $("submissionQuery")) loadSubmissions(true);
    else if (input === $("feedbackAdminQuery")) loadFeedback(true);
    else if (input === $("profileAdminQuery")) loadProfiles(true);
    else if (input === $("fanArtAdminQuery")) loadFanArtsAdmin(true);
  });
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.token) refreshAdminNotificationCounts();
});
window.addEventListener("focus", () => {
  if (state.token) refreshAdminNotificationCounts();
});

if (state.token) setLoggedIn(true);
