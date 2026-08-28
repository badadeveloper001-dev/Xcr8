"""Dependency-free reporting regression tests; no database or provider calls."""
import ast
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
ANALYTICS = ROOT / "app/api/routes/analytics.py"


def extracted_function(path, name):
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    node = next(item for item in tree.body if isinstance(item, ast.FunctionDef) and item.name == name)
    namespace = {}
    exec(compile(ast.Module(body=[node], type_ignores=[]), str(path), "exec"), namespace)
    return namespace[name]


class ReportingRegressionTests(unittest.TestCase):
    def test_changed_backend_modules_parse(self):
        for relative in ("api/routes/analytics.py", "api/routes/intelligence.py", "api/routes/dashboard.py", "schemas/mvp.py"):
            path = ROOT / "app" / relative
            ast.parse(path.read_text(encoding="utf-8"), filename=str(path))

    def test_threads_total_values_are_not_replaced_with_zero(self):
        parse = extracted_function(ANALYTICS, "_insight_values")
        result = parse({"data": [
            {"name": "likes", "period": "day", "total_value": {"value": 42}},
            {"name": "followers_count", "total_value": {"value": 100}},
            {"name": "views", "values": [{"value": 15}, {"value": 29, "end_time": "2026-08-28"}]},
        ]})
        self.assertEqual(result["likes"], 42)
        self.assertEqual(result["followers_count"], 100)
        self.assertEqual(result["views"], 29)
        self.assertEqual(result["metric_details"]["views"]["end_time"], "2026-08-28")
        self.assertEqual(result["metric_details"]["likes"]["coverage"], "reported total")

    def test_missing_metrics_are_not_zero(self):
        parse = extracted_function(ANALYTICS, "_insight_values")
        result = parse({"data": [
            {"name": "likes", "total_value": {"value": 0}},
            {"name": "reposts", "values": []},
            {"name": "replies", "total_value": {"value": None}},
            {"name": "quotes", "total_value": {"value": True}},
        ]})
        self.assertEqual(result["likes"], 0)
        for name in ("reposts", "replies", "quotes"):
            self.assertNotIn(name, result)

    def test_snapshot_window_does_not_fall_back_to_other_periods(self):
        source = ANALYTICS.read_text(encoding="utf-8")
        self.assertIn("AnalyticsSnapshot.metric_window == window", source)
        self.assertNotIn("or data", source)
        self.assertNotIn("130000", source)
        self.assertNotIn('result["page_impressions_unique"]', source)

    def test_inbox_is_read_only_and_user_scoped(self):
        path = ROOT / "app/api/routes/intelligence.py"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        node = next(item for item in tree.body if isinstance(item, ast.FunctionDef) and item.name == "notification_inbox")
        source = ast.unparse(node)
        self.assertNotIn("_refresh_live_signals", source)
        self.assertNotIn("_matches_niche", source)
        self.assertIn("IntelligenceNotification.user_id == user_id", source)
        self.assertIn(".offset(offset).limit(limit)", source)
        self.assertIn("IntelligenceNotification.id == selected_id", source)

    def test_dashboard_has_no_hardcoded_performance_claims(self):
        source = (ROOT / "app/api/routes/dashboard.py").read_text(encoding="utf-8")
        self.assertNotIn("43% better", source)
        self.assertNotIn("8PM", source)
        self.assertIn("timedelta(days=7)", source)
        self.assertIn("source_published_at", source)


if __name__ == "__main__":
    unittest.main()
