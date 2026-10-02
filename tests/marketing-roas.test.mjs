import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeCommissionRoas } from "../lib/marketing-roas.ts";

test("commission ROAS uses the ratio of eligible totals, not an average of ratios", () => {
  const result = summarizeCommissionRoas([
    { adRows: 1, spend: 100, commission: 500 },
    { adRows: 1, spend: 300, commission: 0 },
    { adRows: 0, spend: 0, commission: 900 },
  ]);
  assert.equal(result.commissionBasedRoas, 1.25);
  assert.equal(result.eligibleAdSpend, 400);
  assert.equal(result.eligibleDirectCommission, 500);
  assert.equal(result.commissionWithoutAdSpend, 900);
  assert.equal(result.excludedAgentMonths, 1);
  assert.equal(result.marketingRoas, null);
});

test("missing or zero spend never produces a ROAS value", () => {
  const result = summarizeCommissionRoas([
    { adRows: 0, spend: 0, commission: 200 },
    { adRows: 1, spend: 0, commission: 100 },
  ]);
  assert.equal(result.commissionBasedRoas, null);
  assert.equal(result.commissionWithoutAdSpend, 300);
});
