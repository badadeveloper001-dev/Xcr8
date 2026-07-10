import importlib
import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def test_social_publish_route_imports_without_error():
    module = importlib.import_module("app.api.routes.social_publish")
    assert module.router is not None
