import assert from "node:assert/strict";
import { test } from "node:test";

const { AbortSignal, fetch, FormData, URL } = globalThis;
const web = "http://localhost:3000";
const api = "http://localhost:4000/api";

test("both development services are reachable and Next.js can read API health", async () => {
  const [home, health, diagnostic] = await Promise.all([
    fetch(web), fetch(api + "/health"), fetch(web + "/dev/health"),
  ]);
  assert.equal(home.status, 200);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "ok", service: "devcollab-api" });
  assert.equal(diagnostic.status, 200);
  assert.match(await diagnostic.text(), /<h2>Connected<\/h2>/);
});

test("anonymous visitors cannot open either protected screen or read a profile", async () => {
  for (const path of ["/welcome", "/app"]) {
    const response = await fetch(web + path, { redirect: "manual" });
    assert.equal(response.status, 307, path);
    assert.equal(new URL(response.headers.get("location"), web).href, web + "/auth/sign-in");
  }
  assert.equal((await fetch(api + "/users/me")).status, 401);
});

for (const page of ["sign-up", "sign-in"]) {
  test(`the ${page} form returns validation feedback before hydration`, async () => {
    const url = web + "/auth/" + page;
    const html = await (await fetch(url)).text();
    const form = html.match(/<form\b[^>]*>[\s\S]*?<\/form>/)?.[0];
    assert.ok(form?.includes('name="email"'));

    // Replay the hidden fields emitted by React, as a native browser POST does.
    const body = new FormData();
    for (const [input] of form.matchAll(/<input\b[^>]*type="hidden"[^>]*>/g)) {
      const name = input.match(/name="([^"]+)"/)?.[1];
      const value = input.match(/value="([^"]*)"/)?.[1] ?? "";
      if (name) body.append(name, value.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
    }
    body.set("email", "invalid");
    const response = await fetch(url, {
      method: "POST", headers: { Origin: web }, body, signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Enter a valid email address\./);
  });
}
