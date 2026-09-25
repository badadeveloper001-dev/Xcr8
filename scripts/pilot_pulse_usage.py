"""Run a reproducible, zero-spend pilot with synthetic rates and local SQLite only."""
import argparse
from copy import deepcopy
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import update
from shared import pulse_usage as ledger
from scripts.migrate_pulse_usage import migrate


def pilot():
    with TemporaryDirectory() as folder:
        os.environ["PULSE_USAGE_ENABLED"] = "true"
        os.environ["PULSE_DATABASE_URL"] = "sqlite:///" + (Path(folder)/"pilot.db").as_posix()
        eng = ledger.engine()
        try:
            migrate(eng)
            rate = {"input_per_million": "1", "output_per_million": "2", "source": "synthetic pilot fixture", "effective_date": "2026-09-13"}
            cfg = deepcopy(ledger.DEFAULT_CONFIG)
            cfg["prices"] = {"openai/pilot-text": rate, "deepseek/pilot-text": rate,
                "openai/pilot-image": {"per_image": "0.04", "source": "synthetic pilot fixture", "effective_date": "2026-09-13"}}
            with eng.begin() as conn:
                conn.execute(update(ledger.policy).values(config=cfg))
            for user, feature in [(1, "compose"), (1, "assistant"), (2, "image_generate")]:
                token = ledger.context.set({"user_id": user})
                ident = ledger.start_request(feature)
                ledger.context.set({"user_id": user, "request_id": ident, "feature": feature})
                try:
                    if feature == "assistant":
                        try:
                            def unavailable():
                                raise TimeoutError("simulated provider timeout")
                            ledger.provider_call("openai", "pilot-text", unavailable,
                                reserve_units={"input_tokens": 1000, "output_tokens": 2000})
                        except TimeoutError:
                            pass
                    if feature == "image_generate":
                        ledger.provider_call("openai", "pilot-image", lambda: b"fake image",
                            reserve_units={"images": 1}, measured=lambda _: {"images": 1})
                    else:
                        ledger.provider_call("deepseek" if feature == "assistant" else "openai", "pilot-text", lambda: "fake completion",
                            fallback=feature == "assistant", reserve_units={"input_tokens": 1000, "output_tokens": 2000},
                            measured=lambda _: {"input_tokens": 100, "output_tokens": 200})
                    ledger.finish_request(ident, "success", 15)
                    with eng.begin() as conn:
                        if feature == "image_generate":
                            for _ in range(2):
                                ledger.put_event(conn, "downloaded:"+ident, user, feature, "downloaded", ident, "client_reported")
                finally:
                    ledger.context.reset(token)
            with eng.begin() as conn:
                ledger.put_event(conn, "published:1:instagram", 1, "publishing", "published", source="server_confirmed")
                cfg["mode"] = "enforce"
                cfg["user_limits"] = {"default": {"day": 0}}
                conn.execute(update(ledger.policy).values(config=cfg))
            token = ledger.context.set({"user_id": 1, "request_id": "0"*32, "feature": "compose"})
            blocked = False
            try:
                ledger.provider_call("openai", "pilot-text", lambda: (_ for _ in ()).throw(AssertionError("must not call")),
                    reserve_units={"input_tokens": 1, "output_tokens": 1})
            except ledger.UsageBlocked:
                blocked = True
            finally:
                ledger.context.reset(token)
            result = ledger.dashboard()
            result["pilot"] = {"synthetic": True, "paid_requests": 0, "budget_rejected_before_provider": blocked}
            assert result["periods"]["day"]["cost_micros"] == 41000
            assert result["periods"]["day"]["active_users"] == 2
            assert result["periods"]["day"]["unknown_attempts"] == 1
            assert blocked
            return result
        finally:
            eng.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="work/pulse-pilot.json")
    args = parser.parse_args()
    result = pilot()
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
    print(f"PASS: zero-spend synthetic pilot; report: {target}")
