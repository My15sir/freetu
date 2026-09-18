import test from "node:test";
import assert from "node:assert/strict";

import proxy from "../cloudflare/pages-proxy/_worker.js";

test("Pages proxy preserves POST data and rewrites Worker redirects", async () => {
  const originalFetch = globalThis.fetch;
  let forwarded;
  globalThis.fetch = async (request) => {
    forwarded = request;
    return new Response("ok", {
      status: 307,
      headers: {
        Location: "https://freetu-next16.lijun0515ok.workers.dev/login?next=%2Fmanage",
        "Set-Cookie": "__Host-authjs.session-token=test; Path=/; Secure; HttpOnly",
      },
    });
  };

  try {
    const request = new Request("https://imgaes.dpdns.org/api/upload/r2?source=test", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        Cookie: "session=test",
        "Content-Type": "text/plain",
      },
      body: "payload",
    });
    const response = await proxy.fetch(request);

    assert.equal(forwarded.url, "https://freetu-next16.lijun0515ok.workers.dev/api/upload/r2?source=test");
    assert.equal(forwarded.method, "POST");
    assert.equal(forwarded.headers.get("authorization"), "Bearer test-key");
    assert.equal(forwarded.headers.get("cookie"), "session=test");
    assert.equal(forwarded.headers.get("x-forwarded-host"), "imgaes.dpdns.org");
    assert.equal(await forwarded.text(), "payload");
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://imgaes.dpdns.org/login?next=%2Fmanage");
    assert.equal(response.headers.get("x-freetu-upstream"), "opennext-worker");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
