import json, subprocess, sys
from typing import Optional

# Will be set by register_done_curl
_WEBHOOK: Optional[str] = None
_NOTEBOOK_LABEL = "Colab"

def register_done_curl(webhook: str, notebook_label: str = "Colab") -> None:
    """Register a Colab callback that will POST via curl from the Python backend."""
    global _WEBHOOK, _NOTEBOOK_LABEL
    _WEBHOOK = webhook.strip()
    _NOTEBOOK_LABEL = notebook_label.strip() or "Colab"

    # Import here to avoid hard Colab dependency outside Colab
    from google.colab import output

    @output.register_callback('done.curl')
    def _done_curl(student: str, assignment: str, note: str = ""):
        if not _WEBHOOK:
            return {"ok": False, "err": "Webhook not configured"}
        payload = json.dumps({
            "student": (student or "").strip(),
            "assignment": (assignment or "").strip(),
            "note": (note or "").strip(),
            "notebook": _NOTEBOOK_LABEL,
        }).encode("utf-8")

        cmd = [
            "curl", "-sS", "-X", "POST",
            "-H", "Content-Type: application/json",
            "--data-binary", "@-",
            "--max-time", "10",
            _WEBHOOK,
        ]
        p = subprocess.run(cmd, input=payload)
        return {"ok": p.returncode == 0}

def submit_done(student: str, assignment: str, note: str = "") -> bool:
    """Pure-Python fallback: POST from Python (no JS button, no Colab callback)."""
    import urllib.request
    if not _WEBHOOK:
        raise RuntimeError("Webhook not configured; call register_done_curl() first.")
    payload = json.dumps({
        "student": student.strip(),
        "assignment": assignment.strip(),
        "note": note.strip(),
        "notebook": _NOTEBOOK_LABEL,
    }).encode("utf-8")
    req = urllib.request.Request(
        _WEBHOOK, data=payload,
        headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return 200 <= r.status < 300
