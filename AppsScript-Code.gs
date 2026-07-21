const SHEETS = {
  PROFILES: 'VIC公開VTuber',
  RECOMMENDATIONS: 'VIC公開おすすめ',
  SUBMISSIONS: 'VIC確認待ち'
};

const SPREADSHEET_ID_KEY = 'VIC_RECOMMEND_SPREADSHEET_ID';
const MAX_SEARCH_RESULTS = 20;

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VIC')
    .addItem('初期シートを作成・更新', 'setupSheets')
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
    'status', 'createdAt', 'updatedAt'
  ]);
  ensureSheet_(ss, SHEETS.RECOMMENDATIONS, [
    'recommendationId', 'profileId', 'activityName', 'videoUrl', 'thumbnailUrl',
    'recommendationPoint', 'publicStatus', 'approvedAt'
  ]);
  ensureSheet_(ss, SHEETS.SUBMISSIONS, [
    'submissionId', 'receivedAt', 'status', 'submissionType', 'profileId',
    'activityName', 'payloadJson', 'reviewNote', 'publishedId', 'publishedAt'
  ]);

  ss.toast('必要な3シートを準備しました。既存データは削除していません。', 'VIC', 6);
}

function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    const action = String(p.action || 'health');

    if (action === 'health') return json_({ ok: true });
    if (action === 'dailyRecommendation') {
      return json_({ ok: true, recommendation: dailyRecommendation_(String(p.date || '')) });
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
    recommendedVideoUrl: text_(p.recommendedVideoUrl),
    recommendationPoint: text_(p.recommendationPoint)
  };

  if (Object.values(values).some(value => !value)) throw Error('すべての項目を入力してください。');
  requireHttps_(values.xUrl, 'X（旧Twitter）のリンク');
  requireHttps_(values.youtubeUrl, 'YouTubeチャンネルのリンク');
  requireYouTubeVideo_(values.recommendedVideoUrl);
  if (values.recommendationPoint.length > 800) throw Error('おすすめポイントは800文字以内で入力してください。');

  const normalizedName = normalize_(values.activityName);
  if (publicProfiles_().some(profile => normalize_(profile.activityName) === normalizedName)) {
    throw Error('このVTuberはすでに登録されています。「おすすめを追加」から送信してください。');
  }
  if (pendingSubmissions_().some(item => item.submissionType === 'initial' && normalize_(item.activityName) === normalizedName)) {
    throw Error('このVTuberの初回登録はすでに確認待ちです。');
  }
  ensureVideoNotSubmitted_(values.recommendedVideoUrl);
}

function validateRecommendationAddition_(p) {
  const profileId = text_(p.profileId);
  const activityName = text_(p.activityName);
  const videoUrl = text_(p.recommendedVideoUrl);
  const point = text_(p.recommendationPoint);

  if (!profileId || !activityName) throw Error('登録済みVTuberを選択してください。');
  if (!videoUrl || !point) throw Error('おすすめ動画リンクとおすすめポイントを入力してください。');
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
  if (published || pending) throw Error('このおすすめ動画はすでに登録済み、または確認待ちです。');
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
    recommendedVideoUrl: text_(p.recommendedVideoUrl),
    recommendationPoint: cleanText_(p.recommendationPoint, 800)
  } : {
    profileId: text_(p.profileId),
    activityName: cleanText_(p.activityName, 100),
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

function publishSubmission_(submission) {
  const payload = parseJson_(submission.payloadJson);
  if (String(submission.submissionType) === 'initial') {
    const profileId = publishProfile_(payload);
    return publishRecommendation_(profileId, payload.activityName, payload.recommendedVideoUrl, payload.recommendationPoint);
  }
  if (String(submission.submissionType) === 'recommendation') {
    const profile = publicProfiles_().find(item => String(item.profileId) === String(payload.profileId));
    if (!profile) throw Error('登録先のVTuberが見つかりません。');
    return publishRecommendation_(profile.profileId, profile.activityName, payload.recommendedVideoUrl, payload.recommendationPoint);
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
    status: '公開',
    createdAt: now,
    updatedAt: now
  });
  return profileId;
}

function publishRecommendation_(profileId, activityName, videoUrl, point) {
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
    recommendationPoint: point,
    publicStatus: '公開中',
    approvedAt: new Date()
  });
  return recommendationId;
}

function dailyRecommendation_(requestedDate) {
  const profiles = publicProfiles_();
  const profileMap = Object.fromEntries(profiles.map(profile => [String(profile.profileId), profile]));
  const recommendations = publicRecommendations_().filter(item => profileMap[String(item.profileId)]);
  if (!recommendations.length) return null;

  const grouped = {};
  recommendations.forEach(item => {
    const id = String(item.profileId);
    if (!grouped[id]) grouped[id] = [];
    grouped[id].push(item);
  });

  const profileIds = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ja'));
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : tokyoDateKey_();
  const profileIndex = positiveHash_(dateKey + ':profile') % profileIds.length;
  const profileId = profileIds[profileIndex];
  const profileRecommendations = grouped[profileId].sort((a, b) => String(a.recommendationId).localeCompare(String(b.recommendationId), 'ja'));
  const recommendationIndex = positiveHash_(dateKey + ':' + profileId + ':video') % profileRecommendations.length;
  const recommendation = profileRecommendations[recommendationIndex];
  const profile = profileMap[profileId];

  return {
    profileId: profile.profileId,
    activityName: profile.activityName,
    reading: profile.reading,
    affiliation: profile.affiliation,
    xUrl: profile.xUrl,
    youtubeUrl: profile.youtubeUrl,
    recommendationId: recommendation.recommendationId,
    videoUrl: recommendation.videoUrl,
    thumbnailUrl: recommendation.thumbnailUrl,
    recommendationPoint: recommendation.recommendationPoint
  };
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

function requireYouTubeVideo_(value) {
  requireHttps_(value, 'おすすめ動画リンク');
  if (!youtubeVideoId_(value)) throw Error('おすすめ動画リンクにはYouTube動画のURLを入力してください。');
}

function youtubeVideoId_(value) {
  try {
    const url = new URL(String(value || ''));
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    let id = '';

    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || '';
    else if (['youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
      else {
        const parts = url.pathname.split('/').filter(Boolean);
        if (['shorts', 'live', 'embed', 'v'].includes(parts[0])) id = parts[1] || '';
      }
    }
    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : '';
  } catch (_) {
    return '';
  }
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
