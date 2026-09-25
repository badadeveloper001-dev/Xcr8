"""Shared accounting, independent of backend app imports."""
import sys
from pathlib import Path

root = str(Path(__file__).resolve().parents[2])
if root not in sys.path:
    sys.path.insert(0, root)
from shared import pulse_usage as ledger  # noqa: E402
