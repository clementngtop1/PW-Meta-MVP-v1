import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkbook } from "../lib/import-workbook.ts";

const header = "Sales No,Project Name,Unit Number,Date,Agent,Commission Type,Commission Amount (RM)";
const parse = lines => parseWorkbook(new TextEncoder().encode([header, ...lines].join("\n")).buffer, "commissions", "");

test("different payout line dates and agents under one Sales No are accepted", () => {
  const rows = parse([
    "S1,Project A,A-1,03/09/2026,Agent One [PW00349],Commission,100",
    "S1,Project A,A-1,01/09/2026,Agent Two [PW00314],Project Manager Overriding,20",
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].issue, undefined);
  assert.equal(rows[0].eventDate, "2026-09-01");
  assert.equal(rows[0].data.dateVariation, true);
  assert.equal(rows[0].data.latestSourceDate, "2026-09-03");
  assert.deepEqual(JSON.parse(rows[0].data.agentCodes), ["PW00349", "PW00314"]);
  assert.deepEqual(JSON.parse(rows[0].data.detailsJson).map(line => line.sourceDate), ["2026-09-03", "2026-09-01"]);
});

test("different project or unit under one Sales No still flags a conflict", () => {
  const rows = parse([
    "S1,Project A,A-1,01/09/2026,Agent One [PW00349],Commission,100",
    "S1,Project B,A-1,02/09/2026,Agent Two [PW00314],Commission,20",
  ]);
  assert.match(rows[0].issue, /Conflicting Project Name or Unit Number/);
});

test("invalid individual line dates remain errors", () => {
  const rows = parse([
    "S1,Project A,A-1,invalid,Agent One [PW00349],Commission,100",
    "S1,Project A,A-1,02/09/2026,Agent Two [PW00314],Commission,20",
  ]);
  assert.equal(rows.filter(row => row.issue === "Missing/invalid Date").length, 1);
  assert.equal(rows.filter(row => !row.issue).length, 1);
});
