import { test } from "node:test";
import assert from "node:assert/strict";
import { visitor } from "./ratelimit";

test("visitor id is the first forwarded address", () => {
  const req = (h: Record<string, string>) => new Request("http://x.test", { headers: h });
  assert.equal(visitor(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })), "203.0.113.7");
  assert.equal(visitor(req({ "x-real-ip": "198.51.100.2" })), "198.51.100.2");
  assert.equal(visitor(req({})), "local");
});
