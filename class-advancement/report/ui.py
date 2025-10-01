from typing import Optional

def done_html(assignment: str = "HW1") -> str:
    """Return the HTML+JS snippet for a button that calls the registered Colab callback."""
    # Uses google.colab.kernel.invokeFunction('done.curl', ...) so no ipywidgets and no CORS.
    return rf"""
<div style="font-family:system-ui,Segoe UI,Arial;margin:8px 0;">
  <label>Name: <input id="n" style="margin:4px"></label>
  <label>Assign: <input id="a" value="{assignment}" style="margin:4px"></label>
  <label>Note: <input id="t" placeholder="(optional)" style="margin:4px;width:260px"></label>
  <button id="btn" style="padding:8px 12px;margin-left:6px;background:#0b8043;color:#fff;border:none;border-radius:6px;cursor:pointer">
    I'm Done
  </button>
  <span id="s" style="margin-left:8px;color:#555"></span>
</div>
<script>
  const btn = document.getElementById('btn');
  const s   = document.getElementById('s');
  btn.onclick = async () => {{
    const name = document.getElementById('n').value.trim();
    const asg  = document.getElementById('a').value.trim();
    const note = document.getElementById('t').value.trim();
    if (!name || !asg) {{ s.textContent = "Name and assignment required."; s.style.color="#b00020"; return; }}
    btn.disabled = true; s.textContent = "Sending…"; s.style.color="#555";
    try {{
      const res = await google.colab.kernel.invokeFunction('done.curl', [name, asg, note], {{}} );
      const ok  = res && res.data && res.data['ok'];
      s.textContent = ok ? "Recorded ✓" : "Failed";
      s.style.color = ok ? "#0b8043" : "#b00020";
      if (!ok) btn.disabled = false;
    }} catch (e) {{
      s.textContent = "Backend error"; s.style.color="#b00020"; btn.disabled = false;
    }}
  }};
</script>
"""

def show_done_button(assignment: str = "HW1") -> None:
    """Render the HTML button in a notebook output."""
    # Import lazily so this module stays usable in non-Notebook contexts
    from IPython.display import HTML, display
    display(HTML(done_html(assignment)))
