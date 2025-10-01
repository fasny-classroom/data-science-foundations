/***** CONFIG *****/
// Four states: default is "none" (not yet), then root → plant → tree
const ASSIGNMENTS = ["A1","A2","A3","A4","A5","A6","A7","A8"];
const LEVELS = ["none","root","plant","tree"];                 // left→right on the slider
const ORDER = LEVELS.reduce((m,v,i)=> (m[v]=i, m), {});
const EMOJI = { none:"⚪", root:"🌱", plant:"🌿", tree:"🌳" };

/***** SHEET HELPERS *****/
function _ss(){ return SpreadsheetApp.getActive(); }
function _sheet(name){ return _ss().getSheetByName(name) || _ss().insertSheet(name); }

function ensureHeaders(){
  const shL = _sheet("Latest");
  if (shL.getLastRow() === 0){
    shL.appendRow(["student_id","name","email"].concat(ASSIGNMENTS));
  }
  const shR = _sheet("Responses");
  if (shR.getLastRow() === 0){
    shR.appendRow(["Timestamp","email","assignment","level","note"]);
  }
}

function seedLatestFromRoster(){
  const shR = _sheet("Roster");
  const shL = _sheet("Latest");
  ensureHeaders();

  const rVals = shR.getDataRange().getValues();
  if (!rVals.length) throw new Error("Roster is empty.");
  const rHead = rVals.shift();
  const iId = rHead.indexOf("student_id");
  const iName = rHead.indexOf("name");
  const iEmail = rHead.indexOf("email");
  if (iId < 0 || iName < 0 || iEmail < 0){
    throw new Error("Roster must have headers: student_id, name, email");
  }

  const lVals = shL.getDataRange().getValues();
  const seen = new Set();
  if (lVals.length > 1){
    for (let i=1;i<lVals.length;i++){
      const email = (lVals[i][2] || "").toString().trim().toLowerCase();
      if (email) seen.add(email);
    }
  }

  const toAppend = [];
  rVals.forEach(r => {
    const id = (r[iId]||"").toString().trim();
    const nm = (r[iName]||"").toString().trim();
    const em = (r[iEmail]||"").toString().trim().toLowerCase();
    if (!id || !em) return;
    if (seen.has(em)) return;
    toAppend.push([id, nm, em].concat(new Array(ASSIGNMENTS.length).fill("none"))); // default none
  });

  if (toAppend.length){
    shL.getRange(shL.getLastRow()+1, 1, toAppend.length, 3+ASSIGNMENTS.length).setValues(toAppend);
  }
  return {added: toAppend.length};
}

/***** OPEN MENU *****/
function onOpen(){
  SpreadsheetApp.getUi().createMenu("Progress Portal")
    .addItem("Seed Latest from Roster", "seedLatestFromRoster")
    .addItem("Open Dashboard", "openDashboard")
    .addToUi();
}
function openDashboard(){
  const url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(`<p style="font:14px system-ui">Open: <a target="_blank" href="${url}?page=dashboard">${url}?page=dashboard</a></p>`),
    "Progress Portal"
  );
}

/***** WEB APP ROUTER *****/

function doGet(e){
  ensureHeaders();
  const page = (e && e.parameter && e.parameter.page) || "student";
  let tpl;
  if (page === "student"){
    tpl = HtmlService.createTemplateFromFile("student");
  } else {
    tpl = HtmlService.createTemplateFromFile("dashboard");
  }
  return tpl.evaluate()
    .setTitle("Progress Portal")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(name){ return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/***** SERVER API *****/
function _getLatestMap(){
  const sh = _sheet("Latest");
  const vals = sh.getDataRange().getValues();
  if (vals.length < 2) return {header: vals[0] || [], rows: [], byEmail: {}};
  const header = vals[0];
  const rows = vals.slice(1);
  const byEmail = {};
  rows.forEach(r => {
    const email = (r[2]||"").toString().trim().toLowerCase();
    if (email) byEmail[email] = r;
  });
  return {header, rows, byEmail};
}

function whoAmI(){
  const email = (Session.getActiveUser().getEmail() || "").toLowerCase();
  const latest = _getLatestMap();
  let name = "", student_id = "";
  if (email && latest.byEmail[email]){
    const r = latest.byEmail[email];
    student_id = r[0] || ""; name = r[1] || "";
  } else {
    const shR = _sheet("Roster");
    const rVals = shR.getDataRange().getValues();
    const head = rVals.shift() || [];
    const iId = head.indexOf("student_id");
    const iName = head.indexOf("name");
    const iEmail = head.indexOf("email");
    for (const r of rVals){
      if ((r[iEmail]||"").toString().toLowerCase() === email){
        student_id = r[iId] || ""; name = r[iName] || ""; break;
      }
    }
  }
  return {email, name, student_id};
}

function getStudentStatus(){
  const me = whoAmI();
  if (!me.email) throw new Error("Not signed in (domain-only).");
  const latest = _getLatestMap();
  const levels = {};
  if (latest.byEmail[me.email]){
    const row = latest.byEmail[me.email];
    for (let j=0; j<ASSIGNMENTS.length; j++){
      let v = (row[3+j] || "").toString().toLowerCase();
      if (!LEVELS.includes(v)) v = "none";   // normalize blanks to none
      levels[ASSIGNMENTS[j]] = v;
    }
  } else {
    const shL = _sheet("Latest");
    shL.appendRow([me.student_id || "", me.name || "", me.email].concat(new Array(ASSIGNMENTS.length).fill("none")));
    ASSIGNMENTS.forEach(a => levels[a] = "none");
  }
  return { me, assignments: ASSIGNMENTS, levels, levelsOrder: LEVELS, emoji: EMOJI };
}

// Allow upgrades & downgrades; store exactly the chosen level (including "none")
function setStudentLevel(assignment, level, note){
  const me = whoAmI();
  if (!me.email) throw new Error("Not signed in (domain-only).");
  assignment = (assignment || "").toString().trim();
  level = (level || "").toString().toLowerCase().trim();
  note = (note || "").toString();

  if (ASSIGNMENTS.indexOf(assignment) === -1) throw new Error("Invalid assignment.");
  if (!ORDER.hasOwnProperty(level)) throw new Error("Invalid level.");

  const shL = _sheet("Latest");
  const vals = shL.getDataRange().getValues();
  const header = vals[0];
  const col = header.indexOf(assignment);
  if (col < 0) throw new Error("Sheet missing assignment column.");

  let rowIdx = -1;
  for (let i=1; i<vals.length; i++){
    if ((vals[i][2]||"").toString().toLowerCase() === me.email){ rowIdx = i+1; break; }
  }
  if (rowIdx === -1){
    shL.appendRow([me.student_id || "", me.name || "", me.email].concat(new Array(ASSIGNMENTS.length).fill("none")));
    rowIdx = shL.getLastRow();
  }

  shL.getRange(rowIdx, col+1).setValue(level); // set exact

  const shR = _sheet("Responses");
  shR.appendRow([new Date(), me.email, assignment, level, note || ""]);
  return {ok:true, level};
}

/***** DASHBOARD DATA *****/
function getDashboardData(){
  const sh = _sheet("Latest");
  const vals = sh.getDataRange().getValues();
  const rows = [];
  if (vals.length >= 2){
    for (let i=1; i<vals.length; i++){
      const r = vals[i];
      rows.push({
        id: r[0] || "", name: r[1] || "", email: (r[2]||"").toString(),
        levels: ASSIGNMENTS.map((a,j)=> {
          const v = (r[3+j]||"").toString().toLowerCase();
          return LEVELS.includes(v) ? v : "none";
        })
      });
    }
  }

  // counts per assignment (include none)
  const counts = {};
  ASSIGNMENTS.forEach(a => counts[a] = {none:0, root:0, plant:0, tree:0});
  rows.forEach(rec => rec.levels.forEach((lvl, idx) => counts[ASSIGNMENTS[idx]][lvl]++));

  // progress per student: none=0, root=1, plant=2, tree=3
  const maxPerA = LEVELS.length - 1; // 3
  rows.forEach(rec => {
    const sum = rec.levels.reduce((s,l)=> s + (ORDER[l] || 0), 0);
    rec.progress = Math.round(100 * sum / (ASSIGNMENTS.length * maxPerA));
  });

  return {assignments: ASSIGNMENTS, levels: LEVELS, emoji: EMOJI, counts, rows};
}
