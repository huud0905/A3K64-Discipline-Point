// Apps Script seating fix helper.
// Full fixed Api.gs is generated in chat as a downloadable file.
function seatStatusFix(value) {
  var raw = String(value || '').trim().toLowerCase();
  if (raw === 'preview') return 'preview';
  if (raw === 'published') return 'published';
  return 'private';
}
