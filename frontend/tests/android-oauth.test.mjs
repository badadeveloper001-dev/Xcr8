import assert from "node:assert/strict";
import { File } from "node:buffer";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

class NextRequest extends Request {
  get nextUrl() { return new URL(this.url); }
}

function loadTs(relativePath, dependencies = {}, extra = {}) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, URL, Request, Response, Headers, AbortController, File,
    setTimeout, clearTimeout,
    require(name) {
      if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name);
      return dependencies[name];
    },
    ...extra,
  });
  return exports;
}

function startRoute(proxy, extra = {}) {
  return loadTs("../app/auth/platform-start/route.ts", {
    "next/server": { NextRequest },
    "@/app/api/v1/[...path]/route": { GET: proxy },
  }, extra).GET;
}

function request(query = "platform=instagram&user_id=42&workspace_id=main") {
  return new NextRequest("https://xcr8.example/auth/platform-start?" + query);
}

test("native OAuth redirect preserves backend signed state and creator context", async () => {
  let called = 0;
  const destination = "https://www.facebook.com/v22.0/dialog/oauth?state=signed.state&client_id=example";
  const get = startRoute(async (req, context) => {
    called++;
    assert.equal(req.nextUrl.pathname, "/api/v1/social/oauth/instagram/start");
    assert.equal(req.nextUrl.searchParams.get("user_id"), "42");
    assert.equal(req.headers.get("X-Xcr8-User-Id"), "42");
    assert.equal(req.headers.get("X-Xcr8-Workspace-Id"), "7");
    assert.equal((await context.params).path.join("/"), "social/oauth/instagram/start");
    return Response.json({ auth_url: destination });
  });
  const response = await get(request("platform=instagram&user_id=42&workspace_id=7"));
  assert.equal(called, 1);
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("Location"), destination);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
});

test("main profile uses explicit main context for each supported platform", async () => {
  for (const [platform, destination] of [
    ["instagram", "https://www.facebook.com/v22.0/dialog/oauth"],
    ["facebook", "https://www.facebook.com/v22.0/dialog/oauth"],
    ["threads", "https://threads.net/oauth/authorize"],
    ["youtube_shorts", "https://accounts.google.com/o/oauth2/v2/auth"],
  ]) {
    const get = startRoute(async (req) => {
      assert.equal(req.headers.get("X-Xcr8-Workspace-Id"), "main");
      return Response.json({ auth_url: destination });
    });
    const response = await get(request("platform=" + platform + "&user_id=42"));
    assert.equal(response.headers.get("Location"), destination);
  }
});

test("invalid platform, user and workspace never reach the backend", async () => {
  const get = startRoute(() => { throw new Error("Must not be called"); });
  for (const query of [
    "platform=constructor&user_id=42",
    "platform=instagram&user_id=0",
    "platform=instagram&user_id=NaN",
    "platform=instagram&user_id=9007199254740992",
    "platform=instagram&user_id=42&workspace_id=-1",
  ]) {
    const response = await get(request(query));
    const location = new URL(response.headers.get("Location"));
    assert.equal(location.pathname, "/settings");
    assert.match(location.searchParams.get("oauth_error"), /Invalid connection/);
  }
});

test("rejects non-provider redirects and malformed responses", async () => {
  for (const destination of [
    "javascript:alert(1)",
    "http://www.facebook.com/dialog/oauth",
    "https://www.facebook.com.evil.example/",
    "https://evil.example/?next=https://www.facebook.com",
    "https://user:password@www.facebook.com/",
    "https://www.facebook.com:8080/",
    "",
  ]) {
    const response = await startRoute(async () => Response.json({ auth_url: destination }))(request());
    const location = new URL(response.headers.get("Location"));
    assert.equal(location.origin, "https://xcr8.example");
    assert.equal(location.pathname, "/settings");
    assert.ok(location.searchParams.get("oauth_error"));
  }
  const response = await startRoute(async () => new Response("<html>gateway error</html>"))(request());
  assert.equal(new URL(response.headers.get("Location")).pathname, "/settings");
});

test("provider configuration and backend failures return visible errors", async () => {
  for (const status of [403, 500, 501, 502]) {
    const response = await startRoute(async () => Response.json({ detail: "failure" }, { status }))(request());
    const target = new URL(response.headers.get("Location"));
    assert.equal(target.hash, "#connected-platforms");
    assert.ok(target.searchParams.get("oauth_error"));
  }
});

test("slow start request is aborted and returns to settings", async () => {
  let cleared = false;
  const get = startRoute(async (req) => {
    if (!req.signal.aborted) await new Promise((resolve) => req.signal.addEventListener("abort", resolve, { once: true }));
    throw new Error("aborted");
  }, {
    setTimeout(callback) { queueMicrotask(callback); return 1; },
    clearTimeout() { cleared = true; },
  });
  const response = await get(request());
  assert.equal(new URL(response.headers.get("Location")).pathname, "/settings");
  assert.equal(cleared, true);
});

test("Android files with missing MIME metadata are usable; unsupported files are rejected", () => {
  const { normalizeSelectedMedia } = loadTs("../components/device-media-picker.tsx", {
    react: {}, "react/jsx-runtime": {}, "lucide-react": {},
  });
  const photo = new File(["image"], "photo.JPG", { lastModified: 123 });
  const normalized = normalizeSelectedMedia(photo, "image");
  assert.equal(normalized.type, "image/jpeg");
  assert.equal(normalized.name, photo.name);
  assert.equal(normalized.size, photo.size);
  assert.equal(normalized.lastModified, 123);
  assert.equal(normalizeSelectedMedia(new File(["video"], "clip.mp4"), "media").type, "video/mp4");
  assert.equal(normalizeSelectedMedia(new File(["video"], "clip.mp4"), "image"), null);
  assert.equal(normalizeSelectedMedia(new File(["html"], "photo.jpg", { type: "text/html" }), "image"), null);
  assert.equal(normalizeSelectedMedia(new File(["data"], "unknown.bin"), "media"), null);
});


function proxyRoute(fetchImpl) {
  return loadTs("../app/api/v1/[...path]/route.ts", {
    "next/server": { NextRequest },
  }, { process: { env: { BACKEND_API_URL: "https://backend.example", VERCEL: "1" } },
    fetch: fetchImpl, console });
}

test("Android compression and frontend routing metadata do not leak upstream", async () => {
  const proxy = proxyRoute(async (_url, init) => {
    const h = init.headers;
    assert.equal(h.get("accept-encoding"), "identity");
    assert.equal(h.get("x-deployment-id"), null);
    assert.equal(h.get("sec-ch-ua-platform"), null);
    assert.equal(h.get("content-length"), null);
    assert.equal(h.get("cookie"), "session=keep");
    assert.equal(h.get("authorization"), "Bearer keep");
    assert.equal(h.get("x-xcr8-workspace-id"), "7");
    return new Response('{"assistant_message":"Hello"}', {
      headers: { "content-type": "application/json", "content-encoding": "gzip",
        "content-length": "999", "cache-control": "public, max-age=3600" },
    });
  });
  const req = new NextRequest("https://app.example/api/v1/ai/assistant", {
    headers: { "accept-encoding": "gzip, deflate, br, zstd",
      "x-deployment-id": "stale-deployment", "sec-ch-ua-platform": "Android",
      "cookie": "__vdpl=stale;session=keep", "authorization": "Bearer keep",
      "x-xcr8-workspace-id": "7" },
  });
  const response = await proxy.GET(req, { params: Promise.resolve({ path: ["ai", "assistant"] }) });
  assert.equal(response.headers.get("content-length"), null);
  assert.equal(response.headers.get("content-encoding"), null);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.ok(response.headers.get("x-xcr8-request-id"));
  assert.equal((await response.json()).assistant_message, "Hello");
});

test("a failed AI POST is never replayed to another backend", async () => {
  let calls = 0;
  const proxy = proxyRoute(async () => { calls++; throw new Error("connection dropped"); });
  const response = await proxy.POST(new NextRequest("https://app.example/api/v1/ai/assistant", {
    method: "POST", body: '{"message":"hello"}', headers: { "content-type": "application/json" },
  }), { params: Promise.resolve({ path: ["ai", "assistant"] }) });
  assert.equal(calls, 1);
  assert.equal(response.status, 502);
});

test("OAuth failures include a safe request reference and status", async () => {
  const response = await startRoute(async () => Response.json({}, {
    status: 502, headers: { "x-xcr8-request-id": "test-reference" },
  }))(request());
  const message = new URL(response.headers.get("location")).searchParams.get("oauth_error");
  assert.match(message, /HTTP 502/);
  assert.match(message, /test-reference/);
});

test("AI rejects incomplete and offline fallback replies instead of presenting them as answers", async () => {
  for (const data of [
    { assistant_message: "generic reply", model: "backend-local-assistant-fallback" },
    { assistant_message: "", model: "live-provider" },
    "<html>gateway error</html>",
  ]) {
    const client = { interceptors: { request: { use() {} } }, post: async () => ({ data }) };
    const api = loadTs("../lib/api.ts", { axios: { default: { create: () => client } } },
      { process: { env: {} } });
    await assert.rejects(() => api.chatWithAiAssistant({ user_id: 42, message: "hello" }));
  }
  const client = { interceptors: { request: { use() {} } },
    post: async () => ({ data: { assistant_message: "Useful answer", model: "deepseek-chat" } }) };
  const api = loadTs("../lib/api.ts", { axios: { default: { create: () => client } } },
    { process: { env: {} } });
  const response = await api.chatWithAiAssistant({ user_id: 42, message: "hello" });
  assert.equal(response.assistant_message, "Useful answer");
  assert.equal(response.suggested_actions.length, 0);
});


test("HTTP 402 preserves the actual service detail instead of inventing configuration advice", () => {
  const client = { interceptors: { request: { use() {} } } };
  const api = loadTs("../lib/api.ts", {
    axios: { default: { create: () => client, isAxiosError: () => true } },
  }, { process: { env: {} } });
  for (const detail of ["Provider billing unavailable", { message: "Payment verification required" }]) {
    const result = api.getApiErrorMessage({ response: { status: 402, data: { detail } } }, "fallback");
    assert.equal(result, typeof detail === "string" ? detail : detail.message);
  }
  const result = api.getApiErrorMessage({ response: {
    status: 402, data: "<html>gateway</html>", headers: { "x-xcr8-request-id": "ref-123" },
  } }, "fallback");
  assert.match(result, /HTTP 402/);
  assert.match(result, /ref-123/);
  assert.doesNotMatch(result, /NEXT_PUBLIC|BACKEND_API_URL/);
});
