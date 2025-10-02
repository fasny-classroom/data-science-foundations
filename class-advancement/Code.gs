/***** CONFIG *****/
const LEVELS = ["none","root","plant","tree"];
const ORDER  = LEVELS.reduce(function(m,v,i){ m[v]=i; return m; }, {});
const EMOJI  = { none:"⚪", root:"🌱", plant:"🌿", tree:"🌳" };

const SHEET_CATALOG = "Catalog";
const SHEET_PROGRESS = "Progress";
const SHEET_HISTORY  = "History";

/***** UTIL *****/
function _ss(){ return SpreadsheetApp.getActive(); }
function _sheet(name){ var sh=_ss().getSheetByName(name); if(!sh) throw new Error("Missing sheet: "+name); return sh; }
function _val(v){ return String(v||"").trim(); }
function _nowISO(){ return new Date().toISOString(); }
function slug(s){ return _val(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
function _int(v, d){ v=Number(v); return isFinite(v)?v:d; }

function _getUserEmail(){
  var e = (_val(Session.getActiveUser().getEmail()) || "").toLowerCase();
  if (!e) throw new Error("__NO_IDENTITY__");
  return e;
}
function _maxLevelToIdx(s){
  if (s===undefined || s===null || s==="") return ORDER.tree; // default full
  var k=String(s).trim().toLowerCase();
  if (k in ORDER) return ORDER[k];
  var n=_int(k, -1);
  if (n>=0 && n<=3) return n;
  return ORDER.tree;
}
function _effectiveOrder(meta){
  var finiteMax = 0;
  var noOrder = [];

  Object.keys(meta.id2meta).forEach(function(id){
    var it = meta.id2meta[id];
    if (it.order===null || typeof it.order==="undefined" || it.order===""){
      noOrder.push(it);
    }else{
      if (typeof it.order === "number" && isFinite(it.order)) {
        finiteMax = Math.max(finiteMax, it.order);
      }
    }
  });

  noOrder.sort(function(a,b){
    var aa = a.activity.toLowerCase(), ab = b.activity.toLowerCase();
    if (aa!==ab) return aa.localeCompare(ab);
    var ta = a.topic.toLowerCase(), tb = b.topic.toLowerCase();
    if (ta!==tb) return ta.localeCompare(tb);
    return a.mode.localeCompare(b.mode);
  });

  var eff = {};
  Object.keys(meta.id2meta).forEach(function(id){ eff[id] = meta.id2meta[id].order; });

  for (var i=0;i<noOrder.length;i++){
    eff[ noOrder[i].id ] = finiteMax + 1 + i; // place empties at the end, stable alpha
  }
  return eff;
}


/***** CATALOG (TOPIC|ACTIVITY|MODE|ORDER|MAXLEVEL?) → ids *****/function _readCatalog(){
  var vals = _sheet(SHEET_CATALOG).getDataRange().getValues();
  if (vals.length < 2) throw new Error("Catalog needs headers + rows.");
  var H = vals[0].map(_val);
  function idx(name){
    var i = H.findIndex(function(h){ return _val(h).toLowerCase()===name.toLowerCase(); });
    if (i<0) throw new Error("Catalog missing header: "+name);
    return i;
  }
  var iTopic=idx("TOPIC"), iAct=idx("ACTIVITY"), iMode=idx("MODE"), iOrder=idx("ORDER");
  var iMax = H.findIndex(function(h){ return _val(h).toLowerCase()==="maxlevel"; }); // optional

  var rows = vals.slice(1).map(function(r){
    var topic=_val(r[iTopic]), act=_val(r[iAct]), rawMode=_val(r[iMode]).toUpperCase();
    var ordCell = r[iOrder]; var ordStr = (ordCell===null || ordCell===undefined) ? "" : String(ordCell).trim();
    var ord = (ordStr==="") ? null : _int(ordStr, null);   // << empty means null (=∞)
    if (!topic || !act || !rawMode) return null;
    if (!(rawMode==="CW" || rawMode==="HW")) throw new Error("MODE must be 'CW' or 'HW': "+rawMode);
    var id = slug(topic)+"__"+slug(act)+"__"+rawMode;
    var group = (rawMode==="CW")?"class":"hw";
    var maxIdx = (iMax>=0) ? _maxLevelToIdx(r[iMax]) : ORDER.tree;
    return { topic:topic, activity:act, mode:rawMode, group:group, order:ord, id:id, maxIdx:maxIdx };
  }).filter(function(x){ return !!x; });

  function cmpOrder(a,b){
    var an = (a.order===null || a.order==="" || typeof a.order==="undefined") ? Infinity : a.order;
    var bn = (b.order===null || b.order==="" || typeof b.order==="undefined") ? Infinity : b.order;
    if (an!==bn) return an - bn;                // finite first, then ∞
    return a.activity.localeCompare(b.activity); // tie-break by activity alpha
  }

  var byTopic = {};
  rows.forEach(function(r){ if(!byTopic[r.topic]) byTopic[r.topic]=[]; byTopic[r.topic].push(r); });
  var topics = Object.keys(byTopic).sort().map(function(t){
    var items = byTopic[t].sort(cmpOrder);
    return { name:t, items:items };
  });

  var allIds = rows.map(function(r){ return r.id; });
  var id2meta = {}; rows.forEach(function(r){ id2meta[r.id]=r; });

  return { topics:topics, allIds:allIds, id2meta:id2meta };
}


/***** PROGRESS HEADER SYNC *****/
function _ensureProgressHeader(allIds){
  var sh=_sheet(SHEET_PROGRESS);
  if (sh.getLastRow()===0){ sh.appendRow(["mail"].concat(allIds)); return; }
  var head=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(_val);
  var changed=false;
  if ((_val(head[0])||"").toLowerCase()!=="mail"){ head[0]="mail"; changed=true; }
  allIds.forEach(function(id){ if(head.indexOf(id)===-1){ head.push(id); changed=true; }});
  if (changed){
    sh.getRange(1,1,1,head.length).setValues([head]);
    if (sh.getLastColumn()<head.length) sh.insertColumnsAfter(sh.getLastColumn(), head.length - sh.getLastColumn());
  }
}

/***** STUDENT ROW *****/
function _findOrCreateRow(mail){
  var sh=_sheet(SHEET_PROGRESS);
  var lastRow=sh.getLastRow();
  if (lastRow<1) throw new Error("Progress missing header.");
  if (lastRow>1){
    var mails=sh.getRange(2,1,lastRow-1,1).getValues();
    for (var i=0;i<mails.length;i++) if (_val(mails[i][0]).toLowerCase()===mail) return 2+i;
  }
  var head=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(_val);
  var row=new Array(head.length).fill("");
  row[0]=mail; for(var c=1;c<head.length;c++) row[c]="none";
  sh.appendRow(row);
  return sh.getLastRow();
}

/***** ROUTER *****/
function doGet(e){
  var page=(e && e.parameter && e.parameter.page) || "student"; // default student
  var file="student";
  if (page==="dashboard") file="dashboard_teacher";
  if (page==="anon")      file="dashboard_anon";
  if (page==="report")    file="report_student";

  var tpl=HtmlService.createTemplateFromFile(file);

  if (file==="report_student"){
    var email = _val(e && e.parameter && e.parameter.email);
    if (!email){
      try { email = _getUserEmail(); } catch(err){ throw err; }
    }
    tpl.data = _buildReportData(email);
  }

  return tpl.evaluate().setTitle("Progress Portal").setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
function include(name){ return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/***** API: STUDENT *****/function getStudentStatus(){
  var mail=_getUserEmail();
  var meta=_readCatalog();
  _ensureProgressHeader(meta.allIds);

  var effOrder = _effectiveOrder(meta);  // << NEW

  var sh=_sheet(SHEET_PROGRESS);
  var head=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(_val);
  var idxById={}; head.forEach(function(h,i){ if(i>0) idxById[h]=i; });

  var rowIdx=_findOrCreateRow(mail);
  var rowVals=sh.getRange(rowIdx,1,1,sh.getLastColumn()).getValues()[0];

  var topicsOut = meta.topics.map(function(t){
    return {
      name: t.name,
      items: t.items.map(function(it){
        var v=_val(rowVals[idxById[it.id]]).toLowerCase();
        if (LEVELS.indexOf(v)===-1) v="none";
        return {
          id:it.id, activity:it.activity, mode:it.mode, group:it.group,
          level:v, maxIdx:it.maxIdx,
          order: effOrder[it.id]        // << use effective order
        };
      })
    };
  });

  return { me: {email: mail}, topics: topicsOut, levelsOrder: LEVELS, emoji: EMOJI };
}

/* Save with max-level guard; log history */
function setStudentLevel(activity_id, level){
  var mail=_getUserEmail();
  var lv=_val(level).toLowerCase();
  if (LEVELS.indexOf(lv)===-1) throw new Error("Invalid level.");

  var meta=_readCatalog();
  if (!(activity_id in meta.id2meta)) throw new Error("Unknown activity id: "+activity_id);
  var maxIdx = meta.id2meta[activity_id].maxIdx;
  if (ORDER[lv] > maxIdx) lv = LEVELS[maxIdx]; // clamp to max

  _ensureProgressHeader(meta.allIds);

  var sh=_sheet(SHEET_PROGRESS);
  var head=sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0].map(_val);
  var col=head.indexOf(activity_id);
  if (col===-1) throw new Error("Progress missing column for id: "+activity_id);

  var rowIdx=_findOrCreateRow(mail);
  sh.getRange(rowIdx, col+1).setValue(lv);

  var h=_ss().getSheetByName(SHEET_HISTORY);
  if (!h) h=_ss().insertSheet(SHEET_HISTORY);
  if (h.getLastRow()===0) h.appendRow(["timestamp","mail","activity_id","level"]);
  h.appendRow([_nowISO(), mail, activity_id, lv]);

  return { ok:true, level:lv };
}

/***** DASHBOARD CORE *****/
function _dataCore(){
  var meta=_readCatalog();
  _ensureProgressHeader(meta.allIds);

  var sh=_sheet(SHEET_PROGRESS);
  var vals=sh.getDataRange().getValues();
  var head= vals[0].map(_val);
  var idxById={}; head.forEach(function(h,i){ if(i>0) idxById[h]=i; });

  var rows=[];
  for (var r=1;r<vals.length;r++){
    var email=_val(vals[r][0]).toLowerCase(); if(!email) continue;
    var levelsById={};
    meta.allIds.forEach(function(id){
      var v=_val(vals[r][ idxById[id] ]).toLowerCase();
      levelsById[id] = (LEVELS.indexOf(v)!==-1)?v:"none";
    });
    rows.push({ email:email, levelsById:levelsById });
  }

  function completePct(levelsById){
    var tot=0, maxTot=0;
    meta.allIds.forEach(function(id){
      var v = ORDER[ levelsById[id] ] || 0;
      var cap = meta.id2meta[id].maxIdx || ORDER.tree;
      tot += Math.min(v, cap);
      maxTot += cap;
    });
    return Math.round(100 * tot / (maxTot || 1));
  }

  var countsByTopic = {};
  meta.topics.forEach(function(t){
    function base(){ return {none:0,root:0,plant:0,tree:0}; }
    var c = { class: base(), hw: base() };
    rows.forEach(function(rec){
      t.items.forEach(function(it){
        var lvl = rec.levelsById[it.id] || "none";
        c[it.group][lvl] += 1;
      });
    });
    countsByTopic[t.name]=c;
  });

  var trends = _computeTrends(meta.topics, meta.allIds, meta.id2meta);

  return { topics: meta.topics, allIds: meta.allIds, id2meta: meta.id2meta,
           rows: rows, countsByTopic: countsByTopic, trends: trends,
           EMOJI: EMOJI, ORDER: ORDER, LEVELS: LEVELS,
           percent: function(levelsById){ return completePct(levelsById); } };
}

/***** TEACHER & ANON DATA *****/
function getTeacherData(){
  var core = _dataCore();
  var teachersRows = core.rows.map(function(r){
    return {
      email: r.email,
      completion: core.percent(r.levelsById),
      levelsById: r.levelsById
    };
  });
  return {
    topics: core.topics,
    countsByTopic: core.countsByTopic,
    trends: core.trends,
    emoji: core.EMOJI,
    order: core.ORDER,
    levels: core.LEVELS,
    id2meta: core.id2meta,
    rows: teachersRows
  };
}

function getAnonData(){
  var core = _dataCore();
  var buckets = { "0–25%":0, "26–50%":0, "51–75%":0, "76–100%":0 };
  core.rows.forEach(function(r){
    var p = core.percent(r.levelsById);
    if (p<=25) buckets["0–25%"]++;
    else if (p<=50) buckets["26–50%"]++;
    else if (p<=75) buckets["51–75%"]++;
    else buckets["76–100%"]++;
  });
  return {
    topics: core.topics,
    countsByTopic: core.countsByTopic,
    completionBuckets: buckets,
    emoji: core.EMOJI,
    order: core.ORDER,
    levels: core.LEVELS,
    trends: core.trends
  };
}

/***** Trends, Student Series (order-based), Durations *****/
function _computeTrends(topics, allIds, id2meta){
  var h=_ss().getSheetByName(SHEET_HISTORY);
  var result={ perStudent:{}, perTopic:{} };
  if (!h || h.getLastRow()<2) return result;
  var vals=h.getDataRange().getValues();
  var hdr=vals[0].map(_val);
  var iTs=hdr.indexOf("timestamp"), iMail=hdr.indexOf("mail"), iId=hdr.indexOf("activity_id"), iLev=hdr.indexOf("level");
  var recs=vals.slice(1).map(function(r){
    return {
      ts:new Date(_val(r[iTs])),
      mail:_val(r[iMail]).toLowerCase(),
      id:_val(r[iId]),
      v:Math.max(0, ORDER[_val(r[iLev]).toLowerCase()]||0)
    };
  }).filter(function(r){ return r.mail && r.id; });

  // id -> topic
  var id2topic={};
  topics.forEach(function(t){ t.items.forEach(function(it){ id2topic[it.id]=t.name; }); });

  recs.sort(function(a,b){ return a.ts-b.ts; });

  var byStudent = {};
  recs.forEach(function(r){
    if (!byStudent[r.mail]) byStudent[r.mail]=[];
    byStudent[r.mail].push(r.v);
  });
  Object.keys(byStudent).forEach(function(m){ result.perStudent[m] = _trend(byStudent[m]); });

  var byTopic2={};
  recs.forEach(function(r){
    var t = id2topic[r.id]; if (!t) return;
    if (!byTopic2[t]) byTopic2[t]=[];
    byTopic2[t].push(r.v);
  });
  Object.keys(byTopic2).forEach(function(t){ result.perTopic[t] = _trend(byTopic2[t]); });

  return result;
}

/* For chart: current snapshot per activity → point (x=order, y=level/max) */function getStudentOrderSeries(){
  var mail=_getUserEmail();
  var core=_dataCore();
  var eff = _effectiveOrder({ id2meta: core.id2meta }); // << NEW

  var me = core.rows.find(function(r){ return r.email===mail; });
  if (!me) return [];

  var series = [];
  core.topics.forEach(function(t){
    t.items.forEach(function(it){
      var lv = (me.levelsById[it.id] || "none");
      var y = Math.round(100 * Math.min(ORDER[lv], it.maxIdx) / (it.maxIdx||1||1));
      series.push({
        id: it.id,
        order: eff[it.id],              // << effective order
        pct: y, level: lv,
        topic: t.name, activity: it.activity, mode: it.mode, maxIdx: it.maxIdx
      });
    });
  });
  series.sort(function(a,b){ return a.order - b.order || a.activity.localeCompare(b.activity); });
  return series;
}


/* Durations: for each activity, timestamps for root/plant/tree and deltas in days */
function getStudentDurations(){
  var mail=_getUserEmail();
  var h=_ss().getSheetByName(SHEET_HISTORY);
  var meta=_readCatalog();
  var id2meta=meta.id2meta;
  var out=[];
  if (!h || h.getLastRow()<2) return out;
  var vals=h.getDataRange().getValues();
  var hdr=vals[0].map(_val);
  var iTs=hdr.indexOf("timestamp"), iMail=hdr.indexOf("mail"), iId=hdr.indexOf("activity_id"), iLev=hdr.indexOf("level");
  var rows = vals.slice(1)
    .filter(function(r){ return _val(r[iMail]).toLowerCase()===mail; })
    .map(function(r){ return { ts:new Date(_val(r[iTs])), id:_val(r[iId]), lev:_val(r[iLev]).toLowerCase() }; })
    .sort(function(a,b){ return a.ts-b.ts; });

  // Collect first reach times per level per activity
  var first = {}; // id -> {root:Date?, plant:Date?, tree:Date?}
  rows.forEach(function(rec){
    if (!(rec.id in id2meta)) return;
    var cap = id2meta[rec.id].maxIdx;
    var idx = ORDER[rec.lev]||0;
    if (idx===0) return; // ignore 'none'
    if (idx>cap) idx=cap;
    var obj = first[rec.id] || (first[rec.id] = {});
    if (idx>=1 && !obj.root)  obj.root  = rec.ts;
    if (idx>=2 && !obj.plant) obj.plant = rec.ts;
    if (idx>=3 && !obj.tree)  obj.tree  = rec.ts;
  });

  function days(a,b){ return a && b ? Math.round((b-a)/(1000*60*60*24)) : null; }

  Object.keys(first).forEach(function(id){
    var m = id2meta[id];
    var fr = first[id];
    var d1 = (m.maxIdx>=2) ? days(fr.root, fr.plant) : null; // root->plant
    var d2 = (m.maxIdx>=3) ? days(fr.plant, fr.tree) : null; // plant->tree
    out.push({
      id:id, topic:m.topic, activity:m.activity, mode:m.mode,
      root: fr.root ? fr.root.toISOString().slice(0,10) : "",
      plant: fr.plant ? fr.plant.toISOString().slice(0,10) : "",
      tree: fr.tree ? fr.tree.toISOString().slice(0,10) : "",
      d_root_plant: d1, d_plant_tree: d2, maxIdx:m.maxIdx
    });
  });

  // Stable order by topic then order
  out.sort(function(a,b){
    if (a.topic!==b.topic) return a.topic.localeCompare(b.topic);
    return (meta.id2meta[a.id].order - meta.id2meta[b.id].order);
  });
  return out;
}

/***** Print-ready report data *****/function _buildReportData(email){
  var core = _dataCore();
  var rec  = core.rows.find(function(r){ return r.email===email; });
  if (!rec) throw new Error("Student not found: "+email);

  var topics = core.topics.map(function(t){
    return {
      name: t.name,
      items: t.items.map(function(it){
        var lv = rec.levelsById[it.id] || "none";
        return { activity: it.activity, mode: it.mode, level: lv, maxIdx: it.maxIdx, order: it.order };
      })
    };
  });

  var eff = _effectiveOrder({ id2meta: core.id2meta });     // << NEW

  var meSeries = [];
  core.topics.forEach(function(t){
    t.items.forEach(function(it){
      var lv = rec.levelsById[it.id] || "none";
      var y = Math.round(100 * Math.min(ORDER[lv], it.maxIdx) / (it.maxIdx||1||1));
      meSeries.push({
        order: eff[it.id],                                  // << effective order
        pct: y, level: lv, activity: it.activity, mode: it.mode, topic:t.name, maxIdx: it.maxIdx
      });
    });
  });
  meSeries.sort(function(a,b){ return a.order-b.order || a.activity.localeCompare(b.activity); });

  // durations unchanged
  var durations = getStudentDurations(); // or keep your existing inline build

  return { email: email, completion: core.percent(rec.levelsById),
           topics: topics, emoji: EMOJI, series: meSeries, durations: durations };
}

