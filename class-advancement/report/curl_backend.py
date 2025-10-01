from google.colab import output

def register_done_curl(webhook: str, notebook_label: str = "Colab") -> None:
    import json, subprocess
    webhook = webhook.strip()
    label = (notebook_label or "Colab").strip()

    def _done_curl(student: str, assignment: str, note: str = ""):
        payload = json.dumps({
            "student": (student or "").strip(),
            "assignment": (assignment or "").strip(),
            "note": (note or "").strip(),
            "notebook": label,
        }).encode("utf-8")
        cmd = [
            "curl", "-sS", "-X", "POST",
            "-H", "Content-Type: application/json",
            "--data-binary", "@-",
            "--max-time", "10",
            webhook,
        ]
        p = subprocess.run(cmd, input=payload)
        return {"ok": p.returncode == 0}

    # ✅ Correct API: pass (name, callback)
    output.register_callback('done.curl', _done_curl)
