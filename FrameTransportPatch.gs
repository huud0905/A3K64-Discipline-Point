/*
 * A3K64 Apps Script iframe transport patch
 *
 * Add this file to the same Apps Script project AFTER Api.gs when browser JSONP is blocked.
 * It wraps doGet so requests with callback=__frame__... return an HTML page that posts the API result
 * back to the opener/parent window. This avoids both CORS fetch errors and script-tag JSONP blocking.
 */

var __A3K64_ORIGINAL_DOGET__ = typeof doGet === 'function' ? doGet : null;

function doGet(e) {
  var params = (e && e.parameter) || {};
  var callback = String(params.callback || '');

  if (callback.indexOf('__frame__') === 0) {
    try {
      var action = params.action || 'getScoreboard';
      var payload = params.payload ? JSON.parse(params.payload) : params;
      var result = typeof routeAction === 'function'
        ? routeAction(action, payload || {}, params)
        : { ok: false, error: 'routeAction không tồn tại trong Api.gs' };
      return frameOut_(callback.replace('__frame__', ''), result);
    } catch (err) {
      return frameOut_(callback.replace('__frame__', ''), {
        ok: false,
        error: String(err && err.message ? err.message : err)
      });
    }
  }

  if (__A3K64_ORIGINAL_DOGET__) return __A3K64_ORIGINAL_DOGET__(e);
  return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'doGet gốc không tồn tại.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function frameOut_(requestId, data) {
  var html = '<!doctype html><html><head><meta charset="utf-8"></head><body><script>' +
    '(function(){' +
    'var payload={"__A3K64_GAS_FRAME__":true,requestId:' + JSON.stringify(requestId || '') + ',response:' + JSON.stringify(data || {}) + '};' +
    'try{parent.postMessage(payload,"*");}catch(e){}' +
    'try{window.top.postMessage(payload,"*");}catch(e){}' +
    '})();' +
    '</script></body></html>';

  return HtmlService.createHtmlOutput(html)
    .setTitle('A3K64 GAS Bridge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
