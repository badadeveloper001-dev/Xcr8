import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("../lib/reporting-ui.ts", import.meta.url), "utf8");
const exports = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, URL });

test("all four platforms have analytics metrics, including Threads interactions", () => {
  for (const id of ["instagram", "facebook", "youtube_shorts", "threads"]) assert.ok(exports.platformMetrics[id]?.length > 0);
  const keys = exports.platformMetrics.threads.map(row => row[0]);
  for (const key of ["followers_count", "views", "likes", "replies", "reposts", "quotes"]) assert.ok(keys.includes(key));
  assert.equal(exports.platformMetrics.facebook.find(row => row[0] === "page_fans")[1], "Page likes");
  assert.ok(!exports.platformMetrics.facebook.some(row => row[0] === "estimated_reach"));
});

test("missing analytics stays unavailable while genuine zero is retained", () => {
  assert.equal(exports.metricNumber(0), 0);
  for (const value of [undefined, null, "", "123", NaN, Infinity]) assert.equal(exports.metricNumber(value), null);
});

test("source links cannot navigate to script URLs or embedded credentials", () => {
  assert.equal(exports.safeSourceUrl("https://news.google.com/story"), "https://news.google.com/story");
  for (const value of ["javascript:alert(1)", "data:text/html,x", "//evil.example", "https://user:pass@example.com", "http://example.com"]) assert.equal(exports.safeSourceUrl(value), null);
});

test("Pulse is categorized separately from trends", () => {
  assert.equal(exports.notificationCategory("Pulse incident #99"), "support");
  assert.equal(exports.notificationCategory("Fashion trends"), "trends");
});

test("backend syntax and reporting fixtures", () => {
  const path = fileURLToPath(new URL("../../backend/tests/test_reporting_regressions.py", import.meta.url));
  let result;
  for (const command of ["python3", "python"]) {
    result = spawnSync(command, [path], { encoding: "utf8", timeout: 30000 });
    if (!result.error || result.error.code !== "ENOENT") break;
  }
  assert.equal(result.status, 0, result.stderr || result.error?.message || "Python 3 is required for backend reporting checks");
});


test("billing renders four cards before pricing or usage completes", () => {
  const queries = [];
  const state = { hasHydrated: true, userId: 42, plan: "free", setPlan() {} };
  const react = {
    useEffect() {},
    useState(value) { return [value, () => {}]; },
    useMemo(fn) { return fn(); },
  };
  const dependencies = {
    react: { ...react, default: react },
    "react/jsx-runtime": { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    "next/navigation": { useRouter: () => ({}), useSearchParams: () => new URLSearchParams() },
    "@tanstack/react-query": {
      useQuery(options) { queries.push(options); return { isPending: true }; },
      useQueryClient: () => ({}),
    },
    "@/components/mobile-shell": { MobileShell: "shell" },
    "@/lib/api": {},
    "@/lib/store": { useCreatorStore: (selector) => selector(state) },
  };
  const pageExports = {};
  const page = readFileSync(new URL("../app/settings/billing/page.tsx", import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(page, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports: pageExports, require: (name) => dependencies[name], URLSearchParams });
  const rendered = pageExports.default();
  const nodes = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    nodes.push(node);
    visit(node.props?.children);
  }
  visit(rendered);
  assert.equal(nodes.filter(node => node.type === "section").length, 4);
  assert.equal(queries.length, 3);
  assert.ok(queries.every(query => query.enabled && query.retry === false));
  const checkoutButtons = nodes.filter(node => node.type === "button" && node.props.className?.includes("mt-6"));
  assert.equal(checkoutButtons.length, 4);
  assert.ok(checkoutButtons.every(node => node.props.disabled));
});
