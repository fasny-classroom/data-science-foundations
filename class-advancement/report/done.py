
# ---------------------------------------------------------
#   Copyright (c) [2025] Nadege LEMPERIERE
#   All rights reserved
#   -------------------------------------------------------
#   'I'm Done' button for Colab/Jupyter.
#   Students provide name + assignment; a single click posts 
#   JSON to your Google Apps Script,
#   which appends to your Google Sheet.
#   -------------------------------------------------------

# System includes 
from    typing import Optional, Dict, Any
import  json, time, sys, urllib.request, urllib.error

# ipwidgets includes
from    ipywidgets import Text, Button, VBox, HTML, Layout, HBox

# IPython includes
from    IPython.display import display

# Local includes
from    .config import get_webhook

# ---------- internal helpers ----------

def _post_json(url: str, payload: Dict[str, Any], timeout: float = 10.0) -> int:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.getcode()

def _sanitize(s: str, maxlen: int = 100) -> str:
    s = (s or "").strip()
    # collapse whitespace; keep it simple to prevent junk
    s = " ".join(s.split())
    if len(s) > maxlen:
        s = s[:maxlen]
    return s

def _badge(text: str, color: str) -> HTML:
    return HTML(
        f"""<div style="padding:8px 12px;border-radius:8px;background:{color};
                     color:#fff;display:inline-block;font-weight:600">{text}</div>"""
    )

# ---------- public API ----------

def done_button(
    assignment_default: str = "HW0",
    *,
    notebook_label: str = "Colab",
    require_name: bool = True,
    show_note: bool = True,
    webhook_override: Optional[str] = None,
):
    """
    Render a small widget that collects student name and assignment, then posts to the teacher's Google Sheet.

    Parameters
    ----------
    assignment_default : str
        Pre-filled assignment label (e.g., "HW1", "Lab02").
    notebook_label : str
        A short string identifying the environment ("Colab", "JupyterHub", etc.) sent with the payload.
    require_name : bool
        If True, disables submit until Name is non-empty.
    show_note : bool
        If True, shows an optional 'Note' field.
    webhook_override : Optional[str]
        Override the configured webhook (rare; generally keep None so you don't leak URLs in student notebooks).
    """

    webhook = webhook_override or get_webhook()
    if not webhook or "REPLACE_WITH_YOURS" in webhook:
        # Fail closed with a clear teacher-facing message, not a cryptic error
        raise RuntimeError(
            "No valid webhook configured. In a teacher-only cell, call:\n\n"
            "from classtools.config import set_webhook\n"
            "set_webhook('https://script.google.com/macros/s/XXXXX/exec')\n"
        )

    name = Text(
        description="Name:",
        placeholder="First Last",
        layout=Layout(width="320px"),
    )
    assign = Text(
        description="Assign:",
        value=assignment_default,
        layout=Layout(width="220px"),
    )
    note = Text(
        description="Note:",
        placeholder="(optional)",
        layout=Layout(width="380px"),
    )
    submit = Button(
        description="I'm Done",
        button_style="success",
        layout=Layout(width="140px", height="36px"),
    )
    status = HTML("<span style='color:#555'>Fill the fields and click <b>I'm Done</b>.</span>")

    # Disable submit if name required and empty
    def _refresh_submit_state(*_):
        if require_name:
            submit.disabled = len(_sanitize(name.value)) == 0
        else:
            submit.disabled = False
    _refresh_submit_state()
    name.observe(lambda *_: _refresh_submit_state(), names="value")

    def _on_click(_):
        # debouncing UI while sending
        submit.disabled = True
        status.value = "<span>Sending…</span>"

        payload = {
            "student": _sanitize(name.value),
            "assignment": _sanitize(assign.value),
            "notebook": _sanitize(notebook_label, 40),
            "note": _sanitize(note.value, 200) if show_note else "",
            "client_ts": int(time.time()),
            "py": f"{sys.version_info.major}.{sys.version_info.minor}",
        }

        if require_name and not payload["student"]:
            status.value = "<span style='color:#b00020'>Name is required.</span>"
            submit.disabled = False
            return
        if not payload["assignment"]:
            status.value = "<span style='color:#b00020'>Assignment is required.</span>"
            submit.disabled = False
            return

        try:
            code = _post_json(webhook, payload, timeout=10.0)
            if 200 <= code < 300:
                status.value = _badge("Recorded ✓", "#0b8043").value
            else:
                status.value = f"<span style='color:#b00020'>Server error: HTTP {code}</span>"
        except urllib.error.HTTPError as e:
            status.value = f"<span style='color:#b00020'>HTTPError: {e.code}</span>"
        except urllib.error.URLError as e:
            status.value = f"<span style='color:#b00020'>Network error: {e.reason}</span>"
        except Exception as e:
            status.value = f"<span style='color:#b00020'>Unexpected error: {e}</span>"
        finally:
            # Let them re-try on failure; keep disabled on success to avoid duplicates
            if "Recorded" not in status.value:
                submit.disabled = False

    submit.on_click(_on_click)

    fields = [name, assign]
    if show_note:
        fields.append(note)

    ui = VBox(
        [
            HBox(fields, layout=Layout(align_items="center", column_gap="12px")),
            HBox([submit, status], layout=Layout(align_items="center", column_gap="12px")),
        ],
        layout=Layout(row_gap="8px"),
    )
    display(ui)
    return ui
