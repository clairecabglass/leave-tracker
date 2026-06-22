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

var VERSION = '2026-06-leave-v7';

// Public address of the portal, added as a link in notification emails.
var PORTAL_URL = 'https://portal.cabglass.co.za';

// Drive folder where uploaded sick notes are saved. While blank, uploads still
// record the file name + uploader but no file is stored.
var SICK_NOTES_FOLDER_ID = '1W-YitHNqNpTKcHMgaVWakSXju5z4mmPO';

// Finalize-month: where the monthly PDF is saved, and who it's emailed to.
// REPORTS_FOLDER_ID can reuse a Drive folder; ACCOUNTANTS_EMAIL can be one or
// several comma-separated addresses. The admin can also type recipients in the
// UI, which overrides ACCOUNTANTS_EMAIL for that send.
var REPORTS_FOLDER_ID = '';
var ACCOUNTANTS_EMAIL = '';

var USERS_SHEET = 'Users';
var REQUESTS_SHEET = 'LeaveRequests';
var SICKNOTES_SHEET = 'SickNotes';
var REPORTS_SHEET = 'MonthlyReports';
var MEETINGS_SHEET = 'Meetings';
var AGENDA_SHEET = 'AgendaItems';

var USER_COLS = ['id', 'name', 'username', 'password', 'role', 'approverId', 'startDate',
  'annualAdjust', 'sickAdjust', 'familyAdjust', 'email', 'canEditMeetings'];
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
        reports: readReports_(), meetings: readMeetings_(), agenda: readAgenda_() });
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
      case 'addAgendaItem':  return json_(addAgendaItem_(body.item));
      case 'deleteAgendaItem': return json_(deleteRowById_(AGENDA_SHEET, body.id));
      case 'addMeeting':     return json_(addMeeting_(body.meeting));
      case 'updateMeeting':  return json_(updateMeeting_(body.id, body.patch));
      case 'deleteMeeting':  return json_(deleteRowById_(MEETINGS_SHEET, body.id));
      default:               return json_({ error: 'Unknown action: ' + body.action });
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
  sheet_(REQUESTS_SHEET).appendRow(REQUEST_COLS.map(function (c) { return req[c] != null ? req[c] : ''; }));
  // Notify the approver that a request is waiting.
  var to = userEmailById_(req.approverId);
  if (to) {
    var typeLabel = req.type === 'Other' && req.otherLabel ? 'Other — ' + req.otherLabel : req.type;
    notify_(to, 'Leave request from ' + req.employeeName,
      req.employeeName + ' has applied for leave.\n\n' +
      'Type: ' + typeLabel + '\n' +
      'Dates: ' + ymd_(req.startDate) + ' to ' + ymd_(req.endDate) + ' (' + req.days + ' day(s))\n' +
      (req.reason ? 'Notes: ' + req.reason + '\n' : '') +
      '\nReview and approve it here:\n' + PORTAL_URL);
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

  var recipients = (body.recipients || ACCOUNTANTS_EMAIL || '').trim();
  var emailedTo = '';
  if (recipients) {
    MailApp.sendEmail({
      to: recipients,
      subject: 'CabGlass leave report — ' + (body.monthLabel || body.month),
      body: 'Attached is the finalised leave report for ' + (body.monthLabel || body.month) + '.\n\n'
        + 'Finalised by ' + (body.finalizedBy || 'admin') + '.'
        + (driveLink ? '\nDrive copy: ' + driveLink : ''),
      attachments: [blob],
    });
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

function userEmailById_(id) {
  if (id == null || id === '') return '';
  var rows = readUsers_();
  for (var i = 0; i < rows.length; i++) if (Number(rows[i].id) === Number(id)) return rows[i].email || '';
  return '';
}

// Fire-and-forget: never let a mail failure break the request.
function notify_(to, subject, body) {
  if (!to) return;
  try { MailApp.sendEmail({ to: to, subject: subject, body: body }); }
  catch (e) { /* ignore */ }
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

function sanitize_(u) {
  return {
    id: Number(u.id), name: u.name, username: u.username, role: u.role,
    approverId: u.approverId === '' || u.approverId == null ? null : Number(u.approverId),
    startDate: ymd_(u.startDate),
    annualAdjust: Number(u.annualAdjust) || 0,
    sickAdjust: Number(u.sickAdjust) || 0,
    familyAdjust: Number(u.familyAdjust) || 0,
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
  // Migrate older sheets: add any columns introduced in later versions.
  ensureColumns_(USERS_SHEET);
  ensureColumns_(REQUESTS_SHEET);
  ensureColumns_(SICKNOTES_SHEET);
  ensureColumns_(REPORTS_SHEET);
  ensureColumns_(MEETINGS_SHEET);
  ensureColumns_(AGENDA_SHEET);
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
