// Allows large score-save payloads to be sent by hidden HTML form POST.
// This avoids JSONP/GET URL length limits when many score items are saved at once.
function doPost(e) {
  try {
    const request = parseA3PostRequest(e);
    return out(routeAction(request.action, request.payload, request.params));
  } catch (err) {
    return out({ ok: false, error: msg(err) });
  }
}

function parseA3PostRequest(e) {
  const params = (e && e.parameter) || {};
  const postData = (e && e.postData) || {};
  const raw = postData.contents || "";
  const mime = String(postData.type || "").toLowerCase();

  if (raw && (mime.indexOf("application/json") >= 0 || raw.trim().charAt(0) === "{")) {
    const body = JSON.parse(raw);
    return {
      action: body.action || params.action || "getScoreboard",
      payload: body.payload || {},
      params: params
    };
  }

  let payload = {};
  if (params.payload) {
    payload = JSON.parse(params.payload);
  } else if (raw && raw.indexOf("payload=") >= 0) {
    const parsed = parseFormEncodedBody_(raw);
    payload = parsed.payload ? JSON.parse(parsed.payload) : parsed;
  } else {
    payload = params;
  }

  return {
    action: params.action || payload.action || "getScoreboard",
    payload: payload,
    params: params
  };
}

function parseFormEncodedBody_(raw) {
  const result = {};
  String(raw || "").split("&").forEach(function (part) {
    if (!part) return;
    const index = part.indexOf("=");
    const keyName = index >= 0 ? part.slice(0, index) : part;
    const value = index >= 0 ? part.slice(index + 1) : "";
    result[decodeURIComponent(keyName.replace(/\+/g, " "))] = decodeURIComponent(value.replace(/\+/g, " "));
  });
  return result;
}
