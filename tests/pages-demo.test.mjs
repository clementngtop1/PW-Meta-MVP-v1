import assert from "node:assert/strict";
import test from "node:test";
import { ads, agents, campaignPerformance, csvText, filterData, leads, monthlyRoi, payouts } from "../docs/model.mjs";

test("public preview contains fictional-only records and respects agent, date and search filters", () => {
  assert.equal(leads.length, 36);
  assert.ok(leads.every(row => row.id.startsWith("DEMO-") && row.email.endsWith("@example.invalid")));
  assert.ok(ads.every(row => agents.includes(row.agent)));
  assert.ok(payouts.every(row => row.salesNo.startsWith("DEMO-")));
  const august = filterData({ from: "2026-08-01", to: "2026-08-31", agent: "PW00349" });
  assert.equal(august.leads.length, 6);
  assert.equal(august.ads.length, 4);
  assert.equal(august.payouts.length, 2);
  assert.equal(filterData({ from: "2026-08-01", to: "2026-08-31", agent: "PW00349", search: "prospect 01" }).leads.length, 1);
});

test("demo ROI uses the same agent's ad spend and direct payout month", () => {
  const rows = monthlyRoi({ from: "2026-08-01", to: "2026-09-30", agent: "PW00349" });
  assert.deepEqual(rows.map(row => row.month), ["2026-08", "2026-09"]);
  assert.equal(rows[0].leads, 6);
  assert.equal(rows[0].commission, 3250);
  assert.equal(rows[0].spend, 578);
  assert.equal(rows[0].roi, (3250 - 578) / 578);
  assert.ok(campaignPerformance({ from: "2026-08-01", to: "2026-09-30", agent: "PW00349" }).every(row => row.agent === "PW00349"));
});

test("demo CSV includes UTF-8 BOM and neutralizes formula-like cells", () => {
  const csv = csvText(["name", "amount"], [["=HYPERLINK(\"x\")", -50]]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("'-50"));
});
