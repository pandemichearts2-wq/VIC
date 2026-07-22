const VIC_FEEDBACK_API_URL = window.VIC_CONFIG?.API_URL || "";

function feedbackEsc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

async function feedbackRequest(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`通信に失敗しました（${response.status}）`);
  const data = await response.json();
  if (!data.ok) throw new Error(data.message || "処理できませんでした。");
  return data;
}

async function searchFeedbackProfiles(query) {
  if (!VIC_FEEDBACK_API_URL || !String(query || "").trim()) return [];
  const url = new URL(VIC_FEEDBACK_API_URL);
  url.searchParams.set("action", "profileSearch");
  url.searchParams.set("q", String(query).trim());
  url.searchParams.set("limit", "20");
  url.searchParams.set("nonce", String(Date.now()));
  const data = await feedbackRequest(url.toString(), { method: "GET", cache: "no-store" });
  return Array.isArray(data.profiles) ? data.profiles : [];
}

async function submitFeedback(payload) {
  if (!VIC_FEEDBACK_API_URL) throw new Error("API URLが設定されていません。");
  return feedbackRequest(VIC_FEEDBACK_API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: "submitFeedback", ...payload })
  });
}

function setupFeedbackForm() {
  const byId = (id) => document.getElementById(id);
  const dialog = byId("feedbackDialog");
  const openButton = byId("feedbackToggle");
  const form = byId("feedbackForm");
  const message = byId("feedbackMessage");
  const count = byId("feedbackCount");
  const submit = byId("feedbackSubmit");
  const status = byId("feedbackStatus");
  const profileSearch = byId("feedbackProfileSearch");
  const profileSuggestions = byId("feedbackProfileSuggestions");
  const profileId = byId("feedbackProfileId");
  const activityName = byId("feedbackActivityName");
  const profileSelected = byId("feedbackProfileSelected");
  const profileClear = byId("feedbackProfileClear");
  if (!dialog || !openButton || !form || !message || !count || !submit || !status) return;

  let lastFocusedElement = null;
  let feedbackSearchTimer = 0;
  let feedbackSearchRequest = 0;

  const closeProfileSuggestions = () => {
    if (!profileSuggestions) return;
    profileSuggestions.hidden = true;
    profileSuggestions.innerHTML = "";
  };

  const clearSelectedProfile = (clearText = true) => {
    if (profileId) profileId.value = "";
    if (activityName) activityName.value = "";
    if (profileSelected) profileSelected.textContent = "該当VTuber：未選択";
    if (profileClear) profileClear.hidden = true;
    if (clearText && profileSearch) profileSearch.value = "";
    closeProfileSuggestions();
  };

  const selectFeedbackProfile = (profile) => {
    if (profileId) profileId.value = String(profile.profileId || "");
    if (activityName) activityName.value = String(profile.activityName || "");
    if (profileSearch) profileSearch.value = String(profile.activityName || "");
    if (profileSelected) profileSelected.textContent = `該当VTuber：${profile.activityName || "未選択"}`;
    if (profileClear) profileClear.hidden = false;
    closeProfileSuggestions();
  };

  const renderProfileSuggestions = (profiles) => {
    if (!profileSuggestions) return;
    if (!profiles.length) {
      profileSuggestions.innerHTML = '<p class="feedback-profile-no-result">一致する登録済みVTuberが見つかりません。</p>';
      profileSuggestions.hidden = false;
      return;
    }
    profileSuggestions.innerHTML = profiles.map((profile, index) => `
      <button type="button" role="option" data-profile-index="${index}">
        <strong>${feedbackEsc(profile.activityName || "")}</strong>
        <span>${feedbackEsc([profile.reading, profile.affiliation].filter(Boolean).join(" / "))}</span>
      </button>`).join("");
    profileSuggestions.querySelectorAll("[data-profile-index]").forEach((button) => {
      button.addEventListener("click", () => selectFeedbackProfile(profiles[Number(button.dataset.profileIndex)]));
    });
    profileSuggestions.hidden = false;
  };

  profileSearch?.addEventListener("input", () => {
    if (profileId && profileSearch.value !== activityName?.value && profileId.value) clearSelectedProfile(false);
    clearTimeout(feedbackSearchTimer);
    const query = profileSearch.value.trim();
    if (!query) {
      closeProfileSuggestions();
      return;
    }
    feedbackSearchTimer = window.setTimeout(async () => {
      const requestId = ++feedbackSearchRequest;
      try {
        const profiles = await searchFeedbackProfiles(query);
        if (requestId === feedbackSearchRequest) renderProfileSuggestions(profiles);
      } catch (error) {
        console.error(error);
        if (requestId === feedbackSearchRequest && profileSuggestions) {
          profileSuggestions.innerHTML = '<p class="feedback-profile-no-result">候補を取得できませんでした。</p>';
          profileSuggestions.hidden = false;
        }
      }
    }, 280);
  });

  profileClear?.addEventListener("click", () => clearSelectedProfile(true));

  const setDialogOpen = (open) => {
    if (open) {
      lastFocusedElement = document.activeElement;
      dialog.hidden = false;
      document.body.classList.add("feedback-dialog-open");
      openButton.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => message.focus());
    } else {
      dialog.hidden = true;
      document.body.classList.remove("feedback-dialog-open");
      openButton.setAttribute("aria-expanded", "false");
      closeProfileSuggestions();
      if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
    }
  };

  const sync = () => {
    const length = message.value.length;
    count.textContent = `${length} / 3000`;
    submit.disabled = message.value.trim().length < 5;
  };

  openButton.addEventListener("click", () => setDialogOpen(true));
  dialog.querySelectorAll("[data-feedback-close]").forEach((button) => {
    button.addEventListener("click", () => setDialogOpen(false));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !dialog.hidden) setDialogOpen(false);
  });

  message.addEventListener("input", sync);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = message.value.trim();
    if (text.length < 5) {
      status.textContent = "5文字以上でご記入ください。";
      message.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = "送信中…";
    status.textContent = "";
    const formData = new FormData(form);
    try {
      await submitFeedback({
        message: text,
        relatedProfileId: String(profileId?.value || ""),
        relatedActivityName: String(activityName?.value || ""),
        website: String(formData.get("website") || ""),
        pageUrl: location.href,
        userAgent: navigator.userAgent
      });
      form.reset();
      clearSelectedProfile(true);
      status.textContent = "送信しました。ご協力ありがとうございます。";
    } catch (error) {
      console.error(error);
      status.textContent = error.message || "送信できませんでした。時間をおいて再度お試しください。";
    } finally {
      submit.textContent = "送信する";
      sync();
    }
  });

  sync();
}

document.addEventListener("DOMContentLoaded", setupFeedbackForm);
