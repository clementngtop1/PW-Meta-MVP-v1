import * as XLSX from "xlsx";

export type ReportType = "leads" | "ads" | "bookings" | "commissions";
type Row = Record<string, unknown>;
export type ParsedRow = { fileRow: number; recordId: string; eventDate: string | null; data: Record<string, string | number | boolean | null | undefined>; issue?: string; excluded?: boolean };
const clean = (v: unknown) => v == null ? null : String(v).trim() || null;
const id = (v: unknown) => clean(v)?.replace(/^[a-z]+:/i, "") ?? "";
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v) ? v : Number(clean(v)?.replace(/,/g, "") ?? 0) || 0;
const key = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
const pick = (row: Row, ...aliases: string[]) => Object.entries(row).find(([name]) => aliases.some(alias => key(name) === key(alias)))?.[1] ?? null;

export function eventDate(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    const parts = XLSX.SSF.parse_date_code(value);
    return parts ? `${parts.y}-${String(parts.m).padStart(2, "0")}-${String(parts.d).padStart(2, "0")}` : null;
  }
  const raw = clean(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const date = `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    return validDate(date) ? date : null;
  }
  const slash = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (slash) {
    const date = `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
    return validDate(date) ? date : null;
  }
  return null;
}

export function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function parseWorkbook(bytes: ArrayBuffer, type: ReportType, agentId: string): ParsedRow[] {
  // Keep CSV cells as source text: SheetJS otherwise interprets 01/09/2026
  // as US 9 January before our day/month/year parser sees it.
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true, raw: type === "commissions" });
  const sheet = type === "ads" ? workbook.Sheets["Raw Data Report"] ?? workbook.Sheets[workbook.SheetNames[0]] : workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Workbook has no sheets.");
  if (type === "commissions") {
    const rows = XLSX.utils.sheet_to_json<Row>(sheet, { defval: null, raw: true, blankrows: false });
    const headers = Object.keys(rows[0] ?? {});
    for (const required of ["Sales No", "Project Name", "Unit Number", "Date", "Agent", "Commission Type", "Commission Amount (RM)"]) {
      if (!headers.some(header => key(header) === key(required))) throw new Error(`Commission report must include ${required}.`);
    }
    const groups = new Map<string, { fileRow: number; sourceDate: string; projectName: string | null; unitNumber: string | null; details: Record<string, string | number | null>[]; issue?: string }>();
    const invalid: ParsedRow[] = [];
    rows.forEach((row, index) => {
      const fileRow = Number((row as Row & { __rowNum__?: number }).__rowNum__ ?? index + 1) + 1;
      const salesNo = clean(pick(row, "Sales No")) ?? "";
      const sourceDate = eventDate(pick(row, "Date"));
      const projectName = clean(pick(row, "Project Name"));
      const unitNumber = clean(pick(row, "Unit Number"));
      const agent = clean(pick(row, "Agent"));
      const agentCode = agent?.match(/\[(PW\d+)\]/i)?.[1].toUpperCase() ?? null;
      const issue = !salesNo ? "Missing Sales No" : !sourceDate ? "Missing/invalid Date" : !agentCode ? "Missing PW agent code" : undefined;
      if (issue) { invalid.push({ fileRow, recordId: salesNo, eventDate: sourceDate, data: {}, issue }); return; }
      const current = groups.get(salesNo) ?? { fileRow, sourceDate: sourceDate!, projectName, unitNumber, details: [] };
      // Date belongs to the individual payout line in this export. It is not
      // necessarily a unique sale date shared by every recipient of a Sales No.
      if (current.sourceDate > sourceDate!) current.sourceDate = sourceDate!;
      if (current.projectName !== projectName || current.unitNumber !== unitNumber) current.issue = "Conflicting Project Name or Unit Number for the same Sales No";
      current.details.push({ fileRow, sourceDate, agentCode, commissionType: clean(pick(row, "Commission Type")), overridingFrom: clean(pick(row, "Overriding From")),
        payoutDate: eventDate(pick(row, "Commission Payout Date")), commissionPercent: num(pick(row, "Commission (%)")),
        commissionAmount: num(pick(row, "Commission Amount (RM)")), tax: num(pick(row, "Tax (RM)")),
        withholdingTax: num(pick(row, "Withholding Tax (RM)")), balance: num(pick(row, "Balance (RM)")), hasPv: clean(pick(row, "Has PV")) });
      groups.set(salesNo, current);
    });
    return [...invalid, ...Array.from(groups, ([recordId, group]) => ({ fileRow: group.fileRow, recordId, eventDate: group.sourceDate, issue: group.issue,
      data: { salesNo: recordId, sourceDate: group.sourceDate, projectName: group.projectName, unitNumber: group.unitNumber,
        dateVariation: new Set(group.details.map(detail => detail.sourceDate)).size > 1,
        latestSourceDate: group.details.map(detail => String(detail.sourceDate)).sort().at(-1) ?? group.sourceDate,
        lineCount: group.details.length, agentCodes: JSON.stringify([...new Set(group.details.map(detail => detail.agentCode))]),
        grossCommissionAmount: Math.round(group.details.reduce((sum, detail) => sum + Number(detail.commissionAmount), 0) * 100) / 100,
        detailsJson: JSON.stringify(group.details) } }))];
  }
  let headerIndex = type === "ads" ? 2 : 0;
  if (type === "bookings") {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
    headerIndex = matrix.findIndex(row => row.some(cell => key(String(cell ?? "")) === "bookingid"));
    if (headerIndex < 0) throw new Error("Booking report must include a booking_id column.");
  }
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { range: headerIndex, defval: null, raw: true, blankrows: false });
  return rows.map((row, index) => {
    const fileRow = Number((row as Row & { __rowNum__?: number }).__rowNum__ ?? headerIndex + index + 1) + 1;
    if (type === "leads") {
      const recordId = id(pick(row, "id"));
      const rawTime = pick(row, "created_time");
      const date = eventDate(rawTime);
      const originalTime = clean(rawTime);
      const createdTime = rawTime instanceof Date ? rawTime.toISOString() : typeof rawTime === "number" ? date ?? "" : /^\d{4}-\d{1,2}-\d{1,2}/.test(originalTime ?? "") ? originalTime ?? "" : `${date ?? ""} ${originalTime?.split(/\s+/).slice(1).join(" ") ?? ""}`.trim();
      const fullName = clean(pick(row, "full_name"));
      const email = clean(pick(row, "email"));
      const excluded = Boolean(fullName?.toLowerCase().includes("test lead") || email?.toLowerCase() === "test@meta.com");
      return { fileRow, recordId, eventDate: date, excluded, issue: !recordId ? "Missing Meta Lead ID" : !date ? "Missing/invalid created_time" : undefined,
        data: { metaLeadId: recordId, createdTime, adId: id(pick(row, "ad_id")) || null, adName: clean(pick(row, "ad_name")),
          adsetId: id(pick(row, "adset_id")) || null, adsetName: clean(pick(row, "adset_name")), campaignId: id(pick(row, "campaign_id")) || null,
          campaignName: clean(pick(row, "campaign_name")), formId: id(pick(row, "form_id")) || null, formName: clean(pick(row, "form_name")),
          platform: clean(pick(row, "platform")), purpose: clean(pick(row, "own_stay/_investment", "purpose")),
          incomeRange: clean(pick(row, "monthly_salary_/_income", "income_range")), fullName, phone: clean(pick(row, "phone", "phone_number")),
          city: clean(pick(row, "city")), email, metaStatus: clean(pick(row, "lead_status")), isTest: excluded,
          assignedAgentId: excluded ? null : agentId, assignedAt: excluded ? null : new Date().toISOString() } };
    }
    if (type === "ads") {
      const date = eventDate(pick(row, "Day"));
      const adId = id(pick(row, "Ad ID"));
      const campaignId = id(pick(row, "Campaign ID"));
      const adsetId = id(pick(row, "Ad set ID"));
      const resultType = clean(pick(row, "Result type"));
      return { fileRow, recordId: `${date ?? ""}:${adId}`, eventDate: date, issue: !date ? "Missing/invalid Day" : !adId || !campaignId || !adsetId ? "Missing ad, campaign or ad set ID" : undefined,
        data: { day: date ?? "", campaignId, campaignName: clean(pick(row, "Campaign name")), adsetId, adsetName: clean(pick(row, "Ad set name")),
          adId, resultType, results: resultType?.toLowerCase().includes("lead") ? num(pick(row, "Results")) : 0,
          spend: num(pick(row, "Amount spent (MYR)")), impressions: num(pick(row, "Impressions")), reach: num(pick(row, "Reach")),
          linkClicks: num(pick(row, "Link clicks")) } };
    }
    const recordId = clean(pick(row, "booking_id")) ?? "";
    const date = eventDate(pick(row, "booking_date"));
    return { fileRow, recordId, eventDate: date, issue: !recordId ? "Missing booking_id" : !date ? "Missing/invalid booking_date" : undefined,
      data: { bookingId: recordId, metaLeadId: id(pick(row, "meta_lead_id")) || null, agentId: clean(pick(row, "agent_id")) ?? "UNASSIGNED",
        projectId: clean(pick(row, "project_id")) ?? "UNKNOWN", unitId: clean(pick(row, "unit_id")) ?? "UNKNOWN", bookingDate: date ?? "",
        bookingStatus: clean(pick(row, "booking_status")) ?? "UNKNOWN", saleStatus: clean(pick(row, "sale_status")),
        saleDate: eventDate(pick(row, "sale_date")), cancelledDate: eventDate(pick(row, "cancelled_date")), sellingPrice: num(pick(row, "selling_price")),
        estimatedCommission: num(pick(row, "estimated_commission")), paidCommission: num(pick(row, "paid_commission")),
        commissionPayoutDate: eventDate(pick(row, "commission_payout_date")), updatedAt: clean(pick(row, "updated_at")) ?? new Date().toISOString() } };
  });
}
