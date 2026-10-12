import { test } from "node:test";
import assert from "node:assert/strict";
import { chat } from "./groq";

test("chat gives up immediately once its deadline has passed (no request made)", async () => {
  process.env.GROQ_API_KEY = "test-key";
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => (calls++, new Response("{}"))) as typeof fetch;
  try {
    const t = Date.now();
    assert.equal(await chat("s", "u", { deadline: Date.now() - 1 }), null);
    assert.equal(calls, 0);
    assert.ok(Date.now() - t < 50);
  } finally {
    globalThis.fetch = real;
  }
});

test("chat never sleeps past its deadline when every model is rate-limited", async () => {
  process.env.GROQ_API_KEY = "test-key";
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response("busy", { status: 429, headers: { "retry-after": "20" } })) as typeof fetch;
  try {
    const t = Date.now();
    assert.equal(await chat("s", "u", { deadline: Date.now() + 2500 }), null);
    assert.ok(Date.now() - t < 2600, `took ${Date.now() - t}ms`);
  } finally {
    globalThis.fetch = real;
  }
});
