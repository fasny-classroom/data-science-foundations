import time, json, sys, urllib.request, urllib.error
from ipywidgets import Text, Button, VBox, HTML, Layout, HBox

def _post_json(url, payload, timeout=10.0):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url=url, data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.getcode()

def done_button(webhook, assignment_default="HW0"):
    name = Text(description="Name:", layout=Layout(width="220px"))
    assign = Text(description="Assign:", value=assignment_default, layout=Layout(width="180px"))
    note = Text(description="Note:", placeholder="(optional)", layout=Layout(width="300px"))
    submit = Button(description="I'm Done", button_style="success")
    status = HTML("<span style='color:#555'>Fill fields, then click.</span>")

    def on_click(_):
        payload = {
            "student": name.value.strip(),
            "assignment": assign.value.strip(),
            "notebook": "Colab",
            "note": note.value.strip(),
            "client_ts": int(time.time()),
            "py": f"{sys.version_info.major}.{sys.version_info.minor}",
        }
        try:
            code = _post_json(webhook, payload)
            if 200 <= code < 300:
                status.value = "<b style='color:#0b8043'>Recorded ✓</b>"
            else:
                status.value = f"<b style='color:#b00020'>Error {code}</b>"
        except Exception as e:
            status.value = f"<b style='color:#b00020'>Error: {e}</b>"

    submit.on_click(on_click)

    return VBox([
        HBox([name, assign, note], layout=Layout(gap="10px")),
        HBox([submit, status], layout=Layout(gap="10px"))
    ])
