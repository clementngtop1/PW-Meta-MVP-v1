import assert from "node:assert/strict";
import * as XLSX from "xlsx";

const base = process.env.PW_TEST_BASE_URL || "http://localhost:5172";
const email = process.env.PW_TEST_EMAIL || "admin@localhost.test";
const password = process.env.PW_TEST_PASSWORD;
if (!password) throw new Error("Set PW_TEST_PASSWORD for the local smoke test.");

const unauth = await fetch(`${base}/api/dashboard`);
assert.equal(unauth.status, 401, "dashboard must reject anonymous requests");
for (const url of ["/api/leads","/api/bookings","/api/import-history","/api/import-history?format=csv","/api/export?dataset=leads&from=2026-08-03&to=2026-09-01"]) {
  assert.equal((await fetch(`${base}${url}`)).status,401,`${url} must reject anonymous requests`);
}
const login = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: JSON.stringify({ email, password }) });
assert.equal(login.status, 200, await login.text());
const cookie = login.headers.get("set-cookie")?.split(";")[0];
assert.ok(cookie);
const headers = { Cookie: cookie, Origin: base };
const dashboard = await fetch(`${base}/api/dashboard`, { headers });
assert.equal(dashboard.status, 200);
const report = await dashboard.json();
assert.ok(report.dates.from && report.dates.to);
assert.ok(report.coverage.leads);
const csv = await fetch(`${base}/api/export?dataset=leads&from=2026-08-03&to=2026-09-01`, { headers });
assert.equal(csv.status, 200);
const csvBytes = new Uint8Array(await csv.arrayBuffer());
assert.deepEqual(Array.from(csvBytes.slice(0,3)), [0xef,0xbb,0xbf]);
const csvText = new TextDecoder().decode(csvBytes);
assert.ok(csvText.includes("sourceBatchId"));
const dates = new URLSearchParams({ from: report.dates.from, to: report.dates.to });
const visibleResponse = await fetch(`${base}/api/leads?${dates}`, { headers });
assert.equal(visibleResponse.status, 200);
const visible = (await visibleResponse.json()).leads;
const defaultExport = await fetch(`${base}/api/export?dataset=leads&${dates}`, { headers });
assert.equal(defaultExport.status, 200);
const csvRows = text => XLSX.utils.sheet_to_json(XLSX.read(text, { type: "string" }).Sheets.Sheet1, { defval: "" });
const defaultRows = csvRows(await defaultExport.text());
assert.ok(defaultRows.length >= visible.length, "default CSV must include all visible leads");
if (visible.length) {
  const term = visible[0].phone || visible[0].fullName;
  const filtered = new URLSearchParams({ ...Object.fromEntries(dates), search: term });
  const matchedResponse = await fetch(`${base}/api/leads?${filtered}`, { headers });
  assert.equal(matchedResponse.status, 200);
  const matched = (await matchedResponse.json()).leads;
  const filteredExport = await fetch(`${base}/api/export?dataset=leads&${filtered}`, { headers });
  assert.equal(filteredExport.status, 200);
  const filteredRows = csvRows(await filteredExport.text());
  assert.deepEqual(filteredRows.map(row => String(row.metaLeadId)).sort(), matched.map(row => String(row.metaLeadId)).sort(), "CSV must match the searched inbox rows");
  assert.ok(filteredRows.length <= defaultRows.length);
}
const historyResponse = await fetch(`${base}/api/import-history`, { headers });
assert.equal(historyResponse.status, 200);
const history = (await historyResponse.json()).imports;
const historyExport = await fetch(`${base}/api/import-history?format=csv`, { headers });
assert.equal(historyExport.status, 200);
assert.match(historyExport.headers.get("content-disposition") ?? "", /attachment/);
const historyRows = csvRows(await historyExport.text());
assert.ok(historyRows.length >= history.length, "history CSV must include all displayed imports");
if (history.length) {
  const selectedType = history[0].type;
  const typeQuery = new URLSearchParams({ type: selectedType, format: "csv" });
  const filteredHistory = csvRows(await (await fetch(`${base}/api/import-history?${typeQuery}`, { headers })).text());
  assert.ok(filteredHistory.every(row => row.type === selectedType), "history CSV must follow the type filter");
  assert.deepEqual(filteredHistory.filter(row => history.some(item => item.id === Number(row.id))).map(row => Number(row.id)).sort(), history.filter(item => item.type === selectedType).map(item => item.id).sort());
}
const unique = crypto.randomUUID().slice(0,8);
const sheet = XLSX.utils.json_to_sheet([
  { id: `SMOKE-${unique}-001`, created_time: "2026-08-19 12:00", full_name: "=Danger", phone: "+60123456789" },
  { id: `SMOKE-${unique}-001`, created_time: "2026-08-19 12:00", full_name: "Duplicate" },
  { id: `SMOKE-${unique}-002`, created_time: "", full_name: "Missing date" },
  { id: `SMOKE-${unique}-003`, created_time: "2026-09-15 12:00", full_name: "Outside" },
]);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, sheet, "Leads");
const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
const form = new FormData();
form.append("type", "leads"); form.append("agentId", "AG-SMOKE"); form.append("coverageStart", "2026-08-03"); form.append("coverageEnd", "2026-09-01");
form.append("file", new File([bytes], "smoke.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
const preview = await fetch(`${base}/api/import/preview`, { method: "POST", headers, body: form });
if (!preview.ok) throw new Error(`Preview failed: ${preview.status} ${await preview.text()}`);
const parsed = await preview.json();
assert.equal(parsed.totalRows, 4);
assert.equal(parsed.validRows, 2);
assert.equal(parsed.errorRows, 2);
assert.equal(parsed.outOfRangeRows, 1);
assert.equal(parsed.duplicateRows, 1);
const blocked = await fetch(`${base}/api/import-history/1/file`);
assert.equal(blocked.status, 401);
if (process.env.PW_TEST_IMPORT === "1") {
  const commitForm = new FormData();
  for (const [key,value] of form) commitForm.append(key,value);
  commitForm.append("previewHash", parsed.fileHash);
  commitForm.append("confirmOutOfRange", "true");
  const commit = await fetch(`${base}/api/import`, { method: "POST", headers, body: commitForm });
  if (!commit.ok) throw new Error(`Import failed: ${commit.status} ${await commit.text()}`);
  const imported = await commit.json();
  assert.equal(imported.validRows, 2);
  const history = await fetch(`${base}/api/import-history?id=${imported.batchId}`, { headers });
  assert.equal(history.status, 200);
  const detail = await history.json();
  assert.equal(detail.rows.length, 4);
  assert.deepEqual(detail.rows.map(row=>row.fileRow),[2,3,4,5]);
  assert.equal(detail.batch.status, "completed");
  const original = await fetch(`${base}/api/import-history/${imported.batchId}/file`, { headers });
  assert.equal(original.status, 200);
  assert.equal((await original.arrayBuffer()).byteLength, bytes.byteLength);
  const again = await fetch(`${base}/api/import`, { method: "POST", headers, body: commitForm });
  assert.equal(again.status, 200);
  assert.equal((await again.json()).duplicate, true);
  const conflictBook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(conflictBook,XLSX.utils.json_to_sheet([
    {id:`SMOKE-${unique}-CONFLICT-NEW`,created_time:"2026-08-20",full_name:"Must not be imported"},
    {id:`SMOKE-${unique}-001`,created_time:"2026-08-19",full_name:"Wrong agent"},
  ]),"Leads");
  const conflictForm = new FormData();
  conflictForm.append("type","leads"); conflictForm.append("agentId","AG-OTHER"); conflictForm.append("coverageStart","2026-08-03"); conflictForm.append("coverageEnd","2026-09-01");
  conflictForm.append("file",new File([XLSX.write(conflictBook,{bookType:"xlsx",type:"array"})],`conflict-${unique}.xlsx`));
  const conflictPreview = await fetch(`${base}/api/import/preview`,{method:"POST",headers,body:conflictForm});
  const conflictReview = await conflictPreview.json();
  assert.equal(conflictReview.conflicts.length,1);
  conflictForm.append("previewHash",conflictReview.fileHash);
  const rejected = await fetch(`${base}/api/import`,{method:"POST",headers,body:conflictForm});
  assert.equal(rejected.status,409);
  const noPartial = await fetch(`${base}/api/export?dataset=leads&from=2026-08-03&to=2026-09-01`,{headers});
  assert.ok(!(await noPartial.text()).includes(`SMOKE-${unique}-CONFLICT-NEW`));
  const exported = await fetch(`${base}/api/export?dataset=leads&from=2026-08-03&to=2026-09-30`, { headers });
  assert.equal(exported.status, 200);
  const result = await exported.text();
  assert.ok(result.includes("'=Danger"), "formula-like Excel value must be neutralised in CSV");
  const upload = async (type, workbookBytes) => {
    const data = new FormData(); data.append("type",type); data.append("coverageStart","2026-08-03"); data.append("coverageEnd","2026-09-01");
    data.append("file",new File([workbookBytes],`smoke-${type}-${unique}.xlsx`));
    const check = await fetch(`${base}/api/import/preview`,{method:"POST",headers,body:data});
    if (!check.ok) throw new Error(`${type} preview: ${await check.text()}`);
    const inspected = await check.json();
    assert.equal(inspected.validRows,1);
    data.append("previewHash",inspected.fileHash);
    const saved = await fetch(`${base}/api/import`,{method:"POST",headers,body:data});
    if (!saved.ok) throw new Error(`${type} import: ${await saved.text()}`);
    return saved.json();
  };
  const ads = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(ads,XLSX.utils.aoa_to_sheet([
    ["Ads report"],["Generated"],
    ["Day","Campaign ID","Campaign name","Ad set ID","Ad ID","Result type","Results","Amount spent (MYR)","Impressions","Reach","Link clicks"],
    ["2026-08-19",`CAM-${unique}`,"Synthetic campaign",`AS-${unique}`,`AD-${unique}`,"lead",1,100,1000,900,50],
  ]),"Raw Data Report");
  await upload("ads",XLSX.write(ads,{bookType:"xlsx",type:"array"}));
  const booking = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(booking,XLSX.utils.json_to_sheet([{
    booking_id:`BK-${unique}`,meta_lead_id:`SMOKE-${unique}-001`,agent_id:"AG-SMOKE",project_id:"P-SMOKE",unit_id:"U-1",
    booking_date:"2026-08-25",booking_status:"Confirmed",sale_status:"Sold",sale_date:"2026-08-26",paid_commission:250,estimated_commission:300,
  }]),"Bookings");
  await upload("bookings",XLSX.write(booking,{bookType:"xlsx",type:"array"}));
  const merged = await fetch(`${base}/api/dashboard?from=2026-08-03&to=2026-09-01`,{headers});
  assert.equal(merged.status,200);
  const analysed = await merged.json();
  assert.ok(Number(analysed.summary.spend)>=100);
  assert.ok(Number(analysed.summary.sales)>=1);
  assert.ok(Number(analysed.summary.paidCommission)>=250);
  const bookingCsv = await fetch(`${base}/api/export?dataset=bookings&from=2026-08-03&to=2026-09-01`,{headers});
  assert.ok((await bookingCsv.text()).includes(`BK-${unique}`));
  console.log("Atomic import, R2 archive/download, provenance, duplicate protection and CSV formula guard passed.");
  console.log("Ads + Booking imports and Lead-cohort sales/commission aggregation passed.");
}
console.log(`Smoke passed: auth, dashboard, lead and filtered history CSV, import preview (${parsed.validRows} valid / ${parsed.errorRows} errors), original download guard.`);
