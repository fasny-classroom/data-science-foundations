/***** CONFIG *****/
// Levels left→right (used by the student slider)
const LEVELS = ["none","root","plant","tree"];
const ORDER  = LEVELS.reduce((m,v,i)=> (m[v]=i, m), {});
const EMOJI  = { none:"⚪", root:"🌱", plant:"🌿", tree:"🌳" };

// If you want to force a specific sheet name, set it here; otherwise uses the first sheet.
const SHEET_NAME = ""; // e.g. "Progress"; leave "" to use the active first sheet.

/***** UTIL *****/
function _ss(){ return SpreadsheetApp.getActive(); }
function _sheet(){
  if (SHEET_NAME) {
    const sh = _ss().getSheetByName(SHEET_NAME);
    if (!sh) throw new Error("Sheet '"+SHEET_NAME+"' not found.");
    return sh;
  }
  const sheets = _ss().getSheets();
  if (!sheets.length) throw new Error("No sheets found.");
  return sheets[0];
}
function _readAll(){
  const sh = _sheet();
  const rng = sh.getDataRange();
  const vals = rng.getValues();
  if (!vals.length || !vals[0].length) throw new Error("Sheet is empty.");
  return vals;
}
function _findEmailCol(header){
  // Accept "mail" or "email" (case-insensitive, trimmed)
  let idx = header.findIndex(h => String(h).trim().toLowerCase() === "mail");
  if (idx === -1) idx = header.findIndex(h => String(h).trim().toLowerCase() === "email");
  if (idx === -1) throw new Error("Header must contain 'mail' (or 'email') in column 1.");
  return idx;
}
function _assignmentsFromHeader(header, emailCol){
  const asgs = [];
  for (let c=0; c<header.length; c++){
    if (c === emailCol) continue;
    const name = String(header[c]).trim();
    if (name) asgs.push({name, col: c});
  }
  if (!asgs.length) throw new Error("No assignment columns found after 'mail' header.");
  return asgs;
}
function _getUserEmail(){
  const e = (Session.getActiveUser().getEmail() || "").trim().toLowerCase();
  if (!e) throw new Error("Not signed in (ensure deployment is 'Execute as user' and restricted to your domain).");
  return e;
}
function _ensureStudentRow(email, header, emailCol){
  const sh = _sheet();
  const lastRow = sh.getLastRow();
  if (lastRow < 1) throw new Error("Sheet has no header.");
  const colA = sh.getRange(2, emailCol+1, Math.max(0, lastRow-1), 1).getValues(); // 2..N
  for (let i=0; i<colA.length; i++){
    const cell = String(colA[i][0]).trim().toLowerCase();
    if (cell && cell === email) return 2 + i; // row index (1-based)
  }
  // Not found: append new row with defaults
  const row = new Array(header.length).fill("");
  row[emailCol] = email;
  for (let c=0; c<header.length; c++){
    if (c === emailCol) continue;
    row[c] = "none";
  }
  sh.appendRow(row);
  return sh.getLastRow();
}

/***** ROUTER *****/
function doGet(e){
  const page = (e && e.parameter && e.parameter.page) || "student"; // default to student
  const tpl = HtmlService.createTemplateFromFile(page === "dashboard" ? "dashboard" : "student");
  return tpl.evaluate()
    .setTitle("Progress Portal")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(name){ return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/***** API: student *****/
function getStudentStatus(){
  const vals = _readAll();
  const header = vals[0];
  const emailCol = _findEmailCol(header);
  const email = _getUserEmail();

  // Build assignments list
  const asgs = _assignmentsFromHeader(header, emailCol); // {name, col}

  // Ensure row exists
  const rowIdx = _ensureStudentRow(email, header, emailCol);

  // Read current levels for this row
  const sh = _sheet();
  const rowVals = sh.getRange(rowIdx, 1, 1, header.length).getValues()[0];
  const levels = {};
  asgs.forEach(a => {
    let v = String(rowVals[a.col] || "").trim().toLowerCase();
    if (!LEVELS.includes(v)) v = "none"; // normalize
    levels[a.name] = v;
  });

  return {
    me: { email },
    assignments: asgs.map(a => a.name),
    levels,              // map name -> level
    levelsOrder: LEVELS, // tell client the order
    emoji: EMOJI
  };
}

function setStudentLevel(assignment, level){
  const vals = _readAll();
  const header = vals[0];
  const emailCol = _findEmailCol(header);
  const asgs = _assignmentsFromHeader(header, emailCol);
  const email = _getUserEmail();

  if (!LEVELS.includes(String(level).toLowerCase())) throw new Error("Invalid level.");
  const a = asgs.find(x => x.name === assignment);
  if (!a) throw new Error("Unknown assignment: " + assignment);

  const rowIdx = _ensureStudentRow(email, header, emailCol);

  // Set the exact level (overwrites prior value)
  const sh = _sheet();
  sh.getRange(rowIdx, a.col + 1).setValue(String(level).toLowerCase());

  return { ok: true, level: String(level).toLowerCase() };
}

/***** API: dashboard *****/
function getDashboardData(){
  const vals = _readAll();
  const header = vals[0];
  const emailCol = _findEmailCol(header);
  const asgs = _assignmentsFromHeader(header, emailCol);

  const rows = [];
  for (let r=1; r<vals.length; r++){
    const email = String(vals[r][emailCol] || "").trim();
    if (!email) continue;
    const lvls = asgs.map(a => {
      const v = String(vals[r][a.col] || "").trim().toLowerCase();
      return LEVELS.includes(v) ? v : "none";
    });
    rows.push({ email, levels: lvls });
  }

  // counts per assignment
  const counts = {};
  asgs.forEach((a, idx) => {
    counts[a.name] = { none:0, root:0, plant:0, tree:0 };
    rows.forEach(rec => counts[a.name][rec.levels[idx]]++);
  });

  // per-student progress (% of tree=3)
  rows.forEach(rec => {
    const sum = rec.levels.reduce((s,l)=> s + (ORDER[l] || 0), 0);
    rec.progress = Math.round(100 * sum / (asgs.length * (LEVELS.length - 1)));
  });

  return {
    assignments: asgs.map(a => a.name),
    levels: LEVELS,
    emoji: EMOJI,
    counts,
    rows // {email, levels[by index], progress}
  };
}
