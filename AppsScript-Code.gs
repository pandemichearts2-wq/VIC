const SHEETS = {
  PROFILES: 'VIC公開VTuber',
  RECOMMENDATIONS: 'VIC公開おすすめ',
  SUBMISSIONS: 'VIC確認待ち',
  FEEDBACK: 'VICお問い合わせ'
};

const SPREADSHEET_ID_KEY = 'VIC_RECOMMEND_SPREADSHEET_ID';
const MAX_SEARCH_RESULTS = 20;
const ADMIN_PASSWORD_HASH_KEY = 'VIC_ADMIN_PASSWORD_HASH';
const ADMIN_SESSION_SECONDS = 21600;
const VIDEO_GENRES = ['雑談','歌枠','ゲーム実況','お絵描き','ASMR','料理','開封','旅行・旅','作業','企画','耐久','コラボ','案件','ニュース','読書・朗読','その他'];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VIC')
    .addItem('初期シートを作成・更新', 'setupSheets')
    .addItem('管理パスワードを設定', 'setAdminPassword')
    .addItem('管理パスワード設定を確認', 'checkAdminPasswordSetting')
    .addSeparator()
    .addItem('選択中の申請を承認', 'approveSelectedSubmission')
    .addItem('選択中の申請を却下', 'rejectSelectedSubmission')
    .addToUi();
}

function setupSheets() {
  const ss = SpreadsheetApp.getActive();
  if (!ss) throw Error('スプレッドシートから実行してください。');
  PropertiesService.getScriptProperties().setProperty(SPREADSHEET_ID_KEY, ss.getId());

  ensureSheet_(ss, SHEETS.PROFILES, [
    'profileId', 'activityName', 'reading', 'affiliation', 'xUrl', 'youtubeUrl',
    'otherLink1', 'otherLink2', 'otherLink3', 'status', 'createdAt', 'updatedAt'
  ]);
  ensureSheet_(ss, SHEETS.RECOMMENDATIONS, [
    'recommendationId', 'profileId', 'activityName', 'videoUrl', 'thumbnailUrl', 'genre',
    'recommendationPoint', 'publicStatus', 'approvedAt'
  ]);
  ensureSheet_(ss, SHEETS.SUBMISSIONS, [
    'submissionId', 'receivedAt', 'status', 'submissionType', 'profileId',
    'activityName', 'payloadJson', 'reviewNote', 'publishedId', 'publishedAt'
  ]);
  ensureSheet_(ss, SHEETS.FEEDBACK, [
    'feedbackId', 'receivedAt', 'status', 'message', 'pageUrl', 'userAgent',
    'reviewNote', 'relatedProfileId', 'relatedActivityName'
  ]);

  ss.toast('必要なシートを準備しました。既存データは削除していません。', 'VIC', 6);
}

function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const action = String(p.action || 'health');

    if (action === 'health') return json_({ ok: true });
    if (action === 'recommendations' || action === 'dailyRecommendation') {
      const recommendations = randomRecommendations_(String(p.genre || ''), Number(p.limit || 10));
      return json_({
        ok: true,
        genre: String(p.genre || ''),
        recommendations: recommendations,
        recommendation: recommendations[0] || null
      });
    }
    if (action === 'profileSearch') {
      return json_({ ok: true, profiles: profileSearch_(String(p.q || ''), Number(p.limit || MAX_SEARCH_RESULTS)) });
    }

    return json_({ ok: false, message: '不明な操作です。' });
  } catch (error) {
    return json_({ ok: false, message: error.message });
  }
}

function doPost(e) {
  try {
    const p = JSON.parse(e && e.postData && e.postData.contents || '{}');

    if (p.action === 'submitInitial') {
      validateInitial_(p);
      return json_({ ok: true, submissionId: saveSubmission_('initial', p) });
    }
    if (p.action === 'submitRecommendation') {
      validateRecommendationAddition_(p);
      return json_({ ok: true, submissionId: saveSubmission_('recommendation', p) });
    }
    if (p.action === 'submitFeedback') {
      validateFeedback_(p);
      return json_({ ok: true, feedbackId: saveFeedback_(p) });
    }
    if (p.action === 'adminLogin') return json_(adminLogin_(p));
    if (/^admin/.test(String(p.action || ''))) {
      requireAdmin_(p);
      if (p.action === 'adminNotificationCounts') return json_(adminNotificationCounts_());
      if (p.action === 'adminListSubmissions') return json_(adminListSubmissions_(p));
      if (p.action === 'adminDecideSubmission') return json_(adminDecideSubmission_(p));
      if (p.action === 'adminBulkSubmissions') return json_(adminBulkSubmissions_(p));
      if (p.action === 'adminListFeedback') return json_(adminListFeedback_(p));
      if (p.action === 'adminUpdateFeedback') return json_(adminUpdateFeedback_(p));
      if (p.action === 'adminListProfiles') return json_(adminListProfiles_(p));
      if (p.action === 'adminListProfileRecommendations') return json_(adminListProfileRecommendations_(p));
      if (p.action === 'adminListRecommendations') return json_(adminListRecommendations_(p));
      if (p.action === 'adminUpdateProfile') return json_(adminUpdateProfile_(p));
      if (p.action === 'adminDeleteProfile') return json_(adminDeleteProfile_(p));
      if (p.action === 'adminUpdateRecommendation') return json_(adminUpdateRecommendation_(p));
      if (p.action === 'adminDeleteRecommendation') return json_(adminDeleteRecommendation_(p));
    }

    throw Error('不明な操作です。');
  } catch (error) {
    return json_({ ok: false, message: error.message });
  }
}

function validateInitial_(p) {
  const values = {
    activityName: text_(p.activityName),
    reading: text_(p.reading),
    affiliation: text_(p.affiliation),
    xUrl: text_(p.xUrl),
    youtubeUrl: text_(p.youtubeUrl),
    otherLink1: text_(p.otherLink1),
    otherLink2: text_(p.otherLink2),
    otherLink3: text_(p.otherLink3),
    genre: text_(p.genre),
    recommendedVideoUrl: text_(p.recommendedVideoUrl),
    recommendationPoint: text_(p.recommendationPoint)
  };

  if (!values.activityName) throw Error('活動名を入力してください。');
  [
    ['X（旧Twitter）のリンク', values.xUrl],
    ['YouTubeチャンネルのリンク', values.youtubeUrl],
    ['その他リンク1', values.otherLink1],
    ['その他リンク2', values.otherLink2],
    ['その他リンク3', values.otherLink3]
  ].forEach(([label, value]) => { if (value) requireHttps_(value, label); });
  if (values.genre) requireVideoGenre_(values.genre);
  if (values.recommendedVideoUrl) {
    requireYouTubeVideo_(values.recommendedVideoUrl);
    ensureVideoNotSubmitted_(values.recommendedVideoUrl);
  }
  if (values.recommendationPoint.length > 800) throw Error('おすすめポイントは800文字以内で入力してください。');

  const normalizedName = normalize_(values.activityName);
  if (publicProfiles_().some(profile => normalize_(profile.activityName) === normalizedName)) {
    throw Error('このVTuberはすでに登録されています。「おすすめを追加」から送信してください。');
  }
  if (pendingSubmissions_().some(item => item.submissionType === 'initial' && normalize_(item.activityName) === normalizedName)) {
    throw Error('このVTuberの初回登録はすでに確認待ちです。');
  }
}

function validateRecommendationAddition_(p) {
  const profileId = text_(p.profileId);
  const activityName = text_(p.activityName);
  const genre = text_(p.genre);
  const videoUrl = text_(p.recommendedVideoUrl);
  const point = text_(p.recommendationPoint);

  if (!profileId || !activityName) throw Error('登録済みVTuberを選択してください。');
  if (!videoUrl || !point) throw Error('おすすめ動画リンクとおすすめポイントを入力してください。');
  requireVideoGenre_(genre);
  requireYouTubeVideo_(videoUrl);
  if (point.length > 800) throw Error('おすすめポイントは800文字以内で入力してください。');

  const profile = publicProfiles_().find(item => String(item.profileId) === profileId);
  if (!profile || normalize_(profile.activityName) !== normalize_(activityName)) {
    throw Error('選択したVTuberが見つかりません。もう一度選択してください。');
  }
  ensureVideoNotSubmitted_(videoUrl);
}

function ensureVideoNotSubmitted_(videoUrl) {
  const normalizedUrl = normalizeVideoUrl_(videoUrl);
  const published = publicRecommendations_().some(item => normalizeVideoUrl_(item.videoUrl) === normalizedUrl);
  const pending = pendingSubmissions_().some(item => {
    const payload = parseJson_(item.payloadJson);
    return normalizeVideoUrl_(payload.recommendedVideoUrl) === normalizedUrl;
  });
  if (published || pending) throw Error('既に登録済みの動画です');
}


function validateFeedback_(p) {
  if (text_(p.website)) throw Error('送信できませんでした。');
  const message = text_(p.message);
  if (message.length < 5) throw Error('5文字以上でご記入ください。');
  if (message.length > 3000) throw Error('3000文字以内でご記入ください。');
}

function saveFeedback_(p) {
  const now = new Date();
  const id = 'VIC-FB-' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 6);
  const profileId = text_(p.relatedProfileId);
  let activityName = cleanText_(p.relatedActivityName, 100);
  if (profileId) {
    const profile = publicProfiles_().find(item => String(item.profileId) === profileId);
    if (!profile) throw Error('選択したVTuberが見つかりません。もう一度選択してください。');
    activityName = cleanText_(profile.activityName, 100);
  }
  appendObjectRow_(SHEETS.FEEDBACK, {
    feedbackId: id,
    receivedAt: now,
    status: '未確認',
    message: cleanText_(p.message, 3000),
    pageUrl: cleanText_(p.pageUrl, 500),
    userAgent: cleanText_(p.userAgent, 500),
    reviewNote: '',
    relatedProfileId: profileId,
    relatedActivityName: activityName
  });
  return id;
}

function saveSubmission_(type, p) {
  const now = new Date();
  const id = 'VIC-' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss') + '-' + Utilities.getUuid().slice(0, 6);
  const payload = type === 'initial' ? {
    activityName: cleanText_(p.activityName, 100),
    reading: cleanText_(p.reading, 100),
    affiliation: cleanText_(p.affiliation, 120),
    xUrl: text_(p.xUrl),
    youtubeUrl: text_(p.youtubeUrl),
    otherLink1: text_(p.otherLink1),
    otherLink2: text_(p.otherLink2),
    otherLink3: text_(p.otherLink3),
    genre: text_(p.genre),
    recommendedVideoUrl: text_(p.recommendedVideoUrl),
    recommendationPoint: cleanText_(p.recommendationPoint, 800)
  } : {
    profileId: text_(p.profileId),
    activityName: cleanText_(p.activityName, 100),
    genre: text_(p.genre),
    recommendedVideoUrl: text_(p.recommendedVideoUrl),
    recommendationPoint: cleanText_(p.recommendationPoint, 800)
  };

  appendObjectRow_(SHEETS.SUBMISSIONS, {
    submissionId: id,
    receivedAt: now,
    status: '確認待ち',
    submissionType: type,
    profileId: payload.profileId || '',
    activityName: payload.activityName,
    payloadJson: JSON.stringify(payload),
    reviewNote: '',
    publishedId: '',
    publishedAt: ''
  });
  return id;
}

function approveSelectedSubmission() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (!sheet || sheet.getName() !== SHEETS.SUBMISSIONS) throw Error('「確認待ち」シートで実行してください。');
  const rowNumber = sheet.getActiveRange().getRow();
  if (rowNumber < 2) throw Error('承認する申請の行を選択してください。');

  const submission = objectAtRow_(sheet, rowNumber);
  if (String(submission.status) !== '確認待ち') throw Error('この申請はすでに処理されています。');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const publishedId = publishSubmission_(submission);
    updateObjectRow_(SHEETS.SUBMISSIONS, rowNumber, {
      status: '許可（掲載）',
      publishedId: publishedId,
      publishedAt: new Date()
    });
    SpreadsheetApp.flush();
    SpreadsheetApp.getActive().toast('承認して公開しました。', 'VIC', 5);
  } finally {
    lock.releaseLock();
  }
}

function rejectSelectedSubmission() {
  const sheet = SpreadsheetApp.getActiveSheet();
  if (!sheet || sheet.getName() !== SHEETS.SUBMISSIONS) throw Error('「確認待ち」シートで実行してください。');
  const rowNumber = sheet.getActiveRange().getRow();
  if (rowNumber < 2) throw Error('却下する申請の行を選択してください。');
  const submission = objectAtRow_(sheet, rowNumber);
  if (String(submission.status) !== '確認待ち') throw Error('この申請はすでに処理されています。');
  updateObjectRow_(SHEETS.SUBMISSIONS, rowNumber, { status: '非許可（掲載不可）' });
  SpreadsheetApp.getActive().toast('申請を却下しました。', 'VIC', 5);
}


function setAdminPassword() {
  const ui = SpreadsheetApp.getUi();
  const result = ui.prompt('VIC 管理パスワードを設定', '8文字以上の管理パスワードを入力してください。', ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) return;
  const password = String(result.getResponseText() || '');
  if (password.length < 8) {
    ui.alert('管理パスワードは8文字以上にしてください。');
    return;
  }
  PropertiesService.getScriptProperties().setProperty(ADMIN_PASSWORD_HASH_KEY, hashText_(password));
  ui.alert('VIC管理パスワードを設定しました。');
}

function checkAdminPasswordSetting() {
  const configured = Boolean(PropertiesService.getScriptProperties().getProperty(ADMIN_PASSWORD_HASH_KEY));
  SpreadsheetApp.getUi().alert(configured ? '管理パスワードは設定済みです。' : '管理パスワードは未設定です。');
}

function adminLogin_(p) {
  const saved = String(PropertiesService.getScriptProperties().getProperty(ADMIN_PASSWORD_HASH_KEY) || '');
  if (!saved) throw Error('管理パスワードが未設定です。スプレッドシートのVICメニューから設定してください。');
  const supplied = hashText_(String(p.password || ''));
  if (!secureEqual_(saved, supplied)) throw Error('管理パスワードが違います。');
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('vic-admin:' + token, 'ok', ADMIN_SESSION_SECONDS);
  return { ok: true, adminToken: token, expiresIn: ADMIN_SESSION_SECONDS };
}

function requireAdmin_(p) {
  const token = String(p.adminToken || '');
  if (!token || CacheService.getScriptCache().get('vic-admin:' + token) !== 'ok') {
    throw Error('管理者ログインの有効期限が切れました。もう一度ログインしてください。');
  }
  CacheService.getScriptCache().put('vic-admin:' + token, 'ok', ADMIN_SESSION_SECONDS);
}

function hashText_(value) {
  return Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''))
  ).replace(/=+$/, '');
}

function secureEqual_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

function adminPageResult_(items, offset, limit) {
  const page = items.slice(offset, offset + limit);
  return { ok: true, items: page, hasMore: offset + page.length < items.length, nextOffset: offset + page.length };
}

function adminNotificationCounts_() {
  const submissions = rows_(SHEETS.SUBMISSIONS).filter(item => String(item.status || '') === '確認待ち').length;
  const feedbackRows = rows_(SHEETS.FEEDBACK);
  const feedbackUnconfirmed = feedbackRows.filter(item => String(item.status || '未確認') === '未確認').length;
  const feedbackInProgress = feedbackRows.filter(item => String(item.status || '') === '対応中').length;
  return {
    ok: true,
    submissions: submissions,
    feedback: feedbackUnconfirmed + feedbackInProgress,
    breakdown: {
      feedbackUnconfirmed: feedbackUnconfirmed,
      feedbackInProgress: feedbackInProgress
    }
  };
}

function adminListSubmissions_(p) {
  const q = normalize_(p.q);
  const type = text_(p.type);
  const status = text_(p.status);
  const offset = readOffset_(p.offset);
  const limit = readLimit_(p.limit, 30);
  let items = rowsWithNumber_(SHEETS.SUBMISSIONS).map(item => ({
    submissionId: item.submissionId,
    receivedAt: item.receivedAt,
    status: item.status,
    submissionType: item.submissionType,
    profileId: item.profileId || '',
    activityName: item.activityName,
    reviewNote: item.reviewNote || '',
    publishedId: item.publishedId || '',
    payload: parseJson_(item.payloadJson)
  }));
  if (type) items = items.filter(item => String(item.submissionType) === type);
  if (status) items = items.filter(item => String(item.status) === status);
  if (q) items = items.filter(item => normalize_([
    item.submissionId, item.activityName, item.reviewNote, JSON.stringify(item.payload)
  ].join(' ')).includes(q));
  items.sort((a, b) => dateNumber_(b.receivedAt) - dateNumber_(a.receivedAt));
  return adminPageResult_(items, offset, limit);
}

function adminProcessSubmissionUnlocked_(submissionId, decision, reviewNote) {
  const found = findRowById_(SHEETS.SUBMISSIONS, 'submissionId', submissionId);
  if (!found) throw Error('申請が見つかりません。');
  if (String(found.data.status) !== '確認待ち') throw Error('この申請はすでに処理されています。');
  const note = cleanText_(reviewNote || '', 500);
  if (decision === 'approve') {
    const publishedId = publishSubmission_(found.data);
    updateObjectRow_(SHEETS.SUBMISSIONS, found.row, {
      status: '許可（掲載）', reviewNote: note, publishedId: publishedId, publishedAt: new Date()
    });
  } else if (decision === 'reject') {
    updateObjectRow_(SHEETS.SUBMISSIONS, found.row, {
      status: '非許可（掲載不可）', reviewNote: note
    });
  } else {
    throw Error('処理内容が不正です。');
  }
  return { submissionType: String(found.data.submissionType || '') };
}

function adminDeleteSubmissionUnlocked_(submissionId) {
  const found = findRowById_(SHEETS.SUBMISSIONS, 'submissionId', submissionId);
  if (!found) throw Error('申請が見つかりません。');
  sheet_(SHEETS.SUBMISSIONS).deleteRow(found.row);
  return { submissionType: String(found.data.submissionType || '') };
}

function adminDecideSubmission_(p) {
  const decision = String(p.decision || '');
  if (!['approve', 'reject'].includes(decision)) throw Error('処理内容が不正です。');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const result = adminProcessSubmissionUnlocked_(String(p.submissionId || ''), decision, p.reviewNote || '');
    SpreadsheetApp.flush();
    return { ok: true, result: result };
  } finally {
    lock.releaseLock();
  }
}

function adminBulkSubmissions_(p) {
  const operation = String(p.operation || '');
  if (!['approve', 'delete'].includes(operation)) throw Error('一括処理の内容が不正です。');
  const ids = [...new Set((Array.isArray(p.submissionIds) ? p.submissionIds : [])
    .map(value => String(value || '').trim()).filter(Boolean))];
  if (!ids.length) throw Error('処理する申請を選択してください。');
  if (ids.length > 200) throw Error('一度に処理できる申請は200件までです。');

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  const errors = [];
  let success = 0;
  try {
    ids.forEach(submissionId => {
      try {
        if (operation === 'approve') adminProcessSubmissionUnlocked_(submissionId, 'approve', '');
        else adminDeleteSubmissionUnlocked_(submissionId);
        success++;
      } catch (error) {
        errors.push({ submissionId: submissionId, message: String(error && error.message || error) });
      }
    });
    SpreadsheetApp.flush();
    return { ok: true, total: ids.length, success: success, failed: errors.length, errors: errors };
  } finally {
    lock.releaseLock();
  }
}


function adminListFeedback_(p) {
  const query = normalize_(p.q);
  const status = text_(p.status);
  const offset = readOffset_(p.offset);
  const limit = readLimit_(p.limit, 30);
  let list = rows_(SHEETS.FEEDBACK).filter(item => !status || String(item.status || '未確認') === status);
  if (query) {
    list = list.filter(item => normalize_([
      item.feedbackId, item.relatedActivityName, item.message, item.reviewNote
    ].join(' ')).includes(query));
  }
  list.sort((a, b) => dateNumber_(b.receivedAt) - dateNumber_(a.receivedAt));
  return adminPageResult_(list.map(item => ({
    feedbackId: item.feedbackId,
    receivedAt: item.receivedAt,
    status: item.status || '未確認',
    relatedProfileId: item.relatedProfileId || '',
    relatedActivityName: item.relatedActivityName || '',
    message: item.message || '',
    pageUrl: item.pageUrl || '',
    reviewNote: item.reviewNote || ''
  })), offset, limit);
}

function adminUpdateFeedback_(p) {
  const allowed = ['未確認', '対応中', '対応済み', '対応不要'];
  const status = text_(p.status);
  if (!allowed.includes(status)) throw Error('対応状況が不正です。');
  const found = findRowById_(SHEETS.FEEDBACK, 'feedbackId', p.feedbackId);
  if (!found) throw Error('お問い合わせが見つかりません。');
  updateObjectRow_(SHEETS.FEEDBACK, found.row, {
    status: status,
    reviewNote: cleanText_(p.reviewNote, 1000)
  });
  return { ok: true };
}

function adminListProfiles_(p) {
  const q = normalize_(p.q);
  const offset = readOffset_(p.offset);
  const limit = readLimit_(p.limit, 30);
  const recommendations = rows_(SHEETS.RECOMMENDATIONS);
  const recommendationsByProfile = {};
  recommendations.forEach(item => {
    const profileId = String(item.profileId || '');
    if (!recommendationsByProfile[profileId]) recommendationsByProfile[profileId] = [];
    recommendationsByProfile[profileId].push(item);
  });

  let items = rows_(SHEETS.PROFILES);
  if (q) items = items.filter(item => {
    const profileText = normalize_([
      item.profileId, item.activityName, item.reading, item.affiliation, item.xUrl, item.youtubeUrl,
      item.otherLink1, item.otherLink2, item.otherLink3
    ].join(' '));
    const recommendationText = normalize_((recommendationsByProfile[String(item.profileId || '')] || []).map(rec => [
      rec.recommendationId, rec.activityName, rec.genre, rec.videoUrl, rec.recommendationPoint, rec.publicStatus
    ].join(' ')).join(' '));
    return profileText.includes(q) || recommendationText.includes(q);
  });
  items.sort((a, b) => String(a.activityName || '').localeCompare(String(b.activityName || ''), 'ja'));
  return adminPageResult_(items.map(item => ({
    id: item.profileId,
    data: item,
    recommendationCount: (recommendationsByProfile[String(item.profileId || '')] || []).length
  })), offset, limit);
}

function adminListProfileRecommendations_(p) {
  const profileId = text_(p.profileId);
  if (!profileId) throw Error('VTuberが指定されていません。');
  const profile = findRowById_(SHEETS.PROFILES, 'profileId', profileId);
  if (!profile) throw Error('VTuberが見つかりません。');
  const items = rows_(SHEETS.RECOMMENDATIONS)
    .filter(item => String(item.profileId || '') === String(profileId))
    .sort((a, b) => dateNumber_(b.approvedAt) - dateNumber_(a.approvedAt));
  return {
    ok: true,
    items: items.map(item => ({ id: item.recommendationId, data: item }))
  };
}

function adminListRecommendations_(p) {
  const q = normalize_(p.q);
  const offset = readOffset_(p.offset);
  const limit = readLimit_(p.limit, 30);
  let items = rows_(SHEETS.RECOMMENDATIONS);
  if (q) items = items.filter(item => normalize_([
    item.recommendationId, item.activityName, item.genre, item.videoUrl, item.recommendationPoint
  ].join(' ')).includes(q));
  items.sort((a, b) => dateNumber_(b.approvedAt) - dateNumber_(a.approvedAt));
  return adminPageResult_(items.map(item => ({ id: item.recommendationId, data: item })), offset, limit);
}

function adminUpdateProfile_(p) {
  const found = findRowById_(SHEETS.PROFILES, 'profileId', p.id);
  if (!found) throw Error('VTuberが見つかりません。');
  const input = p.data && typeof p.data === 'object' ? p.data : {};
  const activityName = cleanText_(input.activityName, 100);
  const reading = cleanText_(input.reading, 100);
  const affiliation = cleanText_(input.affiliation, 120);
  const xUrl = text_(input.xUrl);
  const youtubeUrl = text_(input.youtubeUrl);
  const otherLink1 = text_(input.otherLink1);
  const otherLink2 = text_(input.otherLink2);
  const otherLink3 = text_(input.otherLink3);
  const status = String(input.status || '公開') === '非公開' ? '非公開' : '公開';
  if (!activityName) throw Error('活動名を入力してください。');
  [
    ['X（旧Twitter）のリンク', xUrl],
    ['YouTubeチャンネルのリンク', youtubeUrl],
    ['その他リンク1', otherLink1],
    ['その他リンク2', otherLink2],
    ['その他リンク3', otherLink3]
  ].forEach(([label, value]) => { if (value) requireHttps_(value, label); });
  const duplicate = rows_(SHEETS.PROFILES).find(item =>
    String(item.profileId) !== String(found.data.profileId) && normalize_(item.activityName) === normalize_(activityName)
  );
  if (duplicate) throw Error('同じ活動名のVTuberがすでに登録されています。');
  const oldName = String(found.data.activityName || '');
  updateObjectRow_(SHEETS.PROFILES, found.row, {
    activityName: activityName, reading: reading, affiliation: affiliation,
    xUrl: xUrl, youtubeUrl: youtubeUrl, otherLink1: otherLink1, otherLink2: otherLink2,
    otherLink3: otherLink3, status: status, updatedAt: new Date()
  });
  if (activityName !== oldName) {
    rowsWithNumber_(SHEETS.RECOMMENDATIONS)
      .filter(item => String(item.profileId) === String(found.data.profileId))
      .forEach(item => updateObjectRow_(SHEETS.RECOMMENDATIONS, item.__rowNumber, { activityName: activityName }));
  }
  return { ok: true };
}

function adminDeleteProfile_(p) {
  const found = findRowById_(SHEETS.PROFILES, 'profileId', p.id);
  if (!found) throw Error('VTuberが見つかりません。');
  const deletedRecommendations = deleteRowsMatching_(SHEETS.RECOMMENDATIONS, item =>
    String(item.profileId) === String(found.data.profileId)
  );
  sheet_(SHEETS.PROFILES).deleteRow(found.row);
  return { ok: true, message: 'VTuberと紐づくおすすめ動画' + deletedRecommendations + '件を削除しました。' };
}

function adminUpdateRecommendation_(p) {
  const found = findRowById_(SHEETS.RECOMMENDATIONS, 'recommendationId', p.id);
  if (!found) throw Error('おすすめ動画が見つかりません。');
  const input = p.data && typeof p.data === 'object' ? p.data : {};
  const genre = text_(input.genre);
  const videoUrl = text_(input.videoUrl);
  const point = cleanText_(input.recommendationPoint, 800);
  const publicStatus = String(input.publicStatus || '公開中') === '非公開' ? '非公開' : '公開中';
  if (!videoUrl || !point) throw Error('おすすめ動画リンクとおすすめポイントを入力してください。');
  requireVideoGenre_(genre);
  requireYouTubeVideo_(videoUrl);
  const normalizedUrl = normalizeVideoUrl_(videoUrl);
  const duplicate = rows_(SHEETS.RECOMMENDATIONS).find(item =>
    String(item.recommendationId) !== String(found.data.recommendationId) && normalizeVideoUrl_(item.videoUrl) === normalizedUrl
  );
  if (duplicate) throw Error('このおすすめ動画はすでに登録されています。');
  const videoId = youtubeVideoId_(videoUrl);
  updateObjectRow_(SHEETS.RECOMMENDATIONS, found.row, {
    videoUrl: videoUrl,
    thumbnailUrl: 'https://i.ytimg.com/vi/' + encodeURIComponent(videoId) + '/hqdefault.jpg',
    genre: genre,
    recommendationPoint: point,
    publicStatus: publicStatus
  });
  return { ok: true };
}

function adminDeleteRecommendation_(p) {
  const found = findRowById_(SHEETS.RECOMMENDATIONS, 'recommendationId', p.id);
  if (!found) throw Error('おすすめ動画が見つかりません。');
  sheet_(SHEETS.RECOMMENDATIONS).deleteRow(found.row);
  return { ok: true };
}

function publishSubmission_(submission) {
  const payload = parseJson_(submission.payloadJson);
  if (String(submission.submissionType) === 'initial') {
    const profileId = publishProfile_(payload);
    if (!text_(payload.recommendedVideoUrl)) return profileId;
    return publishRecommendation_(profileId, payload.activityName, payload.recommendedVideoUrl, payload.recommendationPoint, payload.genre);
  }
  if (String(submission.submissionType) === 'recommendation') {
    const profile = publicProfiles_().find(item => String(item.profileId) === String(payload.profileId));
    if (!profile) throw Error('登録先のVTuberが見つかりません。');
    return publishRecommendation_(profile.profileId, profile.activityName, payload.recommendedVideoUrl, payload.recommendationPoint, payload.genre);
  }
  throw Error('対応していない申請種類です。');
}

function publishProfile_(payload) {
  const existing = publicProfiles_().find(item => normalize_(item.activityName) === normalize_(payload.activityName));
  if (existing) throw Error('同じ活動名がすでに公開されています。');

  const profileId = 'P-' + Utilities.getUuid().slice(0, 8);
  const now = new Date();
  appendObjectRow_(SHEETS.PROFILES, {
    profileId: profileId,
    activityName: payload.activityName,
    reading: payload.reading,
    affiliation: payload.affiliation,
    xUrl: payload.xUrl,
    youtubeUrl: payload.youtubeUrl,
    otherLink1: payload.otherLink1 || '',
    otherLink2: payload.otherLink2 || '',
    otherLink3: payload.otherLink3 || '',
    status: '公開',
    createdAt: now,
    updatedAt: now
  });
  return profileId;
}

function publishRecommendation_(profileId, activityName, videoUrl, point, genre) {
  const normalizedUrl = normalizeVideoUrl_(videoUrl);
  const existing = publicRecommendations_().find(item => normalizeVideoUrl_(item.videoUrl) === normalizedUrl);
  if (existing) return String(existing.recommendationId);

  const videoId = youtubeVideoId_(videoUrl);
  if (!videoId) throw Error('おすすめ動画リンクからYouTube動画IDを取得できません。');

  const recommendationId = 'R-' + Utilities.getUuid().slice(0, 8);
  appendObjectRow_(SHEETS.RECOMMENDATIONS, {
    recommendationId: recommendationId,
    profileId: profileId,
    activityName: activityName,
    videoUrl: videoUrl,
    thumbnailUrl: 'https://i.ytimg.com/vi/' + encodeURIComponent(videoId) + '/hqdefault.jpg',
    genre: VIDEO_GENRES.includes(String(genre || '')) ? String(genre) : 'その他',
    recommendationPoint: point,
    publicStatus: '公開中',
    approvedAt: new Date()
  });
  return recommendationId;
}

function randomRecommendations_(requestedGenre, requestedLimit) {
  const profiles = publicProfiles_();
  const profileMap = Object.fromEntries(profiles.map(profile => [String(profile.profileId), profile]));
  const genre = VIDEO_GENRES.includes(String(requestedGenre || '')) ? String(requestedGenre) : '';
  let recommendations = publicRecommendations_().filter(item => profileMap[String(item.profileId)]);
  if (genre) recommendations = recommendations.filter(item => recommendationGenre_(item) === genre);
  if (!recommendations.length) return [];

  shuffle_(recommendations);
  const limit = Math.min(Math.max(Math.floor(requestedLimit) || 10, 1), 10);
  return recommendations.slice(0, limit).map(recommendation => {
    const profile = profileMap[String(recommendation.profileId)];
    return {
      profileId: profile.profileId,
      activityName: profile.activityName,
      reading: profile.reading,
      affiliation: profile.affiliation,
      xUrl: profile.xUrl,
      youtubeUrl: profile.youtubeUrl,
      recommendationId: recommendation.recommendationId,
      genre: recommendationGenre_(recommendation),
      videoUrl: recommendation.videoUrl,
      thumbnailUrl: recommendation.thumbnailUrl,
      recommendationPoint: recommendation.recommendationPoint
    };
  });
}

function recommendationGenre_(recommendation) {
  const genre = text_(recommendation && recommendation.genre);
  return VIDEO_GENRES.includes(genre) ? genre : 'その他';
}

function profileSearch_(query, requestedLimit) {
  const q = normalize_(query);
  if (!q) return [];
  const limit = Math.min(Math.max(Math.floor(requestedLimit) || MAX_SEARCH_RESULTS, 1), MAX_SEARCH_RESULTS);
  return publicProfiles_()
    .filter(profile => [profile.activityName, profile.reading, profile.affiliation].some(value => normalize_(value).includes(q)))
    .sort((a, b) => String(a.activityName).localeCompare(String(b.activityName), 'ja'))
    .slice(0, limit)
    .map(profile => ({
      profileId: profile.profileId,
      activityName: profile.activityName,
      reading: profile.reading,
      affiliation: profile.affiliation
    }));
}

function publicProfiles_() {
  return rows_(SHEETS.PROFILES).filter(item => text_(item.activityName) && !isHiddenStatus_(item.status));
}

function publicRecommendations_() {
  return rows_(SHEETS.RECOMMENDATIONS).filter(item => text_(item.videoUrl) && !isHiddenStatus_(item.publicStatus));
}

function pendingSubmissions_() {
  return rows_(SHEETS.SUBMISSIONS).filter(item => String(item.status) === '確認待ち');
}

function requireHttps_(value, label) {
  if (!/^https:\/\//i.test(String(value || ''))) throw Error(label + 'は https:// から入力してください。');
}

function requireVideoGenre_(value) {
  if (!VIDEO_GENRES.includes(String(value || ''))) throw Error('動画ジャンルを選択してください。');
}

function requireYouTubeVideo_(value) {
  requireHttps_(value, 'おすすめ動画リンク');
  if (!youtubeVideoId_(value)) throw Error('おすすめ動画リンクにはYouTube動画のURLを入力してください。');
}

function youtubeVideoId_(value) {
  const input = String(value || '').trim();
  const matched = input.match(/^https:\/\/([^\/?#]+)(\/[^?#]*)?(?:\?([^#]*))?/i);
  if (!matched) return '';

  const host = String(matched[1] || '').toLowerCase().replace(/^www\./, '');
  const path = String(matched[2] || '/');
  const query = String(matched[3] || '');
  let id = '';

  if (host === 'youtu.be') {
    id = path.split('/').filter(Boolean)[0] || '';
  } else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
    const parts = path.split('/').filter(Boolean);
    if (parts[0] === 'watch') {
      query.split('&').some(part => {
        const pair = part.split('=');
        let key = '';
        let val = '';
        try {
          key = decodeURIComponent(pair.shift() || '');
          val = decodeURIComponent(pair.join('=') || '');
        } catch (_) {
          key = pair.shift() || '';
          val = pair.join('=') || '';
        }
        if (key === 'v') {
          id = val;
          return true;
        }
        return false;
      });
    } else if (['shorts', 'live', 'embed', 'v'].includes(parts[0])) {
      id = parts[1] || '';
    }
  }

  return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : '';
}

function normalizeVideoUrl_(value) {
  const id = youtubeVideoId_(value);
  return id ? 'youtube:' + id : text_(value).replace(/\/$/, '');
}

function tokyoDateKey_() {
  return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
}

function positiveHash_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(value || ''));
  let hash = 0;
  for (let i = 0; i < 4; i++) hash = (hash << 8) | (bytes[i] & 255);
  return hash >>> 0;
}

function shuffle_(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const value = items[i];
    items[i] = items[j];
    items[j] = value;
  }
  return items;
}

function isHiddenStatus_(value) {
  const status = normalize_(value);
  return ['非公開', '停止', '削除', '却下', '非許可（掲載不可）'].map(normalize_).includes(status);
}

function getSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = text_(props.getProperty(SPREADSHEET_ID_KEY));
  if (id) {
    try { return SpreadsheetApp.openById(id); }
    catch (_) {}
  }
  const active = SpreadsheetApp.getActive();
  if (active) {
    props.setProperty(SPREADSHEET_ID_KEY, active.getId());
    return active;
  }
  throw Error('接続先スプレッドシートが未設定です。「初期シートを作成・更新」を実行してください。');
}

function ensureSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    headers.forEach(header => {
      if (!existing.includes(header)) sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
    });
  }
  sheet.setFrozenRows(1);
}

function sheet_(name) {
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw Error(name + 'シートがありません。初期シートを作成・更新してください。');
  return sheet;
}

function rows_(name) {
  const sheet = sheet_(name);
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])));
}


function rowsWithNumber_(name) {
  const sheet = sheet_(name);
  if (sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const headers = values.shift();
  return values.map((row, index) => Object.assign(
    { __rowNumber: index + 2 },
    Object.fromEntries(headers.map((header, column) => [header, row[column]]))
  ));
}

function findRowById_(sheetName, idColumn, id) {
  const item = rowsWithNumber_(sheetName).find(row => String(row[idColumn]) === String(id));
  return item ? { row: item.__rowNumber, data: item } : null;
}

function deleteRowsMatching_(sheetName, predicate) {
  const sheet = sheet_(sheetName);
  const rowNumbers = rowsWithNumber_(sheetName)
    .filter(predicate)
    .map(item => item.__rowNumber)
    .sort((a, b) => b - a);
  rowNumbers.forEach(row => sheet.deleteRow(row));
  return rowNumbers.length;
}

function readOffset_(value) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function readLimit_(value, fallback) {
  const number = Math.floor(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, 50) : fallback;
}

function dateNumber_(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function appendObjectRow_(sheetName, object) {
  const sheet = sheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  sheet.appendRow(headers.map(header => Object.prototype.hasOwnProperty.call(object, header) ? object[header] : ''));
}

function updateObjectRow_(sheetName, rowNumber, object) {
  const sheet = sheet_(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  Object.entries(object).forEach(([key, value]) => {
    const index = headers.indexOf(key);
    if (index >= 0) sheet.getRange(rowNumber, index + 1).setValue(value);
  });
}

function objectAtRow_(sheet, rowNumber) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
}

function parseJson_(value) {
  try { return JSON.parse(String(value || '{}')); }
  catch (_) { return {}; }
}

function text_(value) {
  return String(value == null ? '' : value).trim();
}

function cleanText_(value, maxLength) {
  const text = text_(value).slice(0, maxLength || 1000);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function normalize_(value) {
  try { return text_(value).normalize('NFKC').toLowerCase().replace(/[\s　]+/g, ''); }
  catch (_) { return text_(value).toLowerCase().replace(/[\s　]+/g, ''); }
}

function json_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(ContentService.MimeType.JSON);
}
