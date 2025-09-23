# Grades Dashboard (Streamlit + Google Sheets)

A private, always-on Python dashboard that reads **multiple Google Sheets** (gradebooks) and provides:
- a **Class Dashboard** (assignment stats, trends, heatmap),
- a **per-Student page** (select or use `?student=<ID>`).

All configuration (service account JSON + Sheets list) is stored in **Streamlit Secrets** — nothing sensitive in GitHub.

## 1) Prepare Google Cloud service account
- Enable **Google Sheets API** + **Drive API**.
- Create a **service account**, download the JSON.
- In **each source Google Sheet**, share with the service account email (Editor).

## 2) Deploy (Streamlit Community Cloud)
- Put this repo on **GitHub (private)**.
- In Streamlit Cloud: New app → select this repo.
- **Secrets** (App → Settings → Secrets): paste something like:

```toml
# Full JSON of your service account (paste the entire object, not as a string)
gcp_service_account = { 
  # ... your service account JSON here ...
}

# List of Sheets; accept either "sheet_url" or "sheet_id"
sheets = [
  { sheet_url = "https://docs.google.com/spreadsheets/d/1AbCDEF.../edit",
    worksheet = "Grades",
    class_name = "Data Science 9" },
  { sheet_id  = "1ZyXwvUTSRQ...",
    worksheet = "Grades",
    class_name = "Data Science 10" }
]