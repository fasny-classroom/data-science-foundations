# ---------------------------------------------------------
#   Copyright (c) [2025] Nadege LEMPERIERE
#   All rights reserved
#   -------------------------------------------------------
#   Classroom advancement reporting
#   -------------------------------------------------------

import os
from typing import Optional

__version__ = "0.1.0"

# Default: replace with your Apps Script Web App URL (ends with /exec).
# You can rotate this any time without touching student notebooks.
_WEBHOOK: Optional[str] = os.getenv("CLASSTOOLS_WEBHOOK", "https://script.google.com/macros/s/REPLACE_WITH_YOURS/exec")

def set_webhook(url: str) -> None:
    """Set/rotate the webhook at runtime (e.g., in a teacher-only cell)."""
    global _WEBHOOK
    _WEBHOOK = url.strip()

def get_webhook() -> Optional[str]:
    """Return the currently configured webhook URL (or None if unset)."""
    return _WEBHOOK
