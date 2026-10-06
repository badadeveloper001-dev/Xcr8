"""Regression tests for the AI provider boundary.

The feature services may construct provider clients, but actual chat-completion
I/O must stay behind app.core.config.create_chat_completion -> Pulse.
"""

from pathlib import Path
import ast


SERVICES = (
    "idea_generator.py",
    "caption_adapter.py",
    "assistant.py",
)


def _service_source(name: str) -> str:
    return (Path(__file__).resolve().parents[1] / "app" / "services" / name).read_text()


def test_chat_provider_boundary_has_no_direct_completion_calls():
    for name in SERVICES:
        tree = ast.parse(_service_source(name), filename=name)
        direct_calls = []
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            if (
                isinstance(func, ast.Attribute)
                and func.attr == "create"
                and isinstance(func.value, ast.Attribute)
                and func.value.attr == "completions"
            ):
                direct_calls.append(node.lineno)
        assert direct_calls == [], f"{name} bypasses the shared Pulse chat boundary at {direct_calls}"


def test_chat_provider_services_use_shared_completion_adapter():
    for name in SERVICES:
        source = _service_source(name)
        assert "from app.core.config import create_chat_completion, settings" in source
        assert "create_chat_completion(" in source
