/**
 * CabGlass Leave Tracker — Apps Script backend.
 *
 * A single Code.gs bound to a Google Sheet, exposed as a JSON API via
 * doGet / doPost. Same pattern as the Courier Dashboard.
 *
 * AUTH: every request must carry `secret` matching the DASHBOARD_SECRET script
 *       property (Project Settings → Script Properties).
 *
 * CORS: writes are POSTed with Content-Type text/plain (no preflight); the body
 *       is still JSON and is read from e.postData.contents.
 *
 * After ANY edit: Deploy → Manage deployments → edit ✏️ → Version: "New version"
 * → Deploy. Confirm with the `ping` action that VERSION below is live.
 */

var VERSION = '2026-07-leave-v14';

// Public address of the portal, added as a link in notification emails.
var PORTAL_URL = 'https://portal.cabglass.co.za';

// Drive folder where uploaded sick notes are saved. While blank, uploads still
// record the file name + uploader but no file is stored.
var SICK_NOTES_FOLDER_ID = '1W-YitHNqNpTKcHMgaVWakSXju5z4mmPO';

// Finalize-month: where the monthly PDF is saved, and who it's emailed to.
// REPORTS_FOLDER_ID can reuse a Drive folder; ACCOUNTANTS_EMAIL is the default
// payroll recipient — the admin can override it per-send in the UI.
var REPORTS_FOLDER_ID = '';
var ACCOUNTANTS_EMAIL = 'admin@neetlingtax.co.za';


var USERS_SHEET = 'Users';
var REQUESTS_SHEET = 'LeaveRequests';
var SICKNOTES_SHEET = 'SickNotes';
var REPORTS_SHEET = 'MonthlyReports';
var MEETINGS_SHEET = 'Meetings';
var AGENDA_SHEET = 'AgendaItems';
var INCENTIVES_SHEET = 'Incentives';
var COMMISSION_SHEET = 'CommissionData';
var SETTINGS_SHEET = 'Settings';
var SETTINGS_COLS = ['key', 'value', 'updatedAt', 'updatedBy'];
// Keys we store in the Settings sheet (admin-configurable).
var SETTINGS_KEYS = ['auditorEmail', 'incentiveHook', 'leaveHook'];

var USER_COLS = ['id', 'name', 'username', 'password', 'role', 'approverId', 'startDate',
  'annualAdjust', 'sickAdjust', 'familyAdjust', 'email', 'canEditMeetings', 'salesTarget', 'commissionRole'];
var INCENTIVES_COLS = ['id', 'userId', 'userName', 'period', 'amount', 'note', 'setBy', 'setAt', 'emailedAt'];
var COMMISSION_COLS = ['period', 'payload', 'updatedAt', 'updatedBy'];
var MEETING_COLS = ['id', 'date', 'title', 'notes', 'createdBy', 'updatedAt'];
var AGENDA_COLS = ['id', 'text', 'addedBy', 'addedById', 'createdAt'];
var REQUEST_COLS = ['id', 'employeeId', 'employeeName', 'approverId', 'type', 'otherLabel',
  'startDate', 'endDate', 'days', 'reason', 'status', 'submittedAt', 'decidedBy', 'decidedAt', 'decisionNote', 'halfDay'];
var SICKNOTE_COLS = ['id', 'employeeId', 'employeeName', 'label', 'fileName', 'uploadedAt', 'link'];
var REPORT_COLS = ['month', 'finalizedBy', 'finalizedAt', 'driveLink', 'emailedTo'];

// ── Entry points ────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    var action = (e && e.parameter && e.parameter.action) || 'ping';
    if (action === 'ping') return json_({ ok: true, version: VERSION });
    if (!secretOk_(e.parameter && e.parameter.secret)) return json_({ error: 'Unauthorized' });
    if (action === 'getData') {
      return json_({ ok: true, users: readUsersSafe_(), requests: readRequests_(), sickNotes: readSickNotes_(),
        reports: readReports_(), meetings: readMeetings_(), agenda: readAgenda_(),
        incentives: readIncentives_(), commission: readCommissionPeriods_(), settings: readSettings_() });
    }
    return json_({ error: 'Unknown action: ' + action });
  } catch (err) {
    return json_({ error: String(err) });
  }
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) body = JSON.parse(e.postData.contents);
    if (body.action === 'ping') return json_({ ok: true, version: VERSION });
    if (!secretOk_(body.secret)) return json_({ error: 'Unauthorized' });

    switch (body.action) {
      case 'login':          return json_(login_(body.username, body.password));
      case 'submitRequest':  return json_(submitRequest_(body.request));
      case 'decideRequest':  return json_(decideRequest_(body.id, body.status, body.deciderName, body.note));
      case 'cancelRequest':  return json_(cancelRequest_(body.id));
      case 'addUser':        return json_(addUser_(body.user));
      case 'updateUser':     return json_(updateUser_(body.id, body.patch));
      case 'deleteUser':     return json_(deleteUser_(body.id));
      case 'uploadSickNote': return json_(uploadSickNote_(body.note));
      case 'deleteSickNote': return json_(deleteSickNote_(body.id));
      case 'finalizeMonth':  return json_(finalizeMonth_(body));
      case 'addAgendaItem':       return json_(addAgendaItem_(body.item));
      case 'deleteAgendaItem':    return json_(deleteRowById_(AGENDA_SHEET, body.id));
      case 'addMeeting':          return json_(addMeeting_(body.meeting));
      case 'updateMeeting':       return json_(updateMeeting_(body.id, body.patch));
      case 'deleteMeeting':       return json_(deleteRowById_(MEETINGS_SHEET, body.id));
      case 'setIncentive':          return json_(setIncentive_(body.incentive));
      case 'bulkSendIncentives':    return json_(bulkSendIncentives_(body.period, body.sentBy));
      case 'sendSalesReport':       return json_(sendSalesReport_(body.salesData, body.period, body.sentBy));
      case 'saveCommissionPeriod':  return json_(saveCommissionPeriod_(body.period, body.payload, body.updatedBy));
      case 'sendMonthEndPayouts':   return json_(sendMonthEndPayouts_(body.period, body.payouts, body.sentBy));
      case 'sendDailyProgress':     return json_(sendDailyProgress_(body.period, body.progress, body.sentBy));
      case 'saveSettings':          return json_(saveSettings_(body.patch, body.updatedBy));
      case 'sendAuditorReport':     return json_(sendAuditorReport_(body));
      default:                    return json_({ error: 'Unknown action: ' + body.action });
    }
  } catch (err) {
    return json_({ error: String(err) });
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────

function login_(username, password) {
  var u = String(username || '').trim().toLowerCase();
  var rows = readUsers_();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].username).toLowerCase() === u && String(rows[i].password) === String(password)) {
      return { ok: true, user: sanitize_(rows[i]) };
    }
  }
  return { error: 'Incorrect username or password.' };
}

// ── Requests ────────────────────────────────────────────────────────────────

function submitRequest_(req) {
  // Reject overlapping leave for the same person (Pending or Approved already on file).
  var reqStart = ymd_(req.startDate), reqEnd = ymd_(req.endDate);
  var existing = readRequests_();
  for (var x = 0; x < existing.length; x++) {
    var ex = existing[x];
    if (Number(ex.employeeId) === Number(req.employeeId) &&
        (ex.status === 'Pending' || ex.status === 'Approved') &&
        ymd_(ex.startDate) <= reqEnd && reqStart <= ymd_(ex.endDate)) {
      return { error: 'Overlapping leave already exists for this period (' + ymd_(ex.startDate) + ' to ' + ymd_(ex.endDate) + ').' };
    }
  }
  sheet_(REQUESTS_SHEET).appendRow(REQUEST_COLS.map(function (c) { return req[c] != null ? req[c] : ''; }));
  var typeLabel = req.type === 'Other' && req.otherLabel ? 'Other — ' + req.otherLabel : req.type;
  var dateLine = 'Type: ' + typeLabel + '\n' +
    'Dates: ' + ymd_(req.startDate) + ' to ' + ymd_(req.endDate) + ' (' + req.days + ' day(s))\n';
  if (req.status === 'Approved') {
    // On-behalf entry (admin/approver logged the leave): notify the employee it was recorded.
    var toEmp = userEmailById_(req.employeeId);
    if (toEmp) {
      notify_(toEmp, 'Leave recorded for you',
        (req.decidedBy ? req.decidedBy + ' has' : 'Leave has been') + ' recorded leave on your behalf.\n\n' +
        dateLine +
        (req.reason ? 'Notes: ' + req.reason + '\n' : '') +
        '\nView it in the portal:\n' + PORTAL_URL);
    }
  } else {
    // Normal self-application: notify the approver that a request is waiting.
    var to = userEmailById_(req.approverId);
    if (to) {
      notify_(to, 'Leave request from ' + req.employeeName,
        req.employeeName + ' has applied for leave.\n\n' +
        dateLine +
        (req.reason ? 'Notes: ' + req.reason + '\n' : '') +
        '\nReview and approve it here:\n' + PORTAL_URL);
    }
  }
  return { ok: true };
}

function decideRequest_(id, status, deciderName, note) {
  var decided = status === 'Pending'; // 'Pending' = an undo
  var res = updateRowById_(REQUESTS_SHEET, id, {
    status: status,
    decidedBy: decided ? '' : (deciderName || ''),
    decidedAt: decided ? '' : new Date().toISOString(),
    decisionNote: '',
  });
  // Notify the employee of an approve/decline (not on undo).
  if (!decided) {
    var rows = readRequests_();
    for (var i = 0; i < rows.length; i++) {
      if (Number(rows[i].id) === Number(id)) {
        var r = rows[i];
        var to = userEmailById_(r.employeeId);
        if (to) {
          var typeLabel = r.type === 'Other' && r.otherLabel ? 'Other — ' + r.otherLabel : r.type;
          notify_(to, 'Your leave was ' + status,
            'Your leave request has been ' + status.toLowerCase() + '.\n\n' +
            'Type: ' + typeLabel + '\n' +
            'Dates: ' + ymd_(r.startDate) + ' to ' + ymd_(r.endDate) + ' (' + r.days + ' day(s))\n' +
            (deciderName ? 'Decided by ' + deciderName + '.\n' : '') +
            '\nView it in the portal:\n' + PORTAL_URL);
        }
        break;
      }
    }
  }
  return res;
}

function cancelRequest_(id) { return deleteRowById_(REQUESTS_SHEET, id); }

// ── Users ───────────────────────────────────────────────────────────────────

function addUser_(user) {
  var rows = readUsers_();
  var uname = String(user.username || '').trim().toLowerCase();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].username).toLowerCase() === uname) return { error: 'That username is already taken.' };
  }
  var clean = {
    id: user.id || Date.now(),
    name: String(user.name || '').trim(),
    username: uname,
    password: user.password || '',
    role: user.role === 'admin' ? 'admin' : 'employee',
    approverId: user.approverId ? Number(user.approverId) : '',
    startDate: user.startDate || '',
    annualAdjust: Number(user.annualAdjust) || 0,
    sickAdjust: Number(user.sickAdjust) || 0,
    familyAdjust: Number(user.familyAdjust) || 0,
    email: user.email || '',
    canEditMeetings: !!user.canEditMeetings,
    salesTarget: Number(user.salesTarget) || 0,
    commissionRole: user.commissionRole ? String(user.commissionRole).trim() : '',
  };
  sheet_(USERS_SHEET).appendRow(USER_COLS.map(function (c) { return clean[c]; }));
  return { ok: true, user: sanitize_(clean) };
}

function updateUser_(id, patch) {
  var clean = {};
  for (var k in patch) clean[k] = patch[k];
  if (clean.username != null) clean.username = String(clean.username).trim().toLowerCase();
  if (clean.approverId != null) clean.approverId = clean.approverId ? Number(clean.approverId) : '';
  if (clean.username != null) {
    var rows = readUsers_();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i].username).toLowerCase() === clean.username && Number(rows[i].id) !== Number(id)) {
        return { error: 'That username is already taken.' };
      }
    }
  }
  return updateRowById_(USERS_SHEET, id, clean);
}

function deleteUser_(id) {
  var rows = readUsers_();
  var approves = 0;
  for (var i = 0; i < rows.length; i++) if (Number(rows[i].approverId) === Number(id)) approves++;
  if (approves) return { error: 'That user approves ' + approves + ' people. Reassign them first.' };
  return deleteRowById_(USERS_SHEET, id);
}

// ── Sick notes ──────────────────────────────────────────────────────────────

function uploadSickNote_(note) {
  var link = '';
  if (SICK_NOTES_FOLDER_ID && note.dataBase64) {
    var bytes = Utilities.base64Decode(note.dataBase64);
    var blob = Utilities.newBlob(bytes, note.mimeType || 'application/octet-stream', note.fileName || note.label);
    var file = DriveApp.getFolderById(SICK_NOTES_FOLDER_ID).createFile(blob);
    file.setName((note.label || note.fileName) + ' — ' + note.employeeName);
    link = file.getUrl();
  }
  var rec = {
    id: note.id || Date.now(),
    employeeId: Number(note.employeeId),
    employeeName: note.employeeName || '',
    label: note.label || note.fileName || 'Sick note',
    fileName: note.fileName || '',
    uploadedAt: note.uploadedAt || new Date().toISOString(),
    link: link,
  };
  sheet_(SICKNOTES_SHEET).appendRow(SICKNOTE_COLS.map(function (c) { return rec[c]; }));
  return { ok: true };
}

function deleteSickNote_(id) { return deleteRowById_(SICKNOTES_SHEET, id); }

// ── Finalize month ──────────────────────────────────────────────────────────
// Saves the supplied (client-built) PDF to Drive, emails it to the accountants,
// and logs the action. body = { month, monthLabel, pdfBase64, fileName,
// finalizedBy, recipients }.
function finalizeMonth_(body) {
  if (!body.pdfBase64) return { error: 'No report attached.' };
  var bytes = Utilities.base64Decode(body.pdfBase64);
  var blob = Utilities.newBlob(bytes, 'application/pdf', body.fileName || ('Leave-' + body.month + '.pdf'));

  var driveLink = '';
  if (REPORTS_FOLDER_ID) {
    var file = DriveApp.getFolderById(REPORTS_FOLDER_ID).createFile(blob);
    driveLink = file.getUrl();
  }

  // Recipients = the chosen accountant address plus the leave Pabbly hook (Drive drop-off).
  var leaveHook = (readSettings_().leaveHook || '').trim();
  var recipients = [(body.recipients || ACCOUNTANTS_EMAIL || '').trim(), leaveHook].filter(Boolean).join(',');
  var emailedTo = '';
  if (recipients) {
    var key = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
    if (key) {
      // Resend with PDF attachment (base64)
      var pdfB64 = Utilities.base64Encode(bytes);
      UrlFetchApp.fetch('https://api.resend.com/emails', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'Authorization': 'Bearer ' + key },
        payload: JSON.stringify({
          from: FROM_NAME + ' <' + FROM_EMAIL + '>',
          to: recipients.split(',').map(function(e){ return e.trim(); }).filter(Boolean),
          subject: 'CabGlass leave report — ' + (body.monthLabel || body.month),
          text: 'Attached is the finalised leave report for ' + (body.monthLabel || body.month) + '.\n\n'
            + 'Finalised by ' + (body.finalizedBy || 'admin') + '.'
            + (driveLink ? '\nDrive copy: ' + driveLink : ''),
          attachments: [{ filename: body.fileName || ('Leave-' + body.month + '.pdf'), content: pdfB64 }],
        }),
        muteHttpExceptions: true,
      });
    } else {
      MailApp.sendEmail({
        to: recipients,
        subject: 'CabGlass leave report — ' + (body.monthLabel || body.month),
        body: 'Attached is the finalised leave report for ' + (body.monthLabel || body.month) + '.\n\n'
          + 'Finalised by ' + (body.finalizedBy || 'admin') + '.'
          + (driveLink ? '\nDrive copy: ' + driveLink : ''),
        attachments: [blob],
      });
    }
    emailedTo = recipients;
  }

  if (!driveLink && !emailedTo) {
    return { error: 'Nothing configured: set REPORTS_FOLDER_ID and/or enter recipient email(s).' };
  }

  sheet_(REPORTS_SHEET).appendRow([
    body.month, body.finalizedBy || '', new Date().toISOString(), driveLink, emailedTo,
  ]);
  return { ok: true, driveLink: driveLink, emailedTo: emailedTo };
}

// ── Settings (auditor email + Pabbly mail hooks) ─────────────────────────────

function readSettings_() {
  var rows = readObjects_(SETTINGS_SHEET);
  var out = { auditorEmail: '', incentiveHook: '', leaveHook: '' };
  rows.forEach(function (r) { if (r.key && out.hasOwnProperty(r.key)) out[String(r.key)] = String(r.value == null ? '' : r.value); });
  return out;
}

// Upsert one or more settings keys.
function saveSettings_(patch, updatedBy) {
  var sh = sheet_(SETTINGS_SHEET);
  var values = sh.getDataRange().getValues();
  var header = values[0];
  var kCol = header.indexOf('key'), vCol = header.indexOf('value'),
      atCol = header.indexOf('updatedAt'), byCol = header.indexOf('updatedBy');
  var now = new Date().toISOString();
  Object.keys(patch || {}).forEach(function (k) {
    if (SETTINGS_KEYS.indexOf(k) < 0) return;
    var found = false;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][kCol]) === k) {
        sh.getRange(r + 1, vCol + 1).setValue(patch[k]);
        sh.getRange(r + 1, atCol + 1).setValue(now);
        sh.getRange(r + 1, byCol + 1).setValue(updatedBy || '');
        found = true; break;
      }
    }
    if (!found) { sh.appendRow([k, patch[k], now, updatedBy || '']); values.push([k, patch[k], now, updatedBy || '']); }
  });
  return { ok: true };
}

// Email the client-built incentive report PDF to the auditor + the incentive
// Pabbly mail hook (Drive drop-off). body = { from, to, base64, fileName, sentBy }.
function sendAuditorReport_(body) {
  if (!body.base64) return { error: 'No report attached.' };
  var s = readSettings_();
  var to = [s.auditorEmail, s.incentiveHook].map(function (e) { return (e || '').trim(); }).filter(Boolean);
  if (!to.length) return { error: 'Set the auditor email in Admin → Settings first.' };

  var bytes = Utilities.base64Decode(body.base64);
  var fileName = body.fileName || 'CabGlass-Incentives.pdf';
  var subject = 'CabGlass incentive report — ' + ymd_(body.from) + ' to ' + ymd_(body.to);
  var text = 'Attached is the incentive & commission report for ' + ymd_(body.from) + ' to ' + ymd_(body.to) + '.\n\n'
    + 'Sent by ' + (body.sentBy || 'admin') + '.';

  var key = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
  if (key) {
    UrlFetchApp.fetch('https://api.resend.com/emails', {
      method: 'post', contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + key },
      payload: JSON.stringify({
        from: FROM_NAME + ' <' + FROM_EMAIL + '>',
        to: to, subject: subject, text: text,
        attachments: [{ filename: fileName, content: body.base64 }],
      }),
      muteHttpExceptions: true,
    });
  } else {
    var blob = Utilities.newBlob(bytes, 'application/pdf', fileName);
    MailApp.sendEmail({ to: to.join(','), subject: subject, body: text, attachments: [blob] });
  }
  return { ok: true, sentTo: to.join(', '), note: s.incentiveHook ? 'auditor + Drive hook' : 'auditor' };
}

// ── Dates & email ───────────────────────────────────────────────────────────

function tz_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Africa/Johannesburg';
}

// Normalise a leave date to 'yyyy-MM-dd'. Sheets often turns a typed date into a
// Date cell; reading it back raw yields a UTC timestamp that breaks the client's
// date maths (empty calendar / blank report). Formatting in the sheet's timezone
// fixes that.
function ymd_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  var s = String(v == null ? '' : v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

// Normalise a period value to 'yyyy-MM'. Google Sheets coerces a typed "2026-07"
// into a Date cell, which reads back as a long date string — this recovers the
// canonical 'yyyy-MM' key from a Date, a date string, or an already-correct value.
function ym_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM');
  var s = String(v == null ? '' : v);
  var m = s.match(/^(\d{4})-(\d{2})/);
  if (m) return m[1] + '-' + m[2];
  var d = new Date(s);
  return isNaN(d) ? s : Utilities.formatDate(d, tz_(), 'yyyy-MM');
}

function userEmailById_(id) {
  if (id == null || id === '') return '';
  var rows = readUsers_();
  for (var i = 0; i < rows.length; i++) if (Number(rows[i].id) === Number(id)) return rows[i].email || '';
  return '';
}

var FROM_EMAIL = 'info@cabglass.co.za';
var FROM_NAME  = 'CabGlass Leave Tracker';

// Fire-and-forget: never let a mail failure break the request.
// Sends via Resend (resend.com) — API key stored in Script Properties as RESEND_API_KEY.
function notify_(to, subject, body) {
  if (!to) return;
  try {
    var key = PropertiesService.getScriptProperties().getProperty('RESEND_API_KEY');
    if (!key) { MailApp.sendEmail({ to: to, subject: subject, body: body }); return; }
    UrlFetchApp.fetch('https://api.resend.com/emails', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'Authorization': 'Bearer ' + key },
      payload: JSON.stringify({
        from: FROM_NAME + ' <' + FROM_EMAIL + '>',
        to: to.split(',').map(function(e){ return e.trim(); }).filter(Boolean),
        subject: subject,
        text: body,
      }),
      muteHttpExceptions: true,
    });
  } catch (e) { /* ignore */ }
}

// ── Meetings & agenda ───────────────────────────────────────────────────────

function addAgendaItem_(item) {
  var rec = {
    id: item.id || Date.now(),
    text: (item.text || '').trim(),
    addedBy: item.addedBy || '',
    addedById: Number(item.addedById) || '',
    createdAt: item.createdAt || new Date().toISOString(),
  };
  sheet_(AGENDA_SHEET).appendRow(AGENDA_COLS.map(function (c) { return rec[c]; }));
  return { ok: true };
}

function addMeeting_(m) {
  var rec = {
    id: m.id || Date.now(),
    date: m.date || '',
    title: (m.title || '').trim(),
    notes: m.notes || '',
    createdBy: m.createdBy || '',
    updatedAt: new Date().toISOString(),
  };
  sheet_(MEETINGS_SHEET).appendRow(MEETING_COLS.map(function (c) { return rec[c]; }));
  return { ok: true };
}

function updateMeeting_(id, patch) {
  var clean = {};
  for (var k in patch) clean[k] = patch[k];
  clean.updatedAt = new Date().toISOString();
  return updateRowById_(MEETINGS_SHEET, id, clean);
}

// ── Sheet helpers ───────────────────────────────────────────────────────────

function headerFor_(name) {
  if (name === USERS_SHEET) return USER_COLS;
  if (name === REQUESTS_SHEET) return REQUEST_COLS;
  if (name === SICKNOTES_SHEET) return SICKNOTE_COLS;
  if (name === REPORTS_SHEET) return REPORT_COLS;
  if (name === MEETINGS_SHEET) return MEETING_COLS;
  if (name === INCENTIVES_SHEET) return INCENTIVES_COLS;
  if (name === COMMISSION_SHEET) return COMMISSION_COLS;
  if (name === SETTINGS_SHEET) return SETTINGS_COLS;
  return AGENDA_COLS;
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(headerFor_(name)); }
  if (sh.getLastRow() === 0) sh.appendRow(headerFor_(name));
  return sh;
}

// Add any expected header columns that an older sheet is missing (in order).
function ensureColumns_(name) {
  var sh = sheet_(name);
  var expected = headerFor_(name);
  var lastCol = sh.getLastColumn();
  var header = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0] : [];
  expected.forEach(function (col) {
    if (header.indexOf(col) === -1) {
      sh.getRange(1, sh.getLastColumn() + 1).setValue(col);
      header.push(col);
    }
  });
}

function readObjects_(name) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var header = values[0];
  var out = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    if (row.join('') === '') continue;
    var obj = {};
    for (var c = 0; c < header.length; c++) obj[header[c]] = row[c];
    out.push(obj);
  }
  return out;
}

function readUsers_() {
  return readObjects_(USERS_SHEET).map(function (u) {
    u.id = Number(u.id);
    u.approverId = u.approverId === '' || u.approverId == null ? null : Number(u.approverId);
    u.annualAdjust = Number(u.annualAdjust) || 0;
    u.sickAdjust = Number(u.sickAdjust) || 0;
    u.familyAdjust = Number(u.familyAdjust) || 0;
    u.salesTarget = Number(u.salesTarget) || 0;
    u.commissionRole = u.commissionRole ? String(u.commissionRole).trim() : '';
    u.startDate = ymd_(u.startDate);
    u.email = u.email == null ? '' : String(u.email);
    u.canEditMeetings = u.canEditMeetings === true || u.canEditMeetings === 'TRUE' || u.canEditMeetings === 'true' || u.canEditMeetings === 1 || u.canEditMeetings === '1';
    return u;
  });
}

function readUsersSafe_() { return readUsers_().map(sanitize_); }

function readRequests_() {
  return readObjects_(REQUESTS_SHEET).map(function (r) {
    r.id = Number(r.id);
    r.employeeId = Number(r.employeeId);
    r.approverId = r.approverId === '' || r.approverId == null ? null : Number(r.approverId);
    r.days = Number(r.days) || 0;
    r.startDate = ymd_(r.startDate);
    r.endDate = ymd_(r.endDate);
    return r;
  });
}

function readSickNotes_() {
  return readObjects_(SICKNOTES_SHEET).map(function (n) {
    n.id = Number(n.id);
    n.employeeId = Number(n.employeeId);
    return n;
  });
}

function readReports_() {
  return readObjects_(REPORTS_SHEET);
}

function readMeetings_() {
  return readObjects_(MEETINGS_SHEET).map(function (m) { m.id = Number(m.id); m.date = ymd_(m.date); return m; });
}

function readAgenda_() {
  return readObjects_(AGENDA_SHEET).map(function (a) { a.id = Number(a.id); a.addedById = a.addedById === '' || a.addedById == null ? null : Number(a.addedById); return a; });
}

function readIncentives_() {
  return readObjects_(INCENTIVES_SHEET).map(function (i) {
    i.id = Number(i.id);
    i.userId = Number(i.userId);
    i.amount = Number(i.amount) || 0;
    return i;
  });
}

// ── Incentives ───────────────────────────────────────────────────────────────

// Upsert: one record per userId + period. Updates in-place if found, appends otherwise.
function setIncentive_(incentive) {
  var sh = sheet_(INCENTIVES_SHEET);
  var values = sh.getDataRange().getValues();
  if (values.length < 1) { sh.appendRow(INCENTIVES_COLS); values = sh.getDataRange().getValues(); }
  var header = values[0];
  var userIdCol = header.indexOf('userId');
  var periodCol = header.indexOf('period');
  for (var r = 1; r < values.length; r++) {
    if (Number(values[r][userIdCol]) === Number(incentive.userId) &&
        String(values[r][periodCol]) === String(incentive.period)) {
      for (var key in incentive) {
        var c = header.indexOf(key);
        if (c >= 0) sh.getRange(r + 1, c + 1).setValue(incentive[key]);
      }
      return { ok: true };
    }
  }
  var rec = {
    id: incentive.id || Date.now(),
    userId: Number(incentive.userId),
    userName: incentive.userName || '',
    period: incentive.period || '',
    amount: Number(incentive.amount) || 0,
    note: incentive.note || '',
    setBy: incentive.setBy || '',
    setAt: incentive.setAt || new Date().toISOString(),
    emailedAt: '',
  };
  sh.appendRow(INCENTIVES_COLS.map(function (c) { return rec[c]; }));
  return { ok: true };
}

// Send each user with a set incentive for the period an email with their amount + note.
function bulkSendIncentives_(period, sentBy) {
  var incentives = readIncentives_().filter(function (i) { return String(i.period) === String(period); });
  if (!incentives.length) return { error: 'No incentives set for ' + period + '.' };
  var users = readUsers_();
  var sent = 0;
  var periodLabel = formatPeriod_(period);
  incentives.forEach(function (inc) {
    if (!inc.amount && !inc.note) return;
    var u = users.find(function (u) { return Number(u.id) === Number(inc.userId); });
    var email = u ? u.email : '';
    if (!email) return;
    var body = 'Hi ' + (u ? u.name : inc.userName) + ',\n\n' +
      'Your incentive for ' + periodLabel + ':\n\n' +
      (inc.amount ? 'Amount: R ' + Number(inc.amount).toFixed(2) + '\n' : '') +
      (inc.note ? 'Note: ' + inc.note + '\n' : '') +
      '\nKind regards,\nCabGlass Management\n' + PORTAL_URL;
    notify_(email, 'Your incentive for ' + periodLabel, body);
    updateRowById_(INCENTIVES_SHEET, inc.id, { emailedAt: new Date().toISOString() });
    sent++;
  });
  return { ok: true, sent: sent };
}

// Email each sales person their achieved figure vs target for the period.
// salesData = [{ userId, userName, email, target, achieved, period }]
function sendSalesReport_(salesData, period, sentBy) {
  if (!salesData || !salesData.length) return { error: 'No sales data provided.' };
  var periodLabel = formatPeriod_(period);
  var sent = 0;
  salesData.forEach(function (row) {
    if (!row.email) return;
    var pct = row.target > 0 ? Math.round((row.achieved / row.target) * 100) : null;
    var body = 'Hi ' + row.userName + ',\n\n' +
      'Here is your sales performance for ' + periodLabel + ':\n\n' +
      'Target:   R ' + Number(row.target).toFixed(2) + '\n' +
      'Achieved: R ' + Number(row.achieved).toFixed(2) + '\n' +
      (pct !== null ? 'Progress: ' + pct + '%\n' : '') +
      '\n' + (pct !== null && pct >= 100
        ? 'Congratulations! You\'ve hit your target for the month!'
        : pct !== null
          ? 'Keep pushing — you\'re R ' + (Number(row.target) - Number(row.achieved)).toFixed(2) + ' away from your target.'
          : '') +
      '\n\nKind regards,\nCabGlass Management\n' + PORTAL_URL;
    notify_(row.email, 'Your sales performance — ' + periodLabel, body);
    sent++;
  });
  return { ok: true, sent: sent };
}

// Format 'YYYY-MM' → 'Month YYYY' for email subjects.
function formatPeriod_(period) {
  var months = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var parts = String(period).split('-');
  var m = parseInt(parts[1], 10) - 1;
  return (months[m] || parts[1]) + ' ' + parts[0];
}

// ── Commission data ──────────────────────────────────────────────────────────

function readCommissionPeriods_() {
  var rows = readObjects_(COMMISSION_SHEET);
  var result = {};
  rows.forEach(function (r) {
    try { result[ym_(r.period)] = JSON.parse(String(r.payload)); } catch (e) {}
  });
  return result;
}

// Upsert one period's payload (JSON string stored in 'payload' column).
function saveCommissionPeriod_(period, payload, updatedBy) {
  var sh = sheet_(COMMISSION_SHEET);
  var values = sh.getDataRange().getValues();
  if (values.length < 1) { sh.appendRow(COMMISSION_COLS); values = sh.getDataRange().getValues(); }
  var header = values[0];
  var pCol = header.indexOf('period');
  var payCol = header.indexOf('payload');
  var atCol = header.indexOf('updatedAt');
  var byCol = header.indexOf('updatedBy');
  var payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  var now = new Date().toISOString();
  var key = ym_(period);
  for (var r = 1; r < values.length; r++) {
    if (ym_(values[r][pCol]) === key) {
      // Rewrite the period cell as plain text so Sheets stops coercing it to a date.
      sh.getRange(r + 1, pCol + 1).setNumberFormat('@').setValue(key);
      sh.getRange(r + 1, payCol + 1).setValue(payloadStr);
      sh.getRange(r + 1, atCol + 1).setValue(now);
      sh.getRange(r + 1, byCol + 1).setValue(updatedBy || '');
      return { ok: true };
    }
  }
  var newRow = sh.getLastRow() + 1;
  sh.getRange(newRow, pCol + 1).setNumberFormat('@').setValue(key); // text, not date
  sh.getRange(newRow, payCol + 1).setValue(payloadStr);
  sh.getRange(newRow, atCol + 1).setValue(now);
  sh.getRange(newRow, byCol + 1).setValue(updatedBy || '');
  return { ok: true };
}

// Send individual month-end payout emails.
// payouts = [{ userId, userName, email, role, breakdown, total }]
function sendMonthEndPayouts_(period, payouts, sentBy) {
  if (!payouts || !payouts.length) return { error: 'No payouts provided.' };
  var periodLabel = formatPeriod_(period);
  var sent = 0;
  payouts.forEach(function (p) {
    if (!p.email) return;
    var lines = ['Hi ' + p.userName + ',', '',
      'Here is your incentive breakdown for ' + periodLabel + ':', ''];
    if (p.breakdown) {
      Object.keys(p.breakdown).forEach(function (k) {
        if (p.breakdown[k] !== null && p.breakdown[k] !== undefined && p.breakdown[k] !== 0) {
          lines.push(k + ': R ' + Number(p.breakdown[k]).toFixed(2));
        }
      });
      lines.push('');
    }
    lines.push('Total payout: R ' + Number(p.total).toFixed(2));
    lines.push('');
    lines.push('Kind regards,\nCabGlass Management\n' + PORTAL_URL);
    notify_(p.email, 'Your incentive for ' + periodLabel, lines.join('\n'));
    sent++;
  });
  return { ok: true, sent: sent };
}

// Send a single combined daily progress email to all recipients.
// progress = { date, daysElapsed, workingDays, reps: [{ name, cumulative, monthlyTarget }] }
function sendDailyProgress_(period, progress, sentBy) {
  if (!progress) return { error: 'No progress data.' };
  var users = readUsers_();
  var periodLabel = formatPeriod_(period);
  var date = progress.date || new Date().toISOString().slice(0, 10);
  var days = Number(progress.daysElapsed) || 1;
  var workingDays = Number(progress.workingDays) || 20;
  var reps = progress.reps || [];

  var lines = ['Daily sales progress — ' + periodLabel + ' (' + date + ')', ''];
  reps.forEach(function (rep) {
    var cum = Number(rep.cumulative) || 0;
    var target = Number(rep.monthlyTarget) || 0;
    var dailyTarget = workingDays > 0 ? target / workingDays : 0;
    var expected = dailyTarget * days;
    var delta = cum - expected;
    var projected = days > 0 ? (cum / days) * workingDays : 0;
    var daysLeft = workingDays - days;
    var newDailyRate = daysLeft > 0 ? (target - cum) / daysLeft : 0;

    lines.push(rep.name + ':');
    lines.push('  Cumulative: R ' + fmt_(cum));
    lines.push('  ' + (delta >= 0 ? 'Ahead' : 'Behind') + ': R ' + fmt_(Math.abs(delta)));
    lines.push('  Projected month-end: R ' + fmt_(projected));
    lines.push('  New required daily rate: R ' + fmt_(Math.max(0, newDailyRate)));
    lines.push('');
  });
  lines.push('Portal: ' + PORTAL_URL);

  // Build recipient list: all reps with email + admin(s)
  var toList = [];
  reps.forEach(function (rep) {
    if (rep.email) toList.push(rep.email);
  });
  var admins = users.filter(function (u) { return u.role === 'admin' && u.email; });
  admins.forEach(function (u) { if (toList.indexOf(u.email) < 0) toList.push(u.email); });
  if (progress.extraRecipients) {
    String(progress.extraRecipients).split(',').forEach(function (e) {
      var t = e.trim(); if (t && toList.indexOf(t) < 0) toList.push(t);
    });
  }

  if (!toList.length) return { error: 'No recipients found — add email addresses to user accounts.' };
  notify_(toList.join(','), 'Daily sales progress — ' + date, lines.join('\n'));
  return { ok: true, sent: toList.length };
}

function fmt_(n) { return Math.round(n).toLocaleString(); }

// Run this ONCE from the editor to grant UrlFetchApp permission, then delete it.
function authorizeResend() {
  UrlFetchApp.fetch('https://api.resend.com/emails', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'Authorization': 'Bearer test' },
    payload: JSON.stringify({ from: 'test', to: ['test'], subject: 'test', text: 'test' }),
    muteHttpExceptions: true,
  });
}

function sanitize_(u) {
  return {
    id: Number(u.id), name: u.name, username: u.username, role: u.role,
    approverId: u.approverId === '' || u.approverId == null ? null : Number(u.approverId),
    startDate: ymd_(u.startDate),
    annualAdjust: Number(u.annualAdjust) || 0,
    sickAdjust: Number(u.sickAdjust) || 0,
    familyAdjust: Number(u.familyAdjust) || 0,
    salesTarget: Number(u.salesTarget) || 0,
    commissionRole: u.commissionRole ? String(u.commissionRole).trim() : '',
    email: u.email == null ? '' : String(u.email),
    canEditMeetings: !!u.canEditMeetings,
  };
}

function updateRowById_(name, id, patch) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  var header = values[0];
  var idCol = header.indexOf('id');
  for (var r = 1; r < values.length; r++) {
    if (Number(values[r][idCol]) === Number(id)) {
      for (var key in patch) {
        var c = header.indexOf(key);
        if (c >= 0) sh.getRange(r + 1, c + 1).setValue(patch[key]);
      }
      return { ok: true };
    }
  }
  return { error: 'Not found: ' + id };
}

function deleteRowById_(name, id) {
  var sh = sheet_(name);
  var values = sh.getDataRange().getValues();
  var header = values[0];
  var idCol = header.indexOf('id');
  for (var r = 1; r < values.length; r++) {
    if (Number(values[r][idCol]) === Number(id)) { sh.deleteRow(r + 1); return { ok: true }; }
  }
  return { error: 'Not found: ' + id };
}

// ── Misc ────────────────────────────────────────────────────────────────────

function secretOk_(provided) {
  var expected = PropertiesService.getScriptProperties().getProperty('DASHBOARD_SECRET');
  return expected && provided && String(provided) === String(expected);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Run ONCE from the editor (select setup → Run) to create the tabs and seed the
 * staff so you can log in. Safe to re-run: only seeds if Users is empty.
 */
function setup() {
  sheet_(USERS_SHEET);
  sheet_(REQUESTS_SHEET);
  sheet_(SICKNOTES_SHEET);
  sheet_(REPORTS_SHEET);
  sheet_(MEETINGS_SHEET);
  sheet_(AGENDA_SHEET);
  sheet_(INCENTIVES_SHEET);
  sheet_(COMMISSION_SHEET);
  sheet_(SETTINGS_SHEET);
  // Migrate older sheets: add any columns introduced in later versions.
  ensureColumns_(USERS_SHEET);
  ensureColumns_(REQUESTS_SHEET);
  ensureColumns_(SICKNOTES_SHEET);
  ensureColumns_(REPORTS_SHEET);
  ensureColumns_(MEETINGS_SHEET);
  ensureColumns_(AGENDA_SHEET);
  ensureColumns_(INCENTIVES_SHEET);
  ensureColumns_(COMMISSION_SHEET);
  ensureColumns_(SETTINGS_SHEET);
  if (readUsers_().length === 0) {
    var seed = [
      { id: 1, name: 'Claire',     username: 'admin',     password: 'admin123',     role: 'admin',    approverId: '', startDate: '2020-01-01' },
      { id: 2, name: 'Noel',       username: 'noel',      password: 'noel123',      role: 'admin',    approverId: '', startDate: '2015-03-01' },
      { id: 3, name: 'Ashton',     username: 'ashton',    password: 'ashton123',    role: 'employee', approverId: 2,  startDate: '2019-06-01' },
      { id: 4, name: 'Amy',        username: 'amy',       password: 'amy123',       role: 'employee', approverId: 2,  startDate: '2018-09-01' },
      { id: 5, name: 'Jono',       username: 'jono',      password: 'jono123',      role: 'employee', approverId: 3,  startDate: '2021-02-01' },
      { id: 6, name: 'Laurenso',   username: 'laurenso',  password: 'laurenso123',  role: 'employee', approverId: 3,  startDate: '2022-07-01' },
      { id: 7, name: 'Brendon DB', username: 'brendondb', password: 'brendondb123', role: 'employee', approverId: 4,  startDate: '2020-11-01' },
      { id: 8, name: 'Brendon V',  username: 'brendonv',  password: 'brendonv123',  role: 'employee', approverId: 4,  startDate: '2023-01-15' },
    ];
    var sh = sheet_(USERS_SHEET);
    seed.forEach(function (u) {
      u.annualAdjust = 0; u.sickAdjust = 0; u.familyAdjust = 0; u.email = ''; u.canEditMeetings = false;
      sh.appendRow(USER_COLS.map(function (c) { return u[c]; }));
    });
  }
}
