# -------------------------------------------------------
# Copyright (c) [2025] FASNY
# All rights reserved
# -------------------------------------------------------
""" Grades Dashboard: Streamlit app to visualize student 
    grades from Google Sheets."""
# -------------------------------------------------------
# Nadège LEMPERIERE, @23th September 2025
# Latest revision: 23th September 2025
# -------------------------------------------------------


from __future__ import annotations
import re
from typing import Dict, List, Optional

import streamlit as st
import pandas as pd
import plotly.express as px
import gspread

# --------------------------
# Config / Secrets contract
# --------------------------
# Streamlit Secrets must define:
# - sheets: a list of dicts like:
#   [
#     { "sheet_url": "https://docs.google.com/spreadsheets/d/1AbC.../edit",
#       "worksheet": "Grades",
#       "class_name": "Data Science 9" },
#     { "sheet_id": "1ZyX...", "worksheet": "Grades", "class_name": "Data Science 10" }
#   ]
#
# Required columns in each worksheet (case-insensitive):
#   student_id, student_name, assignment, grade, date
# Optional columns: class_name, category, max_points, late

REQUIRED_COLS = ["student_id", "student_name", "assignment", "grade", "date"]
COLUMN_ALIASES = {
    "student_id":  ["student_id", "id", "sid"],
    "student_name":["student_name", "name", "student"],
    "assignment":  ["assignment", "task", "assessment"],
    "grade":       ["grade", "score", "points"],
    "date":        ["date", "graded_on", "timestamp"],
    "class_name":  ["class", "class_name", "course"],
    "category":    ["category", "type"],
    "max_points":  ["max_points", "max", "out_of"],
    "late":        ["late", "is_late"],
}

def _canon(col: str) -> Optional[str]:
    c = col.strip().lower()
    for k, aliases in COLUMN_ALIASES.items():
        if c in [a.lower() for a in aliases]:
            return k
    return None

def _sheet_id_from(url_or_id: str) -> str:
    # Accept either a bare ID or a full Google Sheets URL
    m = re.search(r"/spreadsheets/d/([a-zA-Z0-9-_]+)", url_or_id)
    return m.group(1) if m else url_or_id.strip()

@st.cache_resource(show_spinner=False)
def _client() -> gspread.Client:
    # Public (no-credentials) client: works only if sheets are shared "Anyone with the link: Viewer"
    return gspread.Client(auth=None)

@st.cache_data(show_spinner=True)
def load_data() -> pd.DataFrame:
    sheets_cfg: List[Dict] = st.secrets["sheets"]
    if not isinstance(sheets_cfg, list) or not sheets_cfg:
        raise RuntimeError("Streamlit secret `sheets` must be a non-empty list.")

    gc = _client()
    frames: List[pd.DataFrame] = []

    for s in sheets_cfg:
        sheet_id = _sheet_id_from(s.get("sheet_url") or s.get("sheet_id", ""))
        if not sheet_id:
            raise RuntimeError("Each `sheets` entry must include `sheet_url` or `sheet_id`.")
        worksheet = s.get("worksheet")
        if not worksheet:
            raise RuntimeError("Each `sheets` entry must include `worksheet`.")

        sh = gc.open_by_key(sheet_id)
        ws = sh.worksheet(worksheet)
        rows = ws.get_all_records()
        df = pd.DataFrame(rows)

        # Normalize columns
        rename = {}
        for c in df.columns:
            k = _canon(c)
            if k:
                rename[c] = k
        df = df.rename(columns=rename)

        missing = [c for c in REQUIRED_COLS if c not in df.columns]
        if missing:
            raise RuntimeError(f"Sheet {sheet_id}/{worksheet} missing required columns: {missing}")

        # Fill / coerce
        if "class_name" not in df.columns:
            df["class_name"] = s.get("class_name", "")
        else:
            if s.get("class_name"):
                df["class_name"] = df["class_name"].fillna(s["class_name"]).replace("", s["class_name"])

        df["student_id"] = df["student_id"].astype(str).str.strip()
        df["student_name"] = df["student_name"].astype(str).str.strip()
        df["assignment"] = df["assignment"].astype(str).str.strip()

        df["grade"] = pd.to_numeric(df["grade"], errors="coerce")
        df["date"] = pd.to_datetime(df["date"], errors="coerce")

        if "max_points" in df.columns:
            df["max_points"] = pd.to_numeric(df["max_points"], errors="coerce")
        if "late" in df.columns:
            df["late"] = df["late"].astype(str).str.lower().isin(["true","1","yes","y"])

        frames.append(df)

    all_df = pd.concat(frames, ignore_index=True)
    # Sort for nicer default views
    all_df = all_df.sort_values(["student_name", "date", "assignment"], na_position="last").reset_index(drop=True)
    return all_df

def class_dashboard(df: pd.DataFrame) -> None:
    st.subheader("Class Dashboard")

    agg = (
        df.groupby(["class_name", "assignment"], dropna=False)["grade"]
          .agg(['count', 'mean', 'std', 'min', 'max'])
          .reset_index()
          .rename(columns={
              'count':'n', 'mean':'avg', 'std':'sd', 'min':'min', 'max':'max'
          })
    )
    st.dataframe(agg, use_container_width=True)

    st.markdown("**Average grade per assignment**")
    fig_bar = px.bar(
        agg, x="assignment", y="avg", color="class_name",
        hover_data=["n", "sd", "min", "max"],
        title="Average by assignment"
    )
    st.plotly_chart(fig_bar, use_container_width=True)

    st.markdown("**Weekly average trend**")
    dated = df.dropna(subset=["date"]).copy()
    if not dated.empty:
        weekly = (
            dated.groupby([pd.Grouper(key="date", freq="W"), "class_name"], dropna=False)["grade"]
                 .mean()
                 .reset_index(name="avg_grade")
        )
        fig_line = px.line(
            weekly, x="date", y="avg_grade", color="class_name", markers=True,
            title="Weekly average grade"
        )
        st.plotly_chart(fig_line, use_container_width=True)
    else:
        st.info("No valid dates to plot trend.")

    st.markdown("**Heatmap: Students × Assignments**")
    heat = df.pivot_table(index="student_name", columns="assignment", values="grade", aggfunc="mean")
    if heat.size:
        st.plotly_chart(px.imshow(heat, aspect="auto", title="Average grade heatmap"), use_container_width=True)
    else:
        st.info("Not enough data to render heatmap.")

def student_page(df: pd.DataFrame) -> None:
    st.subheader("Student Page")

    # Prebuild selector entries like "12345 — Alice Doe"
    options = (df["student_id"].astype(str) + " — " + df["student_name"]).dropna().unique()
    if len(options) == 0:
        st.info("No students found.")
        return

    # Preselect via query param ?student=<ID>
    qp = st.query_params
    preset_id = qp.get("student", [""])[0] if isinstance(qp.get("student"), list) else qp.get("student", "")

    default_idx = 0
    if preset_id:
        try:
            default_idx = next(i for i, s in enumerate(sorted(options)) if s.split(" — ")[0] == str(preset_id))
        except StopIteration:
            default_idx = 0

    selected = st.selectbox("Select a student", options=sorted(options), index=default_idx)
    sid = selected.split(" — ")[0]

    sdf = df[df["student_id"].astype(str) == sid].copy()
    if sdf.empty:
        st.warning("No records for this student.")
        return

    sname = sdf["student_name"].iloc[0]
    st.metric(label=f"{sname} — graded items", value=str(sdf["grade"].notna().sum()))
    if sdf["grade"].notna().any():
        st.metric(label="Average grade", value=f"{sdf['grade'].mean():.2f}")

    st.markdown("**Assignments**")
    cols = [c for c in ["date","class_name","assignment","grade","max_points","late"] if c in sdf.columns]
    st.dataframe(sdf[cols].sort_values(["date","assignment"]), use_container_width=True)

    if sdf["date"].notna().any():
        st.markdown("**Trend over time**")
        st.plotly_chart(
            px.line(sdf.sort_values("date"), x="date", y="grade", color="class_name", markers=True,
                    title=f"{sname} grade trend"),
            use_container_width=True
        )

# --------------------------
# App
# --------------------------
st.set_page_config(page_title="Grades Dashboard", layout="wide")
st.title("Grades Dashboard (Google Sheets → Streamlit)")

with st.sidebar:
    st.header("Filters")
    # Optional: simple class filter
    # (leaves data-level security to hosting/SSO; this is just UI)
    class_opts = ["(all)"] + sorted([c for c in df["class_name"].dropna().unique()]) if "df" in locals() else ["(all)"]
    st.session_state["_class"] = st.selectbox("Class", class_opts, index=0)

try:
    df = load_data()
except Exception as e:
    st.error(f"Error loading data: {e}")
    st.stop()

# Optional sidebar class filter
if "_class" in st.session_state and st.session_state["_class"] != "(all)":
    df = df[df["class_name"] == st.session_state["_class"]]

tab1, tab2 = st.tabs(["Class Dashboard", "Student Page"])
with tab1:
    class_dashboard(df)
with tab2:
    student_page(df)