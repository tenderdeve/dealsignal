import { test } from "node:test";
import assert from "node:assert/strict";
import type { Row } from "./jobs";
import { unbacked } from "./opener";

const row = (founded: number | null) => ({ lead: { yearFounded: founded }, signals: null }) as unknown as Row;

test("opener guard: history only with a known founding year", () => {
  assert.ok(unbacked("serving Dallas for over a decade", row(null)));
  assert.ok(!unbacked("serving Dallas for over a decade", row(1995)));
  assert.ok(!unbacked("a local plumbing business in Dallas", row(null)));
});

test("opener guard: reviews and reputation are never allowed", () => {
  assert.ok(unbacked("earning positive reviews", row(1995)));
  assert.ok(unbacked("your strong reputation in Plano", row(1995)));
});
