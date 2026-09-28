import { agents, campaignPerformance, csvText, filterData, imports, monthlyRoi } from "./model.mjs";

const pages = [
  ["Overview", "▦"], ["Meta leads", "♙"], ["Campaigns", "◉"],
  ["Commission sales", "⌂"], ["Reports", "▥"], ["Import history", "◷"],
];
const state = { page: "Overview", from: "2026-08-01", to: "2026-09-30", agent: "PW00349", search: "" };
const view = document.querySelector("#view");
const periodNote = document.querySelector("#period-note");
const money = value => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(value);
const integer = value => new Intl.NumberFormat("en-MY").format(value);
const percent = value => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
const esc = value => String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

function sectionHead(title, description, { agent = true, csv = true } = {}) {
  return `<div class="section-head"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div><div class="head-actions">${agent ? `<label class="filter-label" for="agent-filter">Agent Code</label><select id="agent-filter" data-agent class="select"><option value="">All agents</option>${agents.map(code => `<option value="${code}" ${state.agent === code ? "selected" : ""}>${code}</option>`).join("")}</select>` : ""}${csv ? `<button class="button" data-download type="button">⇩ Download CSV</button>` : ""}</div></div>`;
}

function table(headers, rows) {
  return `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th scope="col">${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}

function card(label, value, detail) {
  return `<div class="card"><div class="card-label">${esc(label)}</div><div class="card-value">${esc(value)}</div><div class="card-detail">${esc(detail)}</div></div>`;
}

function visibleHistory() {
  return imports.filter(batch => batch.from <= state.to && batch.to >= state.from);
}

function renderOverview() {
  const data = filterData({ ...state, search: "" });
  const spend = data.ads.reduce((sum, row) => sum + row.spend, 0);
  const commission = data.payouts.reduce((sum, row) => sum + row.amount, 0);
  const clicks = data.ads.reduce((sum, row) => sum + row.clicks, 0);
  const campaignRows = campaignPerformance(state).slice(0, 5);
  return `<div class="stack">
    ${sectionHead("Attribution overview", "A guided preview of the reporting layout and monthly calculation.")}
    <div class="cards">${card("Ad spend", money(spend), `${integer(clicks)} link clicks`)}${card("Meta leads", integer(data.leads.length), "Fictional lead records")}${card("Average CPL", data.leads.length ? money(spend / data.leads.length) : "—", "Ad spend ÷ Meta leads")}${card("Direct commission", money(commission), "Payout dates in selected period")}</div>
    <div class="source-grid">${["Leads", "Ads", "Commission"].map(type => `<div class="panel"><h3>${type} source coverage</h3><p class="source-status">Sample records available</p><p>For layout review only · not imported from Meta or Propwealth.</p></div>`).join("")}</div>
    <div class="hint">Demo ROI for ${esc(state.agent || "all agents")}: <strong>${percent(spend > 0 ? (commission - spend) / spend : null)}</strong>. The real MVP calculates by Agent Code and month from imported Ads spend and direct commission payout dates. This page does not verify real payment or Meta-to-sale attribution.</div>
    <div class="panel hero"><div><strong>Explore the report</strong><p>Use the menu, date range and Agent Code selector. CSV files contain only this demo's fictional records.</p></div><span class="tag">REVIEW MODE</span></div>
    <div><h3>Campaign preview</h3>${table(["No.", "Campaign", "Agent", "Spend", "Leads", "CPL"], campaignRows.map((row, index) => `<tr><td>${index + 1}</td><td class="strong">${esc(row.campaign)}</td><td class="mono">${esc(row.agent)}</td><td class="mono">${money(row.spend)}</td><td>${row.leads}</td><td class="mono">${row.cpl == null ? "—" : money(row.cpl)}</td></tr>`))}</div>
  </div>`;
}

function leadRows() {
  return filterData(state).leads.sort((a, b) => b.date.localeCompare(a.date)).map((row, index) => `<tr><td>${index + 1}</td><td><span class="strong">${esc(row.name)}</span><span class="secondary">${esc(row.id)} · ${esc(row.email)}</span></td><td>${esc(row.date)}</td><td><span class="pill">${esc(row.platform)}</span></td><td>${esc(row.campaign)}</td><td>${esc(row.city)}</td><td class="mono">${esc(row.agent)}</td><td>${esc(row.intent)}</td></tr>`);
}

function renderLeadsTable() {
  const rows = leadRows();
  document.querySelector("#lead-count").textContent = `${rows.length} matching demo leads`;
  document.querySelector("#lead-results").innerHTML = rows.length ? table(["No.", "Lead", "Created", "Platform", "Campaign", "City", "Agent", "Intent"], rows) : `<div class="empty">No matching demo leads for this date range and search.</div>`;
}

function renderLeads() {
  return `<div class="stack">${sectionHead("Meta lead inbox", "Search and inspect fictional Meta leads. No contact actions are connected.")}
    <div class="filters"><input id="lead-search" class="search" type="search" placeholder="Search demo name, ID, email or city" aria-label="Search demo leads" value="${esc(state.search)}"><span id="lead-count" class="filter-label"></span></div>
    <div id="lead-results"></div><div class="table-foot">No phone numbers or real customer details are included in this public demo.</div></div>`;
}

function renderCampaigns() {
  const rows = campaignPerformance(state);
  return `<div class="stack">${sectionHead("Campaign performance", "Selected-period synthetic Ad spend and lead counts, grouped by Agent Code and campaign.")}
    ${rows.length ? table(["No.", "Campaign", "Agent", "Ad spend", "Meta leads", "CPL"], rows.map((row, index) => `<tr><td>${index + 1}</td><td class="strong">${esc(row.campaign)}</td><td class="mono">${esc(row.agent)}</td><td class="mono">${money(row.spend)}</td><td>${row.leads}</td><td class="mono">${row.cpl == null ? "—" : money(row.cpl)}</td></tr>`)) : `<div class="empty">No campaigns in this date range.</div>`}
    <div class="note">Campaign totals here are illustrative. The full MVP imports Ads and Lead files separately; this static page makes no Meta API calls.</div></div>`;
}

function renderCommissions() {
  const rows = filterData(state).payouts.sort((a, b) => b.payoutDate.localeCompare(a.payoutDate));
  return `<div class="stack">${sectionHead("Propwealth commission sales", "Only the selected Agent Code's fictional direct commission lines are shown.")}
    ${rows.length ? table(["No.", "Sales No / payout date", "Project / unit", "Agent Code", "Direct commission", "Source"], rows.map((row, index) => `<tr><td>${index + 1}</td><td class="strong">${esc(row.salesNo)}<span class="secondary">${esc(row.payoutDate)}</span></td><td>${esc(row.project)} · ${esc(row.unit)}</td><td class="mono">${esc(row.agent)}</td><td class="mono">${money(row.amount)}</td><td><span class="pill">Synthetic sample</span></td></tr>`)) : `<div class="empty">No demo commission lines for this selection.</div>`}
    <div class="note">For the real MVP, only direct Commission lines for the Agent Code enter monthly ROI. This public demo is not evidence of a sale or actual payout.</div></div>`;
}

function renderReports() {
  const rows = monthlyRoi(state);
  return `<div class="stack">${sectionHead("Monthly Agent ROI", "Ad spend and direct commission payout by the same Agent Code and month.")}
    ${rows.length ? table(["Month", "Agent", "Meta leads", "Ad spend", "Direct commission", "ROI", "Status"], rows.map(row => `<tr><td class="mono">${esc(row.month)}</td><td class="mono strong">${esc(row.agent)}</td><td>${row.leads}</td><td class="mono">${money(row.spend)}</td><td class="mono">${money(row.commission)}</td><td class="mono strong">${percent(row.roi)}</td><td><span class="pill green">Demo calculated</span></td></tr>`)) : `<div class="empty">No monthly ROI rows in this date range.</div>`}
    <div class="note">ROI = (same-month direct commission − same-month Agent Ads spend) ÷ Ads spend. If Ad spend is missing or zero, ROI is unavailable. All figures on this page are synthetic.</div></div>`;
}

function renderHistory() {
  const rows = visibleHistory();
  return `<div class="stack">${sectionHead("Import history", "Illustrative file-batch history; no original reports exist on GitHub Pages.", { agent: false })}
    ${rows.length ? table(["No.", "Batch", "Report type", "Sample file", "Coverage", "Rows", "Status"], rows.map((row, index) => `<tr><td>${index + 1}</td><td class="mono">${esc(row.id)}</td><td>${esc(row.type)}</td><td>${esc(row.file)}</td><td class="mono">${esc(row.from)} – ${esc(row.to)}</td><td>${row.rows}</td><td><span class="pill green">Demo only</span></td></tr>`)) : `<div class="empty">No sample batches overlap this date range.</div>`}
    <div class="note">The full MVP records real file hashes, validation results and row-level sources in private storage. This public preview neither accepts nor archives files.</div></div>`;
}

function csvForPage() {
  const data = filterData({ ...state, search: state.page === "Meta leads" ? state.search : "" });
  if (state.page === "Meta leads") return { headers: ["leadId", "createdDate", "name", "email", "agentCode", "platform", "campaign", "city", "intent"], rows: data.leads.map(row => [row.id, row.date, row.name, row.email, row.agent, row.platform, row.campaign, row.city, row.intent]) };
  if (state.page === "Campaigns") return { headers: ["agentCode", "campaign", "adSpend", "metaLeads", "cpl"], rows: campaignPerformance(state).map(row => [row.agent, row.campaign, row.spend, row.leads, row.cpl]) };
  if (state.page === "Commission sales") return { headers: ["salesNo", "payoutDate", "agentCode", "project", "unit", "directCommission"], rows: data.payouts.map(row => [row.salesNo, row.payoutDate, row.agent, row.project, row.unit, row.amount]) };
  if (state.page === "Reports") return { headers: ["month", "agentCode", "metaLeads", "adSpend", "directCommission", "roi"], rows: monthlyRoi(state).map(row => [row.month, row.agent, row.leads, row.spend, row.commission, row.roi]) };
  if (state.page === "Import history") return { headers: ["batch", "type", "sampleFile", "coverageStart", "coverageEnd", "rows", "status"], rows: visibleHistory().map(row => [row.id, row.type, row.file, row.from, row.to, row.rows, "Demo only"]) };
  const spend = data.ads.reduce((sum, row) => sum + row.spend, 0);
  const commission = data.payouts.reduce((sum, row) => sum + row.amount, 0);
  return { headers: ["metric", "value"], rows: [["demoAdSpend", spend], ["demoMetaLeads", data.leads.length], ["demoDirectCommission", commission], ["demoROI", spend ? (commission - spend) / spend : ""]] };
}

function downloadCsv() {
  const { headers, rows } = csvForPage();
  const blob = new Blob([csvText(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `propwealth-demo-${state.page.toLowerCase().replaceAll(" ", "-")}-${state.from}-${state.to}-${state.agent || "all"}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function render() {
  for (const id of ["side-nav", "mobile-nav"]) document.querySelector(`#${id}`).innerHTML = pages.map(([page, icon]) => `<button class="nav-button ${state.page === page ? "active" : ""}" type="button" data-page="${page}" ${state.page === page ? 'aria-current="page"' : ""}><span class="nav-icon" aria-hidden="true">${icon}</span>${esc(page)}</button>`).join("");
  document.querySelector("#page-title").textContent = state.page;
  document.querySelector("#from-date").value = state.from;
  document.querySelector("#to-date").value = state.to;
  periodNote.textContent = `Report period: ${state.from} – ${state.to} · Agent: ${state.agent || "All agents"} · Synthetic demo data`;
  view.innerHTML = ({ "Overview": renderOverview, "Meta leads": renderLeads, "Campaigns": renderCampaigns, "Commission sales": renderCommissions, "Reports": renderReports, "Import history": renderHistory })[state.page]();
  if (state.page === "Meta leads") renderLeadsTable();
}

document.addEventListener("click", event => {
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) { state.page = pageButton.dataset.page; render(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (event.target.closest("[data-download]")) { downloadCsv(); return; }
  if (event.target.closest("#import-button")) { document.querySelector("#demo-dialog").showModal(); return; }
  if (event.target.closest("#close-dialog")) { document.querySelector("#demo-dialog").close(); return; }
  if (event.target.closest("#apply-dates")) {
    const from = document.querySelector("#from-date").value;
    const to = document.querySelector("#to-date").value;
    if (!from || !to || from > to) { periodNote.textContent = "Choose a valid start and end date before applying."; return; }
    state.from = from; state.to = to; render();
  }
});
document.addEventListener("change", event => { if (event.target.matches("[data-agent]")) { state.agent = event.target.value; render(); } });
document.addEventListener("input", event => { if (event.target.id === "lead-search") { state.search = event.target.value; renderLeadsTable(); } });
render();
