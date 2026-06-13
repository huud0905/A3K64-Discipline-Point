// Apps Script seating fix
function seatStatusFix(value) {
  var raw = String(value || '').trim().toLowerCase();
  if (raw === 'preview') return 'preview';
  if (raw === 'published') return 'published';
  return 'private';
}
