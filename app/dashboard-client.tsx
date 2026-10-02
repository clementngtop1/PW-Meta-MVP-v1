"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { BarChart3, Building2, Download, FileUp, History, LayoutDashboard, Loader2, LogOut, Megaphone, MessageCircle, Search, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LEAD_AGENT_IDS } from "@/lib/lead-agent-options";

type Page = "Overview" | "Meta leads" | "Campaigns" | "Commission sales" | "Reports" | "Import history";
type Admin = { id: number; email: string };
type Coverage = Record<string, { status: string; missingDays: number; batchIds: number[] }>;
type Campaign = { campaignId: string | null; campaignName: string; spend: number | null; leads: number };
type MonthlyRoi = { month: string; agentId: string; leads: number; adRows: number; spend: number; sales: number; commissionLines: number; commission: number; roi: number | null; commissionBasedRoas: number | null; marketingRoas: null; adsBatchIds: string | null; commissionBatchIds: string | null };
type RoasSummary = { commissionBasedRoas: number | null; marketingRoas: null; eligibleAdSpend: number; eligibleDirectCommission: number; eligibleAgentMonths: number; commissionWithoutAdSpend: number; excludedAgentMonths: number };
type Lead = { metaLeadId: string; createdTime: string; fullName: string | null; phone: string | null; email: string | null; city: string | null; platform: string | null; purpose: string | null; campaignName: string | null; assignedAgentId: string | null; sourceBatchId: number | null; sourceFileName: string | null };
type CommissionSale = { salesNo: string; sourceDate: string; projectName: string | null; unitNumber: string | null; lineCount: number; agentCode: string; commissionAmount: number; sourceBatchId: number; sourceFileName: string };
type ImportItem = { id: number; type: string; fileName: string; status: string; totalRows: number; validRows: number; errorRows: number; createdRows: number; updatedRows: number; duplicateRows: number; outOfRangeRows: number; coverageStart: string | null; coverageEnd: string | null; agentId: string | null; effectiveAdsRows: number; uploadedByEmail: string | null; createdAt: string; completedAt: string | null; storageKey: string | null; message: string | null };
type Report = { summary: Record<string, number>; campaigns: Campaign[]; monthlyRoi: MonthlyRoi[]; roas: RoasSummary; coverage: Coverage; imports: ImportItem[]; generatedAt: string; dates: { from: string; to: string } };
type Preview = { fileHash: string; totalRows: number; validRows: number; createdRows: number; updatedRows: number; errorRows: number; duplicateRows: number; excludedRows: number; outOfRangeRows: number; dateVariationRows: number; coverageStart:string; coverageEnd:string; errors: { fileRow: number; issue: string }[]; conflicts: { fileRow: number; recordId: string; assignedAgentId: string }[]; duplicateBatch: { id: number } | null };

async function importResponse<T extends { error?: string }>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    if (response.status === 413) throw new Error("The upload exceeds the server limit. Choose a file under 10 MB.");
    throw new Error(`Import service returned HTTP ${response.status}. Please try again or check the server log.`);
  }
  const data = await response.json() as T;
  if (!response.ok) throw new Error(data.error || `Import failed (HTTP ${response.status}).`);
  return data;
}

const nav: { label: Page; icon: React.ElementType }[] = [
  { label: "Overview", icon: LayoutDashboard }, { label: "Meta leads", icon: Users }, { label: "Campaigns", icon: Megaphone },
  { label: "Commission sales", icon: Building2 }, { label: "Reports", icon: BarChart3 }, { label: "Import history", icon: History },
];
const money = (value: number | null | undefined) => value == null ? "N/A" : new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR" }).format(Number(value) || 0);
const fmt = (value: number | null | undefined) => new Intl.NumberFormat("en-MY").format(Number(value) || 0);
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const multiple = (value: number | null) => value == null ? "N/A" : `${value.toFixed(2)}x`;

export default function DashboardClient() {
  const [admin, setAdmin] = useState<Admin | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [page, setPage] = useState<Page>("Overview");
  const [report, setReport] = useState<Report | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [activeDates, setActiveDates] = useState<{ from: string; to: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [commissionResult, setCommissionResult] = useState<{ key: string; sales: CommissionSale[] } | null>(null);
  const [imports, setImports] = useState<ImportItem[]>([]);
  const [search, setSearch] = useState("");
  const [historyFilters, setHistoryFilters] = useState({ type: "", status: "", from: "", to: "" });
  const [reportAgentId, setReportAgentId] = useState<string>("PW00349");
  const [overviewAgentId, setOverviewAgentId] = useState("");
  const [overviewResult, setOverviewResult] = useState<{ key: string; report: Report } | null>(null);
  const [commissionAgentId, setCommissionAgentId] = useState<string>("PW00349");
  const commissionKey = `${commissionAgentId}:${activeDates?.from ?? ""}:${activeDates?.to ?? ""}`;
  const overviewKey = `${overviewAgentId}:${activeDates?.from ?? ""}:${activeDates?.to ?? ""}`;

  const refresh = useCallback(async (dates?: { from: string; to: string }) => {
    const query = dates ? `?from=${dates.from}&to=${dates.to}` : "";
    const response = await fetch(`/api/dashboard${query}`, { cache: "no-store" });
    if (!response.ok) throw new Error((await response.json() as {error?:string}).error ?? "Dashboard unavailable");
    const next = await response.json() as Report;
    setReport(next); setFrom(next.dates.from); setTo(next.dates.to); setActiveDates(next.dates);
  }, []);
  const refreshHistory = useCallback(async () => {
    const params = new URLSearchParams(historyFilters);
    const response = await fetch(`/api/import-history?${params}`, { cache: "no-store" });
    if (response.ok) setImports((await response.json() as {imports:ImportItem[]}).imports);
  }, [historyFilters]);
  useEffect(() => { fetch("/api/auth/me", { cache: "no-store" }).then(async response => {
    if (response.ok) setAdmin((await response.json() as {admin:Admin}).admin);
  }).finally(() => setAuthReady(true)); }, []);
  useEffect(() => { if (!admin) return; void fetch("/api/dashboard",{cache:"no-store"}).then(r=>r.json() as Promise<Report>).then(next=>{setReport(next);setFrom(next.dates.from);setTo(next.dates.to);setActiveDates(next.dates);}).catch(error=>toast.error(String(error))); }, [admin]);
  useEffect(() => {
    if (!admin || !activeDates || !overviewAgentId) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ from: activeDates.from, to: activeDates.to, agentId: overviewAgentId });
    void fetch(`/api/dashboard?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Unable to load agent overview"); return response.json() as Promise<Report>; })
      .then(next => { if (!controller.signal.aborted) setOverviewResult({ key: overviewKey, report: next }); })
      .catch(error => { if (!controller.signal.aborted) toast.error(String(error)); });
    return () => controller.abort();
  }, [admin, activeDates, overviewAgentId, overviewKey]);
  useEffect(() => { if (!admin) return; const dateQuery=activeDates?`&from=${activeDates.from}&to=${activeDates.to}`:""; if (page === "Meta leads") void fetch(`/api/leads?search=${encodeURIComponent(search)}${dateQuery}`).then(r => r.json() as Promise<{leads?:Lead[]}>).then(d => setLeads(d.leads ?? [])); if (page === "Import history") { const params=new URLSearchParams(historyFilters); void fetch(`/api/import-history?${params}`,{cache:"no-store"}).then(r=>r.json() as Promise<{imports:ImportItem[]}>).then(d=>setImports(d.imports??[])); } }, [admin, page, search, activeDates, historyFilters]);
  useEffect(() => {
    if (!admin || page !== "Commission sales") return;
    const controller = new AbortController();
    const params = new URLSearchParams({ agentId: commissionAgentId });
    if (activeDates) { params.set("from", activeDates.from); params.set("to", activeDates.to); }
    void fetch(`/api/commission-sales?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error("Unable to load commission sales"); return response.json() as Promise<{ sales: CommissionSale[] }>; })
      .then(data => { if (!controller.signal.aborted) setCommissionResult({ key: commissionKey, sales: data.sales }); })
      .catch(error => { if (!controller.signal.aborted) { setCommissionResult({ key: commissionKey, sales: [] }); toast.error(String(error)); } });
    return () => controller.abort();
  }, [admin, page, activeDates, commissionAgentId, commissionKey]);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); setAdmin(null); setReport(null); setLeads([]); };
  if (!authReady) return <main className="grid min-h-screen place-items-center bg-[#f3f6fa]"><Loader2 className="animate-spin text-blue-600" /></main>;
  if (!admin) return <Login onLogin={setAdmin} />;
  const dates = activeDates;
  const selectedOverview = overviewAgentId ? (overviewResult?.key === overviewKey ? overviewResult.report : null) : report;
  const downloadHref = (dataset: "leads" | "ads" | "commissions" | "campaign" | "summary", term = "", selectedAgent = "") => {
    if (!dates) return undefined;
    const params = new URLSearchParams({ dataset, from: dates.from, to: dates.to });
    if (dataset === "leads" && term.trim()) params.set("search", term.trim());
    if (dataset === "commissions") params.set("agentId", commissionAgentId);
    if (selectedAgent) params.set("agentId", selectedAgent);
    return `/api/export?${params}`;
  };
  return <main className="min-h-screen bg-[#f3f6fa] text-[#142033]">
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-[232px] flex-col bg-[#0b1e38] text-white lg:flex">
      <div className="flex h-[72px] items-center gap-3 border-b border-white/10 px-6"><div className="grid size-9 place-items-center rounded-xl bg-[#2f74ff] font-bold">P</div><div><div className="font-semibold">Propwealth</div><div className="text-xs text-blue-200/70">Meta Attribution</div></div></div>
      <nav className="space-y-1 px-3 py-6">{nav.map(({label,icon:Icon}) => <button key={label} onClick={() => setPage(label)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${page===label ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5"}`}><Icon className="size-4" />{label}</button>)}</nav>
      <div className="mx-4 mt-auto mb-4 rounded-xl border border-blue-300/15 bg-blue-400/10 p-4 text-xs text-slate-300">Private Lead · Ads · Commission data<br/><span className="mt-2 block truncate text-blue-100">{admin.email}</span></div>
      <button onClick={logout} className="flex items-center gap-3 border-t border-white/10 p-5 text-sm text-slate-300"><LogOut className="size-4"/>Sign out</button>
    </aside>
    <section className="lg:pl-[232px]">
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-[#dce3ed] bg-white/95 px-5 py-3 backdrop-blur md:px-8"><div><p className="text-xs uppercase tracking-[.12em] text-[#6d7b90]">Propwealth · Meta attribution</p><h1 className="text-xl font-semibold">{page}</h1></div><div className="flex flex-wrap items-center gap-2"><Input aria-label="Report from date" type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-[145px]"/><span className="text-sm text-slate-500">to</span><Input aria-label="Report to date" type="date" value={to} onChange={e => setTo(e.target.value)} className="w-[145px]"/><Button variant="outline" disabled={!from || !to || from>to} onClick={() => void refresh({from,to}).catch(error => toast.error(String(error)))}>Apply</Button><Button onClick={() => setImportOpen(true)} className="bg-[#246bfd]"><FileUp/>Import data</Button></div></header>
      <nav className="flex gap-1 overflow-x-auto border-b bg-white px-4 py-2 lg:hidden">{nav.map(({label,icon:Icon}) => <Button key={label} size="sm" variant={page===label?"secondary":"ghost"} onClick={() => setPage(label)}><Icon/>{label}</Button>)}<Button size="sm" variant="ghost" onClick={logout}>Sign out</Button></nav>
      <div className="mx-auto w-full max-w-[1500px] space-y-5 p-5 md:p-8">
        {dates && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-950">Report period: {dates.from} – {dates.to} · Generated {report?.generatedAt ? new Date(report.generatedAt).toLocaleString() : "—"}</div>}
        {page === "Overview" && (selectedOverview ? <Overview summary={selectedOverview.summary} roas={selectedOverview.roas} campaigns={selectedOverview.campaigns} coverage={selectedOverview.coverage} imports={selectedOverview.imports} agentId={overviewAgentId} onAgentChange={setOverviewAgentId} summaryDownload={downloadHref("summary","",overviewAgentId)}/> : <div className="rounded-xl border bg-white p-5 text-sm text-slate-600">Loading selected Agent Code overview…</div>)}
        {page === "Meta leads" && <Leads leads={leads} search={search} onSearch={setSearch} downloadHref={downloadHref("leads",search)} onChanged={() => { setSearch(""); const dates=activeDates?`?from=${activeDates.from}&to=${activeDates.to}`:""; void fetch(`/api/leads${dates}`).then(r=>r.json() as Promise<{leads:Lead[]}>).then(d=>setLeads(d.leads)); }}/ >}
        {page === "Campaigns" && <><div className="flex flex-wrap items-center justify-between gap-3"><Intro title="Campaign performance" text="Selected-period Ads spend and Meta Leads; monthly Agent ROI is in Reports."/><DownloadCsv href={downloadHref("campaign")}/></div><CampaignTable campaigns={report?.campaigns ?? []}/></>}
        {page === "Commission sales" && <CommissionSales sales={commissionResult?.key===commissionKey?commissionResult.sales:[]} loading={commissionResult?.key!==commissionKey} agentId={commissionAgentId} onAgentChange={setCommissionAgentId} downloadHref={downloadHref("commissions")}/>}
        {page === "Reports" && <Reports rows={report?.monthlyRoi ?? []} agentId={reportAgentId} onAgentChange={setReportAgentId} dates={dates}/>}
        {page === "Import history" && <HistoryView imports={imports} filters={historyFilters} onFilters={setHistoryFilters} onAgentUpdated={async()=>{await refreshHistory();await refresh(activeDates??undefined);}}/>}
      </div>
    </section>
    <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={async (importType,coverage) => { await refresh(importType === "commissions" ? coverage : undefined); await refreshHistory(); if (importType === "commissions") setPage("Commission sales"); else if (page === "Meta leads") setPage("Overview"); }}/>
  </main>;
}

function Login({ onLogin }: { onLogin: (admin:Admin) => void }) {
  const [email,setEmail] = useState(""); const [password,setPassword] = useState(""); const [busy,setBusy] = useState(false);
  const submit = async (event:React.FormEvent) => { event.preventDefault(); setBusy(true); try { const response = await fetch("/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({email,password}) }); const data = await response.json().catch(() => ({error:"Login service unavailable. Please try again."})) as {admin?:Admin;error?:string}; if (!response.ok || !data.admin) throw new Error(data.error ?? "Login failed"); setPassword(""); onLogin(data.admin); } catch (error) { toast.error(error instanceof Error ? error.message : "Login failed"); } finally { setBusy(false); } };
  return <main className="grid min-h-screen place-items-center bg-[#f3f6fa] p-5"><form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border bg-white p-8 shadow-sm"><div className="grid size-11 place-items-center rounded-xl bg-[#246bfd] text-xl font-bold text-white">P</div><div><h1 className="text-2xl font-semibold">Administrator login</h1><p className="mt-1 text-sm text-slate-500">Propwealth Meta attribution · private workspace</p></div><div><label htmlFor="email" className="mb-1 block text-sm">Email</label><Input id="email" type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></div><div><label htmlFor="password" className="mb-1 block text-sm">Password</label><Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></div><Button className="w-full bg-[#246bfd]" disabled={busy}>{busy&&<Loader2 className="animate-spin"/>}Sign in</Button><p className="text-xs text-slate-500">Accounts are created and reset by the system owner. Self-registration is disabled.</p></form></main>;
}

function Intro({title,text}:{title:string;text:string}) { return <div><h2 className="text-2xl font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-500">{text}</p></div>; }
function DownloadCsv({href,className=""}:{href?:string;className?:string}) { return href ? <Button asChild size="sm" variant="outline" className={className}><a href={href}><Download/>Download CSV</a></Button> : null; }
function Card({label,value,detail}:{label:string;value:string;detail:string}) { return <div className="rounded-2xl border bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p><p className="mt-3 text-xs text-slate-500">{detail}</p></div>; }

function Overview({summary,roas,campaigns,coverage,imports,agentId,onAgentChange,summaryDownload}:{summary:Record<string,number>;roas:RoasSummary;campaigns:Campaign[];coverage:Coverage;imports:ImportItem[];agentId:string;onAgentChange:(value:string)=>void;summaryDownload?:string}) {
  const spendAvailable = Number(summary.adRows)>0;
  return <div className="space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><Intro title="Source overview" text="Selected-period Meta Lead and agent-assigned Ads activity, with import coverage."/><div className="flex flex-wrap items-center gap-2"><label htmlFor="overview-agent" className="text-sm text-slate-600">Agent Code</label><select id="overview-agent" aria-label="Filter Overview Agent Code" value={agentId} onChange={event=>onAgentChange(event.target.value)} className="rounded-md border bg-white p-2 text-sm"><option value="">All agents</option>{LEAD_AGENT_IDS.map(id=><option key={id} value={id}>{id}</option>)}</select><DownloadCsv href={summaryDownload}/></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><Card label="Ad spend" value={spendAvailable?money(summary.spend):"N/A"} detail={`${fmt(summary.impressions)} impressions · assigned Ads only`}/><Card label="Meta leads" value={fmt(summary.leads)} detail={`${fmt(summary.clicks)} link clicks`}/><Card label="Average CPL" value={spendAvailable&&summary.leads?money(summary.spend/summary.leads):"N/A"} detail="Selected-period assigned spend ÷ leads"/><Card label="Commission-based ROAS (proxy)" value={multiple(roas.commissionBasedRoas)} detail={`${money(roas.eligibleDirectCommission)} direct commission ÷ ${money(roas.eligibleAdSpend)} eligible Ads spend`}/><Card label="Marketing ROAS (attributed)" value="N/A" detail="Ad-attributed sale revenue is not available"/></div>
    <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">Commission-based ROAS is direct commission ÷ Ads spend for the same Agent Code and month, shown as a multiplier. It is not verified ad-attributed revenue or business profit. ROI = (direct commission − Ads spend) ÷ Ads spend.</p>
    <section className="grid gap-4 lg:grid-cols-3">{["leads","ads","commissions"].map(type => <div key={type} className="rounded-2xl border bg-white p-5"><p className="font-semibold capitalize">{type} source {type==="commissions"?"availability":"coverage"}</p><p className={`mt-2 text-sm ${["covered","available"].includes(coverage[type]?.status)?"text-emerald-700":"text-amber-700"}`}>{type==="commissions"?(coverage[type]?.status==="available"?"Direct commission lines in selected period":"No direct commission lines in selected period"):`${coverage[type]?.status ?? "missing"} · ${coverage[type]?.missingDays ?? "?"} uncovered days`}</p><p className="mt-2 text-xs text-slate-500">Import batches: {coverage[type]?.batchIds.join(", ") || "none"}</p></div>)}</section>
    {(summary.unassignedAdRows>0 || roas.excludedAgentMonths>0) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Data gaps: {summary.unassignedAdRows>0 && <span>{fmt(summary.unassignedAdRows)} Ads rows ({money(summary.unassignedAdSpend)}) have no assigned Agent Code and are excluded from these KPIs. </span>}{roas.excludedAgentMonths>0 && <span>{fmt(roas.excludedAgentMonths)} agent-months contain {money(roas.commissionWithoutAdSpend)} direct commission without eligible Ads spend and are excluded from the ROAS numerator.</span>}</div>}
    {summary.legacyLeads>0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">{fmt(summary.legacyLeads)} leads have unknown legacy source.</div>}
    <CampaignTable campaigns={campaigns.slice(0,8)}/><div className="rounded-xl border bg-white p-4 text-sm">Latest import: {imports[0] ? `#${imports[0].id} · ${imports[0].fileName} · ${imports[0].status}` : "No traceable import yet"}</div>
  </div>;
}

function CampaignTable({campaigns}:{campaigns:Campaign[]}) { return <section className="overflow-x-auto rounded-2xl border bg-white shadow-sm"><div className="border-b p-5"><h2 className="font-semibold">Campaign performance</h2><p className="text-sm text-slate-500">Campaign-level spend and leads. Monthly ROI is grouped by Agent Code.</p></div><Table><TableHeader><TableRow><TableHead>No.</TableHead><TableHead>Campaign</TableHead><TableHead>Spend</TableHead><TableHead>Leads</TableHead><TableHead>CPL</TableHead></TableRow></TableHeader><TableBody>{campaigns.map((row,index) => <TableRow key={row.campaignId ?? index}><TableCell>{index+1}</TableCell><TableCell className="font-medium">{row.campaignName}</TableCell><TableCell>{money(row.spend)}</TableCell><TableCell>{fmt(row.leads)}</TableCell><TableCell>{row.spend!=null&&row.leads?money(row.spend/row.leads):"N/A"}</TableCell></TableRow>)}</TableBody></Table></section>; }

function Leads({leads,search,onSearch,onChanged,downloadHref}:{leads:Lead[];search:string;onSearch:(value:string)=>void;onChanged:()=>void;downloadHref?:string}) {
  const [selected,setSelected] = useState<string[]>([]); const [agentId,setAgentId] = useState(""); const [busy,setBusy] = useState(false);
  const assign = async () => { if (!agentId.trim() || !selected.length) return; setBusy(true); try { const response = await fetch("/api/leads",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({metaLeadIds:selected,agentId:agentId.trim()})}); const result = await response.json() as {error?:string;updated?:number}; if (!response.ok) throw new Error(result.error); toast.success(`${result.updated} leads assigned`); setSelected([]); setAgentId(""); onChanged(); } catch (error) { toast.error(String(error)); } finally { setBusy(false); } };
  return <div className="space-y-5">
    <Intro title="Meta lead inbox" text="Review up to 100 visible leads; Download CSV follows the current date range and search, including all matching rows."/>
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-sm"><Search className="absolute left-3 top-3 size-4 text-slate-400"/><Input className="pl-9" placeholder="Search name, phone or email" value={search} onChange={e=>onSearch(e.target.value)}/></div>
      <Input className="w-40" placeholder="Agent ID" value={agentId} onChange={e=>setAgentId(e.target.value)}/>
      <Button disabled={!selected.length||!agentId.trim()||busy} onClick={assign}>Assign selected ({selected.length})</Button>
      <DownloadCsv href={downloadHref} className="ml-auto"/>
    </div>
    <section className="overflow-x-auto rounded-2xl border bg-white"><Table><TableHeader><TableRow><TableHead>No.</TableHead><TableHead><input type="checkbox" aria-label="Select visible leads" checked={leads.length>0&&selected.length===leads.length} onChange={e=>setSelected(e.target.checked?leads.map(row=>row.metaLeadId):[])}/></TableHead><TableHead>Lead</TableHead><TableHead>Platform</TableHead><TableHead>Campaign</TableHead><TableHead>City</TableHead><TableHead>Agent</TableHead><TableHead>Source</TableHead><TableHead>Actions</TableHead></TableRow></TableHeader><TableBody>{leads.map((row,index) => <TableRow key={row.metaLeadId}><TableCell>{index+1}</TableCell><TableCell><input type="checkbox" aria-label={`Select ${row.fullName||row.metaLeadId}`} checked={selected.includes(row.metaLeadId)} onChange={e=>setSelected(current=>e.target.checked?[...current,row.metaLeadId]:current.filter(id=>id!==row.metaLeadId))}/></TableCell><TableCell><div className="min-w-40 font-medium">{row.fullName||"Unnamed"}</div><div className="text-xs text-slate-500">{row.phone||row.email||row.metaLeadId}</div></TableCell><TableCell>{row.platform||"—"}</TableCell><TableCell className="max-w-48 truncate">{row.campaignName||"—"}</TableCell><TableCell>{row.city||"—"}</TableCell><TableCell>{row.assignedAgentId||"Unassigned"}</TableCell><TableCell className="max-w-48 truncate" title={row.sourceFileName||"Legacy source unknown"}>{row.sourceBatchId?`#${row.sourceBatchId} ${row.sourceFileName}`:"Legacy source unknown"}</TableCell><TableCell>{row.phone && <Button asChild size="sm" variant="outline"><a href={`https://wa.me/${row.phone.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"><MessageCircle/>WhatsApp</a></Button>}</TableCell></TableRow>)}</TableBody></Table></section>
  </div>;
}

function CommissionSales({sales,loading,agentId,onAgentChange,downloadHref}:{sales:CommissionSale[];loading:boolean;agentId:string;onAgentChange:(value:string)=>void;downloadHref?:string}) {
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><Intro title="Propwealth commission sales" text="Only this Agent Code's direct Commission lines are shown. Latest 100 sales by earliest line Date; CSV includes all matching sales. Monthly ROI uses Payout Date instead."/><div className="flex items-center gap-2"><select aria-label="Filter commission Agent Code" value={agentId} onChange={event=>onAgentChange(event.target.value)} className="rounded-md border bg-white p-2 text-sm">{LEAD_AGENT_IDS.map(id=><option key={id} value={id}>{id}</option>)}</select><DownloadCsv href={downloadHref}/></div></div>
    <section className="overflow-x-auto rounded-2xl border bg-white"><Table><TableHeader><TableRow>{["No.","Sales No / earliest line Date","Project / unit","Direct lines","Agent Code","Agent direct commission","Source"].map(cell=><TableHead key={cell}>{cell}</TableHead>)}</TableRow></TableHeader><TableBody>{sales.map((row,index)=><TableRow key={row.salesNo}><TableCell>{index+1}</TableCell><TableCell className="font-medium">{row.salesNo}<div className="text-xs font-normal text-slate-500">{row.sourceDate}</div></TableCell><TableCell>{row.projectName} · {row.unitNumber}</TableCell><TableCell>{row.lineCount}</TableCell><TableCell className="text-xs">{row.agentCode}</TableCell><TableCell>{money(row.commissionAmount)}</TableCell><TableCell className="max-w-48 truncate" title={row.sourceFileName}>#{row.sourceBatchId} {row.sourceFileName}</TableCell></TableRow>)}</TableBody></Table></section>
    {loading && <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">Loading {agentId} commission sales…</p>}
    {!loading && !sales.length && <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No direct Commission sales for {agentId} in this date range.</p>}
  </div>;
}

function Reports({rows,agentId,onAgentChange,dates}:{rows:MonthlyRoi[];agentId:string;onAgentChange:(value:string)=>void;dates:{from:string;to:string}|null}) {
  const selected = rows.filter(row => !agentId || row.agentId === agentId);
  const href = dates ? `/api/export?${new URLSearchParams({dataset:"monthly-roi",from:dates.from,to:dates.to,...(agentId?{agentId}:{})})}` : undefined;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><Intro title="Monthly Agent ROI" text="Ads spend and direct commission payouts for the same Agent Code and month. No manual Lead link."/><div className="flex items-center gap-2"><select aria-label="Filter Agent ID" value={agentId} onChange={event=>onAgentChange(event.target.value)} className="rounded-md border bg-white p-2 text-sm"><option value="">All agents</option>{LEAD_AGENT_IDS.map(id=><option key={id} value={id}>{id}</option>)}</select><DownloadCsv href={href}/></div></div>
    <section className="overflow-x-auto rounded-2xl border bg-white"><Table><TableHeader><TableRow>{["Month","Agent","Meta Leads","Ad spend","Direct commission","Commission lines","ROI","Commission-based ROAS","Marketing ROAS","Status"].map(label=><TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{selected.map(row=><TableRow key={`${row.month}:${row.agentId}`}><TableCell>{row.month}</TableCell><TableCell>{row.agentId}</TableCell><TableCell>{fmt(row.leads)}</TableCell><TableCell>{row.adRows?money(row.spend):"No Ads rows"}</TableCell><TableCell>{money(row.commission)}</TableCell><TableCell>{fmt(row.commissionLines)}</TableCell><TableCell>{row.roi==null?"—":pct(row.roi)}</TableCell><TableCell>{multiple(row.commissionBasedRoas)}</TableCell><TableCell>{multiple(row.marketingRoas)}</TableCell><TableCell>{row.roi==null?"No agent-assigned ad spend":"Proxy calculated; attributed revenue unavailable"}</TableCell></TableRow>)}</TableBody></Table></section>
    {!selected.length && <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No rows for this agent in the selected period. Check the Ads batch Agent ID and imported payout dates.</p>}
    <p className="rounded-xl border bg-white p-4 text-sm">ROI = (same-month direct Commission Amount − same-month agent Ads spend) ÷ Ads spend. Commission-based ROAS = direct Commission Amount ÷ Ads spend; it is a proxy, not ad-attributed revenue or profit. Marketing ROAS needs ad-attributed sale revenue and remains unavailable. Commission month uses each line&apos;s Commission Payout Date. Introducer and overriding lines are excluded. Zero or missing spend leaves ROI and commission-based ROAS blank.</p>
  </div>;
}

function HistoryView({imports,filters,onFilters,onAgentUpdated}:{imports:ImportItem[];filters:{type:string;status:string;from:string;to:string};onFilters:(value:{type:string;status:string;from:string;to:string})=>void;onAgentUpdated:()=>Promise<void>}) {
  const [detail,setDetail] = useState<{batch:Record<string,unknown>;rows:{fileRow:number;recordId:string;action:string;error:string|null}[]}|null>(null);
  const [removingId,setRemovingId] = useState<number|null>(null);
  const open = async (id:number) => { const response=await fetch(`/api/import-history?id=${id}`); if (response.ok) setDetail(await response.json()); else toast.error("Unable to load import detail"); };
  const remove = async (batch:ImportItem) => {
    if (!window.confirm(`Remove import #${batch.id} (${batch.fileName}) from active data? Its current records will leave reports, and you can import the file again. The original file and history will be retained privately.`)) return;
    setRemovingId(batch.id);
    try {
      const response = await fetch("/api/import-history",{method:"DELETE",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:batch.id,fileName:batch.fileName})});
      const result = await response.json() as {error?:string;removedRows?:number};
      if (!response.ok) throw new Error(result.error??"Unable to remove import");
      toast.success(`Import #${batch.id} removed from active data (${result.removedRows??0} current rows).`);
      await onAgentUpdated();
    } catch(error) { toast.error(error instanceof Error?error.message:"Unable to remove import"); }
    finally { setRemovingId(null); }
  };
return <div className="space-y-5"><Intro title="Import history" text="Coverage dates are declarations; original event dates remain unchanged. Legacy imports have unknown source."/><div className="flex flex-wrap items-center gap-2"><select aria-label="Filter report type" value={filters.type} onChange={e=>onFilters({...filters,type:e.target.value})} className="rounded-md border bg-white p-2"><option value="">All types</option><option value="leads">Lead</option><option value="ads">Ads</option><option value="bookings">Booking (legacy)</option><option value="commissions">Commission payout</option></select><select aria-label="Filter import status" value={filters.status} onChange={e=>onFilters({...filters,status:e.target.value})} className="rounded-md border bg-white p-2"><option value="">All statuses</option><option value="completed">Completed</option><option value="removed">Removed</option><option value="failed">Failed</option><option value="processing">Processing</option></select><Input aria-label="History from date" type="date" value={filters.from} onChange={e=>onFilters({...filters,from:e.target.value})} className="w-[150px]"/><Input aria-label="History to date" type="date" value={filters.to} onChange={e=>onFilters({...filters,to:e.target.value})} className="w-[150px]"/><DownloadCsv href={`/api/import-history?${new URLSearchParams({...filters,format:"csv"})}`} className="ml-auto"/></div><section className="overflow-x-auto rounded-2xl border bg-white"><Table><TableHeader><TableRow>{["No.","Batch / file","Type","Coverage","Status","Rows","Created / updated","Uploaded by","Actions"].map(cell=><TableHead key={cell}>{cell}</TableHead>)}</TableRow></TableHeader><TableBody>{imports.map((row,index)=><TableRow key={row.id}><TableCell>{index+1}</TableCell><TableCell><span className="block max-w-64 truncate" title={row.fileName}>#{row.id} · {row.fileName}</span><div className="text-xs text-slate-500">{(row.type==="leads"||row.type==="ads")&&row.agentId?`Agent ${row.agentId} · `:""}{row.createdAt}</div></TableCell><TableCell>{row.type}</TableCell><TableCell>{row.coverageStart?`${row.coverageStart} – ${row.coverageEnd}`:"Legacy unknown"}</TableCell><TableCell><Badge variant="outline">{row.status}</Badge></TableCell><TableCell>{row.type==="commissions"?`${row.validRows} sales / ${row.totalRows} lines`:`${row.validRows}/${row.totalRows}`}<div className="text-xs text-amber-700">{row.errorRows} errors</div></TableCell><TableCell>{row.createdRows} / {row.updatedRows}</TableCell><TableCell>{row.uploadedByEmail||"Unknown"}</TableCell><TableCell><div className="flex flex-wrap gap-2">{row.type==="ads"&&row.status==="completed"&&row.effectiveAdsRows>0&&<AdsAgentSelector batch={row} onChanged={onAgentUpdated}/>}<Button size="sm" variant="outline" onClick={()=>void open(row.id)}>Details</Button>{row.status==="completed"&&row.storageKey&&<Button size="sm" variant="outline" className="text-red-700" disabled={removingId===row.id} onClick={()=>void remove(row)}><Trash2/>Remove</Button>}{row.storageKey?<Button asChild size="sm" variant="outline"><a href={`/api/import-history/${row.id}/file`}><Download/>{row.fileName.toLowerCase().endsWith(".csv")?"CSV":"Excel"}</a></Button>:<span className="text-xs text-slate-500">Original unavailable</span>}</div></TableCell></TableRow>)}</TableBody></Table></section><Dialog open={!!detail} onOpenChange={open=>!open&&setDetail(null)}><DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Import #{String(detail?.batch.id??"")}</DialogTitle><DialogDescription>{String(detail?.batch.file_name??"")} · SHA-256 {String(detail?.batch.file_hash??"Unknown")}</DialogDescription></DialogHeader><p className="text-sm">{String(detail?.batch.message??"")} · {detail?.rows.length??0} row decisions</p><div className="max-h-96 overflow-y-auto"><Table><TableHeader><TableRow><TableHead>File row</TableHead><TableHead>Record ID</TableHead><TableHead>Action</TableHead><TableHead>Error</TableHead></TableRow></TableHeader><TableBody>{detail?.rows.map((row,index)=><TableRow key={index}><TableCell>{row.fileRow}</TableCell><TableCell>{row.recordId||"—"}</TableCell><TableCell>{row.action}</TableCell><TableCell>{row.error||"—"}</TableCell></TableRow>)}</TableBody></Table></div></DialogContent></Dialog></div>;
}

function AdsAgentSelector({batch,onChanged}:{batch:ImportItem;onChanged:()=>Promise<void>}) {
  const [agentId,setAgentId]=useState(batch.agentId??"");
  const [busy,setBusy]=useState(false);
  const save=async()=>{
    if (!agentId || agentId===batch.agentId) return;
    setBusy(true);
    try {
      const response=await fetch("/api/import-history",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:batch.id,agentId})});
      const result=await response.json() as {error?:string};
      if (!response.ok) throw new Error(result.error??"Unable to update Agent ID");
      toast.success(`Ads batch #${batch.id} assigned to ${agentId}`);
      await onChanged();
    } catch(error) { toast.error(error instanceof Error?error.message:"Unable to update Agent ID"); }
    finally { setBusy(false); }
  };
  return <div className="flex items-center gap-1"><select aria-label={`Agent ID for Ads batch ${batch.id}`} value={agentId} onChange={event=>setAgentId(event.target.value)} className="rounded-md border bg-white p-1.5 text-xs"><option value="">Select agent</option>{LEAD_AGENT_IDS.map(id=><option key={id} value={id}>{id}</option>)}</select><Button size="sm" variant="outline" disabled={!agentId||agentId===batch.agentId||busy} onClick={()=>void save()}>Save agent</Button></div>;
}

function ImportDialog({open,onOpenChange,onImported}:{open:boolean;onOpenChange:(value:boolean)=>void;onImported:(type:string,coverage:{from:string;to:string})=>Promise<void>}) {
  const [type,setType]=useState("leads"); const [file,setFile]=useState<File|null>(null); const [agentId,setAgentId]=useState(""); const [start,setStart]=useState(""); const [end,setEnd]=useState(""); const [preview,setPreview]=useState<Preview|null>(null); const [confirmed,setConfirmed]=useState(false); const [busy,setBusy]=useState(false); const inputRef=useRef<HTMLInputElement>(null);
  const form=()=>{ const data=new FormData(); data.append("type",type); if (file) data.append("file",file); data.append("agentId",agentId.trim()); data.append("coverageStart",start); data.append("coverageEnd",end); return data; };
  const inspect=async()=>{ setBusy(true); try { const response=await fetch("/api/import/preview",{method:"POST",body:form()}); const data=await importResponse<Preview&{error?:string}>(response); setPreview(data); if(type==="commissions"&&!start&&!end){setStart(data.coverageStart);setEnd(data.coverageEnd);} setConfirmed(false); } catch(error){toast.error(error instanceof Error?error.message:"Unable to preview file.");} finally{setBusy(false);} };
  const commit=async()=>{if(!preview)return; setBusy(true); try{const data=form();data.append("previewHash",preview.fileHash);data.append("confirmOutOfRange",String(confirmed));const response=await fetch("/api/import",{method:"POST",body:data});const result=await importResponse<{error?:string;validRows?:number;duplicate?:boolean}>(response);toast.success(result.duplicate?"Exact file already imported; no rows duplicated.":`${result.validRows} ${type==="commissions"?"Sales No snapshots":"rows"} imported`);const importedType=type;const coverage={from:start,to:end};setPreview(null);setFile(null);setAgentId("");setStart("");setEnd("");onOpenChange(false);await onImported(importedType,coverage);}catch(error){toast.error(error instanceof Error?error.message:"Unable to import file.");}finally{setBusy(false);}};
return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Import source data</DialogTitle><DialogDescription>Step 1: preview validation. Step 2: confirm and archive the original file privately.</DialogDescription></DialogHeader><div className="space-y-4"><div><label className="mb-1 block text-sm">Report type</label><select value={type} onChange={e=>{setType(e.target.value);setFile(null);setPreview(null);}} className="w-full rounded-md border bg-white p-2"><option value="leads">Meta Lead Report</option><option value="ads">Ads Performance Report</option><option value="commissions">Propwealth Commission Payout Export</option></select></div>{type==="commissions"&&<p className="text-xs text-amber-800">Use the customer CSV as-is. Sales No is counted once; payout lines and PW agent codes are preserved. Commission Amount is not treated as verified paid.</p>}{(type==="leads"||type==="ads")&&<div><label htmlFor="source-import-agent" className="mb-1 block text-sm">Agent ID for this batch *</label><select id="source-import-agent" value={agentId} onChange={e=>{setAgentId(e.target.value);setPreview(null);}} className="w-full rounded-md border bg-white p-2"><option value="">Select agent ID</option>{LEAD_AGENT_IDS.map(id=><option key={id} value={id}>{id}</option>)}</select><p className="mt-1 text-xs text-slate-500">{type==="ads"?"All ad spend in this report will be assigned to this agent.":"All leads in this report will be linked to the selected agent in the system."}</p></div>}<div className="grid gap-3 sm:grid-cols-2"><div><label className="mb-1 block text-sm">Coverage start {type==="commissions"?"(auto from file)":"*"}</label><Input type="date" value={start} onChange={e=>{setStart(e.target.value);setPreview(null);}}/></div><div><label className="mb-1 block text-sm">Coverage end {type==="commissions"?"(auto from file)":"*"}</label><Input type="date" value={end} onChange={e=>{setEnd(e.target.value);setPreview(null);}}/></div></div><Button variant="outline" className="w-full justify-start" onClick={()=>inputRef.current?.click()}><FileUp/>{file?.name|| (type==="commissions"?"Choose CSV or Excel export":"Choose Excel workbook")}</Button><input ref={inputRef} type="file" accept={type==="commissions"?".csv,.xlsx,.xls":".xlsx,.xls"} className="hidden" onChange={e=>{setFile(e.target.files?.[0]??null);setPreview(null);}}/>
    {preview&&<div className="space-y-2 rounded-xl border bg-slate-50 p-4 text-sm"><p className="font-semibold">Preview: {preview.totalRows} {type==="commissions"?"payout lines":"rows"}</p>{(type==="leads"||type==="ads")&&<p className="font-medium">Agent for this batch: {agentId}</p>}<p>{preview.validRows} {type==="commissions"?"Sales No snapshots":"valid"} · {preview.createdRows} new · {preview.updatedRows} updates · {preview.errorRows} errors · {preview.duplicateRows} duplicate IDs · {preview.excludedRows} test rows</p><p className={preview.outOfRangeRows?"text-amber-700":""}>{preview.outOfRangeRows} outside declared coverage</p>{type==="commissions"&&preview.dateVariationRows>0&&<p className="text-amber-700">{preview.dateVariationRows} Sales No have different line dates. All original dates are retained; monthly ROI uses each payout line date.</p>}{preview.duplicateBatch&&<p className="text-amber-700">Exact file already imported in batch #{preview.duplicateBatch.id}; no duplicate counting.</p>}{preview.conflicts.length>0&&<p className="text-red-700">{preview.conflicts.length} agent ownership conflicts; import blocked.</p>}{preview.errors.slice(0,10).map(item=><p key={item.fileRow} className="text-red-700">File row {item.fileRow}: {item.issue}</p>)}{preview.outOfRangeRows>0&&<label className="flex gap-2"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>I reviewed and accept the out-of-range rows</label>}</div>}
  </div><DialogFooter><Button variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button>{!preview?<Button disabled={!file||(type!=="commissions"&&(!start||!end))||(!!start!==!!end)|| (!!start&&!!end&&start>end)||((type==="leads"||type==="ads")&&!agentId.trim())||busy} onClick={()=>void inspect()}>{busy&&<Loader2 className="animate-spin"/>}Preview file</Button>:<Button disabled={busy||!!preview.conflicts.length||(!preview.validRows&&!preview.duplicateBatch)||(preview.outOfRangeRows>0&&!confirmed)} onClick={()=>void commit()}>{busy&&<Loader2 className="animate-spin"/>}Confirm import</Button>}</DialogFooter></DialogContent></Dialog>;
}
