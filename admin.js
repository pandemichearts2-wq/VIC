const API_URL = window.VIC_CONFIG?.API_URL || "";
const $ = (id) => document.getElementById(id);
const VIDEO_GENRES = ["雑談", "歌枠", "ゲーム実況", "お絵描き", "ASMR", "料理", "開封", "旅行・旅", "作業", "企画", "耐久", "コラボ", "案件", "ニュース", "読書・朗読", "その他"];
const state = {
  token: sessionStorage.getItem("vicAdminToken") || "",
  tab: "submissions",
  submissions: { offset: 0, hasMore: false, selected: new Set() },
  feedback: { offset: 0, hasMore: false },
  profiles: { offset: 0, hasMore: false },
  recommendations: { offset: 0, hasMore: false },
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
  return type === "initial" ? "初回登録" : type === "recommendation" ? "おすすめ追加" : type;
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

document.querySelectorAll(".admin-tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab").forEach((item) => item.classList.toggle("active", item === button));
    state.tab = button.dataset.adminTab;
    $("adminPanelSubmissions").hidden = state.tab !== "submissions";
    $("adminPanelFeedback").hidden = state.tab !== "feedback";
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
  else if (state.tab === "feedback") loadFeedback(true);
  else if (state.tab === "profiles") loadProfiles(true);
  else loadRecommendations(true);
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
  return `
    <article class="admin-card admin-content-card">
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
        <div><span class="admin-badge">おすすめ動画</span><h3>${esc(data.activityName)}</h3><p>${esc(data.genre || "その他")} / ${esc(fmtDate(data.approvedAt))}</p></div>
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

async function runSubmissionBulkOperation(operation) {
  const ids = [...state.submissions.selected];
  if (!ids.length) return;
  const isApprove = operation === "approve";
  const message = isApprove
    ? `選択した${ids.length}件の申請を一括承認して掲載しますか？`
    : `選択した${ids.length}件の申請履歴を一括削除しますか？\n公開済みのVTuber・おすすめ動画そのものは削除されません。`;
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

function inputField(label, name, value, type = "text") {
  if (type === "textarea") return `<label>${esc(label)}<textarea name="${esc(name)}" rows="5" maxlength="800">${esc(value || "")}</textarea></label>`;
  if (type === "select") return `<label>${esc(label)}<select name="${esc(name)}"><option value="公開中" ${value === "公開中" ? "selected" : ""}>公開中</option><option value="非公開" ${value === "非公開" ? "selected" : ""}>非公開</option></select></label>`;
  if (type === "profileStatus") return `<label>${esc(label)}<select name="${esc(name)}"><option value="公開" ${value === "公開" ? "selected" : ""}>公開</option><option value="非公開" ${value === "非公開" ? "selected" : ""}>非公開</option></select></label>`;
  if (type === "genreSelect") return `<label>${esc(label)}<select name="${esc(name)}">${VIDEO_GENRES.map((genre) => `<option value="${esc(genre)}" ${genre === (value || "その他") ? "selected" : ""}>${esc(genre)}</option>`).join("")}</select></label>`;
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
  } else {
    $("adminEditTitle").textContent = "公開おすすめを編集";
    $("adminEditFields").innerHTML = [
      inputField("動画ジャンル", "genre", data.genre || "その他", "genreSelect"),
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
$("recommendationAdminSearch").addEventListener("click", () => loadRecommendations(true));
$("recommendationAdminMore").addEventListener("click", () => loadRecommendations(false));

[$("submissionQuery"), $("feedbackAdminQuery"), $("profileAdminQuery"), $("recommendationAdminQuery")].forEach((input) => {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (input === $("submissionQuery")) loadSubmissions(true);
    else if (input === $("feedbackAdminQuery")) loadFeedback(true);
    else if (input === $("profileAdminQuery")) loadProfiles(true);
    else loadRecommendations(true);
  });
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.token) refreshAdminNotificationCounts();
});
window.addEventListener("focus", () => {
  if (state.token) refreshAdminNotificationCounts();
});

if (state.token) setLoggedIn(true);
