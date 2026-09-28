import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { activeRowsDeleteSql } from "../lib/import-removal.ts";

test("removing a completed batch removes only its current rows and permits same-file reimport", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE import_batches(id INTEGER,type TEXT,file_hash TEXT,status TEXT);
    CREATE TABLE leads(meta_lead_id TEXT,current_source_batch_id INTEGER);
    CREATE TABLE ad_insights_daily(id INTEGER,current_source_batch_id INTEGER);
    CREATE TABLE bookings(booking_id TEXT,current_source_batch_id INTEGER);
    CREATE TABLE commission_sales(sales_no TEXT,batch_id INTEGER);
    INSERT INTO import_batches VALUES(1,'ads','same-hash','completed');
    INSERT INTO import_batches VALUES(2,'ads','other-hash','completed');
    INSERT INTO ad_insights_daily VALUES(11,1),(12,1),(21,2);`);
  db.exec("BEGIN");
  db.prepare("UPDATE import_batches SET status='removed' WHERE id=? AND status='completed'").run(1);
  const removed = db.prepare(activeRowsDeleteSql.ads).run(1);
  db.exec("COMMIT");
  assert.equal(removed.changes,2);
  assert.deepEqual(db.prepare("SELECT id FROM ad_insights_daily ORDER BY id").all().map(row=>row.id),[21]);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM import_batches WHERE type='ads' AND file_hash='same-hash' AND status='completed'").get().count,0);
  assert.equal(db.prepare("SELECT status FROM import_batches WHERE id=1").get().status,"removed");
  db.prepare("INSERT INTO ad_insights_daily VALUES(?,?)").run(11,3);
  assert.equal(db.prepare("SELECT COUNT(*) count FROM ad_insights_daily").get().count,2);
  db.close();
});

test("commission removal drops its snapshot without touching another batch", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE commission_sales(sales_no TEXT,batch_id INTEGER);
    INSERT INTO commission_sales VALUES('S1',5),('S2',5),('S3',6);`);
  db.prepare(activeRowsDeleteSql.commissions).run(5);
  assert.deepEqual(db.prepare("SELECT sales_no FROM commission_sales").all().map(row=>row.sales_no),["S3"]);
  db.close();
});
