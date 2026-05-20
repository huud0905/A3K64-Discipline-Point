/*
 * PERSONALIZATION patch for A3K64 Api.gs
 *
 * Copy this whole file into the same Apps Script project as Api.gs.
 * Then add these two cases inside handleAction_(action, payload, params):
 *
 * case 'getPersonalization':
 *   return getPersonalization_(payload);
 * case 'savePersonalization':
 *   return savePersonalization_(payload);
 */

const PERSONALIZATION_SHEET = 'PERSONALIZATION';
const PERSONALIZATION_HEADERS = [
  'username',
  'email',
  'uid',
  'displayName',
  'theme',
  'accentKey',
  'accentColor',
  'customAccent',
  'taskbarSettingsJson',
  'pinnedAppsJson',
  'recentAccentsJson',
  'desktopTransparency',
  'accentTaskbar',
  'accentBorders',
  'payloadJson',
  'updatedAt',
];

function accountKey_(payload) {
  return text_(payload.username || payload.email || payload.uid).toLowerCase();
}

function ensurePersonalizationSheet_() {
  return ensureSheet_(PERSONALIZATION_SHEET, PERSONALIZATION_HEADERS);
}

function personalizationRow_(username) {
  const sh = ensurePersonalizationSheet_();
  const data = rows_(sh);
  const userCol = findHeader_(data.headers, ['username']);
  const emailCol = findHeader_(data.headers, ['email']);
  const uidCol = findHeader_(data.headers, ['uid']);
  const key = text_(username).toLowerCase();

  for (let i = 0; i < data.rows.length; i++) {
    const row = data.rows[i];
    const values = [userCol, emailCol, uidCol]
      .filter(function (c) { return c >= 0; })
      .map(function (c) { return text_(row[c]).toLowerCase(); });

    if (values.indexOf(key) >= 0) {
      return { sheet: sh, rowNumber: i + 2, headers: data.headers, row: row };
    }
  }

  return { sheet: sh, rowNumber: -1, headers: data.headers, row: null };
}

function getPersonalization_(payload) {
  const username = accountKey_(payload || {});
  if (!username) return { ok: true, data: { ok: true, personalization: null } };

  const found = personalizationRow_(username);
  if (found.rowNumber < 0 || !found.row) {
    return { ok: true, data: { ok: true, personalization: null } };
  }

  const payloadCol = findHeader_(found.headers, ['payloadJson']);
  const json = payloadCol >= 0 ? text_(found.row[payloadCol]) : '';
  const personalization = parseJson_(json) || rowToPersonalization_(found.headers, found.row);

  return {
    ok: true,
    data: {
      ok: true,
      personalization: personalization,
      updatedAt: personalization.updatedAt || '',
    },
  };
}

function rowToPersonalization_(headers, row) {
  const get = function (name) {
    const col = findHeader_(headers, [name]);
    return col >= 0 ? text_(row[col]) : '';
  };

  const parse = function (name) {
    return parseJson_(get(name));
  };

  return {
    version: 2,
    theme: get('theme') || undefined,
    accentKey: get('accentKey') || undefined,
    accentColor: get('accentColor') || undefined,
    customAccent: get('customAccent') || undefined,
    taskbarSettings: parse('taskbarSettingsJson') || undefined,
    pinnedApps: parse('pinnedAppsJson') || undefined,
    recentAccents: parse('recentAccentsJson') || undefined,
    desktopTransparency: get('desktopTransparency') || undefined,
    accentTaskbar: get('accentTaskbar') || undefined,
    accentBorders: get('accentBorders') || undefined,
    updatedAt: get('updatedAt') || undefined,
  };
}

function savePersonalization_(payload) {
  payload = payload || {};
  const username = accountKey_(payload);
  if (!username) return { ok: false, error: 'Thiếu username/email để lưu PERSONALIZATION.' };

  const personalization = payload.personalization || {};
  const found = personalizationRow_(username);
  const sh = found.sheet;
  const displayName = text_(payload.displayName);
  const email = text_(payload.email || username).toLowerCase();
  const uid = text_(payload.uid || username);
  const updatedAt = iso_();
  const merged = Object.assign({}, personalization, { version: 2, updatedAt: updatedAt });

  const values = [
    username,
    email,
    uid,
    displayName,
    text_(merged.theme),
    text_(merged.accentKey),
    text_(merged.accentColor),
    text_(merged.customAccent),
    JSON.stringify(merged.taskbarSettings || {}),
    JSON.stringify(merged.pinnedApps || []),
    JSON.stringify(merged.recentAccents || []),
    text_(merged.desktopTransparency),
    text_(merged.accentTaskbar),
    text_(merged.accentBorders),
    JSON.stringify(merged),
    updatedAt,
  ];

  if (found.rowNumber > 0) {
    sh.getRange(found.rowNumber, 1, 1, PERSONALIZATION_HEADERS.length).setValues([values]);
  } else {
    sh.appendRow(values);
  }

  return {
    ok: true,
    data: {
      ok: true,
      personalization: merged,
      updatedAt: updatedAt,
    },
  };
}
