import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { campaignSql, monthlyAgentRoiSql, summarySql } from "../lib/commission-report-queries.ts";
import { agentCommissionSalesSql } from "../lib/commission-sales-query.ts";

test("commission sales preview and CSV query exclude other agents and non-direct payout lines", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE import_batches(id INTEGER,status TEXT,completed_at TEXT,file_name TEXT,coverage_start TEXT,coverage_end TEXT);
    CREATE TABLE commission_sales(batch_id INTEGER,sales_no TEXT,source_date TEXT,project_name TEXT,unit_number TEXT,details_json TEXT);
    INSERT INTO import_batches VALUES(1,'completed','2026-08-05','old.csv','2026-08-01','2026-08-31');
    INSERT INTO import_batches VALUES(2,'completed','2026-09-05','new.csv','2026-08-01','2026-08-31');`);
  const add = db.prepare("INSERT INTO commission_sales VALUES(?,?,?,?,?,?)");
  add.run(1,"S1","2026-08-02","Project","Unit",JSON.stringify([{agentCode:"PW00349",commissionType:"Commission",commissionAmount:999}]));
  add.run(2,"S1","2026-08-02","Project","Unit",JSON.stringify([
    {agentCode:"PW00349",commissionType:"Commission",commissionAmount:100},
    {agentCode:"PW00349",commissionType:"Commission",commissionAmount:50},
    {agentCode:"PW00349",commissionType:"Individual Introducer",commissionAmount:40},
    {agentCode:"PW00314",commissionType:"Commission",commissionAmount:200},
  ]));
  add.run(2,"S2","2026-08-03","Project","Other",JSON.stringify([{agentCode:"PW00314",commissionType:"Commission",commissionAmount:300}]));
  const selected = db.prepare(agentCommissionSalesSql).all("2026-08-01","2026-08-31","PW00349");
  assert.equal(selected.length,1);
  assert.equal(selected[0].salesNo,"S1");
  assert.equal(selected[0].agentCode,"PW00349");
  assert.equal(selected[0].lineCount,2);
  assert.equal(selected[0].commissionAmount,150);
  assert.equal(selected[0].sourceFileName,"new.csv");
  assert.equal(db.prepare(agentCommissionSalesSql).all("2026-08-03","2026-08-31","PW00349").length,0);
  db.close();
});

test("monthly ROI groups Ads and direct payout lines by agent and month without Lead links", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE leads(meta_lead_id TEXT,created_time TEXT,is_test INTEGER,campaign_id TEXT,campaign_name TEXT,assigned_agent_id TEXT,current_source_batch_id INTEGER);
    CREATE TABLE import_batches(id INTEGER,type TEXT,status TEXT,completed_at TEXT,agent_id TEXT);
    CREATE TABLE commission_sales(batch_id INTEGER,sales_no TEXT,source_date TEXT,details_json TEXT);
    CREATE TABLE ad_insights_daily(day TEXT,campaign_id TEXT,campaign_name TEXT,spend REAL,impressions INTEGER,link_clicks INTEGER,current_source_batch_id INTEGER);
    INSERT INTO leads VALUES('L1','2026-08-05',0,'C1','Campaign 1','PW00349',1);
    INSERT INTO import_batches VALUES(1,'leads','completed','2026-08-10','PW00349');
    INSERT INTO import_batches VALUES(2,'ads','completed','2026-08-10','PW00349');
    INSERT INTO import_batches VALUES(3,'ads','completed','2026-08-10','PW00314');
    INSERT INTO import_batches VALUES(4,'commissions','completed','2026-08-10',NULL);
    INSERT INTO import_batches VALUES(5,'commissions','completed','2026-09-10',NULL);
    INSERT INTO ad_insights_daily VALUES('2026-08-05','C1','Campaign 1',100,1000,50,2);
    INSERT INTO ad_insights_daily VALUES('2026-08-06','C1','Campaign 1',25,200,10,3);
    INSERT INTO ad_insights_daily VALUES('2026-09-05','C1','Campaign 1',50,500,20,2);
    INSERT INTO ad_insights_daily VALUES('2026-08-07','C1','Campaign 1',40,400,15,NULL);`);
  const insert = db.prepare("INSERT INTO commission_sales VALUES(?,?,?,?)");
  const details = lines => JSON.stringify(lines.map(([agentCode,commissionType,commissionAmount,payoutDate]) => ({agentCode,commissionType,commissionAmount,payoutDate})));
  insert.run(4,"S1","2026-08-01",details([["PW00349","Commission",1000,"2026-08-15"]]));
  insert.run(5,"S1","2026-08-01",details([
    ["PW00349","Commission",300,"2026-08-15"],
    ["PW00349","Commission",80,"2026-09-10"],
    ["PW00349","Individual Introducer",90,"2026-08-15"],
    ["PW00314","Commission",200,"2026-08-15"],
  ]));
  insert.run(5,"S2","2026-08-02",details([["PW00349","Commission",120,"2026-09-05"]]));
  const rows = db.prepare(monthlyAgentRoiSql).all(...Array(3).fill(["2026-08-01","2026-09-30"]).flat());
  assert.deepEqual(rows.map(row => [row.month,row.agentId,row.spend,row.commission]), [
    ["2026-08","PW00314",25,200],
    ["2026-08","PW00349",100,300],
    ["2026-09","PW00349",50,200],
  ]);
  assert.equal((rows[1].commission-rows[1].spend)/rows[1].spend,2);
  assert.equal((rows[2].commission-rows[2].spend)/rows[2].spend,3);
  assert.equal(rows[1].leads,1);
  assert.equal(rows[2].sales,2);
  const summary = db.prepare(summarySql).get("2026-08-01","2026-08-31","","","2026-08-01","2026-08-31","","","2026-08-01","2026-08-31");
  assert.equal(summary.spend,125);
  assert.equal(summary.leads,1);
  assert.equal(summary.unassignedAdRows,1);
  assert.equal(summary.unassignedAdSpend,40);
  const agentSummary = db.prepare(summarySql).get("2026-08-01","2026-08-31","PW00349","PW00349","2026-08-01","2026-08-31","PW00349","PW00349","2026-08-01","2026-08-31");
  assert.equal(agentSummary.spend,100);
  assert.equal(agentSummary.leads,1);
  const campaign = db.prepare(campaignSql).get("2026-08-01","2026-08-31","","","2026-08-01","2026-08-31","","");
  assert.equal(campaign.spend,125);
  assert.equal(campaign.leads,1);
  const agentCampaign = db.prepare(campaignSql).get("2026-08-01","2026-08-31","PW00349","PW00349","2026-08-01","2026-08-31","PW00349","PW00349");
  assert.equal(agentCampaign.spend,100);
  assert.equal(agentCampaign.leads,1);
  db.close();
});

test("payout month without agent Ads spend remains a valid row with no ROI denominator", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE leads(created_time TEXT,is_test INTEGER,assigned_agent_id TEXT);
    CREATE TABLE import_batches(id INTEGER,type TEXT,status TEXT,completed_at TEXT,agent_id TEXT);
    CREATE TABLE commission_sales(batch_id INTEGER,sales_no TEXT,details_json TEXT);
    CREATE TABLE ad_insights_daily(day TEXT,spend REAL,current_source_batch_id INTEGER);
    INSERT INTO import_batches VALUES(1,'commissions','completed','2026-09-10',NULL);
    INSERT INTO commission_sales VALUES(1,'S1','[{"agentCode":"PW00349","commissionType":"Commission","commissionAmount":100,"payoutDate":"2026-09-01"}]');`);
  const row = db.prepare(monthlyAgentRoiSql).get(...Array(3).fill(["2026-09-01","2026-09-30"]).flat());
  assert.equal(row.agentId,"PW00349");
  assert.equal(row.commission,100);
  assert.equal(row.adRows,0);
  assert.equal(row.spend,0);
  db.close();
});
