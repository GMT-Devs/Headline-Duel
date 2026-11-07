import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import { blockedWord } from "../src/wordfilter.js";

const env = { ALLOWED_ORIGINS: "https://ok.example" };
const req = (path, body, origin = "https://ok.example") =>
  new Request("https://w.example" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });

test("word filter", () => {
  assert.equal(blockedWord("Fresh beans every Monday"), null);
  assert.equal(blockedWord("this is sh1t"), "shit");
  assert.equal(blockedWord("F.U.C.K this"), "fuck");
  assert.equal(blockedWord("Scunthorpe classic"), null);
});

test("CORS is locked", async () => {
  const res = await worker.fetch(req("/duel/check", { text: "hi" }, "https://evil.example"), env);
  assert.equal(res.status, 403);
  const pre = await worker.fetch(new Request("https://w.example/duel/check", { method: "OPTIONS", headers: { Origin: "https://ok.example" } }), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("Access-Control-Allow-Origin"), "https://ok.example");
});

test("check endpoint", async () => {
  const ok = await (await worker.fetch(req("/duel/check", { text: "B feels clearer" }), env)).json();
  assert.deepEqual(ok, { ok: true });
  const bad = await (await worker.fetch(req("/duel/check", { text: "b is shit" }), env)).json();
  assert.equal(bad.ok, false);
});

test("predict blocks bad words before calling AI, and needs a key", async () => {
  const blocked = await (await worker.fetch(req("/duel/predict", { a: "shit coffee", b: "good coffee" }), env)).json();
  assert.equal(blocked.blocked, true);
  const res = await worker.fetch(req("/duel/predict", { a: "one", b: "two" }), env);
  assert.equal(res.status, 503);
});

test("summary with no reasons returns empty without AI", async () => {
  const out = await (await worker.fetch(req("/duel/summary", { reasons: [] }), env)).json();
  assert.deepEqual(out, { A: [], B: [] });
});

test("unknown route", async () => {
  assert.equal((await worker.fetch(req("/nope", {}), env)).status, 404);
});
