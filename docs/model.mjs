// Deterministic, wholly fictional records for the public GitHub Pages preview.
// This module never reads customer files or contacts the production MVP.
export const agents = ["PW00349", "PW00314", "PW00348"];
export const campaigns = [
  { id: "DEMO-CAM-01", name: "Sample Residence · City Living" },
  { id: "DEMO-CAM-02", name: "Sample Residence · Investment" },
  { id: "DEMO-CAM-03", name: "Harbour View · New Launch" },
];

export const leads = Array.from({ length: 36 }, (_, index) => {
  const agent = agents[index % agents.length];
  const month = index < 18 ? "08" : "09";
  const day = String(3 + (index % 18)).padStart(2, "0");
  const campaign = campaigns[Math.floor(index / agents.length) % campaigns.length];
  return {
    id: `DEMO-L${String(index + 1).padStart(3, "0")}`,
    date: `2026-${month}-${day}`,
    name: `Demo Prospect ${String(index + 1).padStart(2, "0")}`,
    email: `prospect${index + 1}@example.invalid`,
    agent,
    platform: index % 4 === 0 ? "Instagram" : "Facebook",
    city: ["Kuala Lumpur", "Selangor", "Johor Bahru", "Ipoh"][index % 4],
    campaignId: campaign.id,
    campaign: campaign.name,
    intent: index % 3 === 0 ? "Investment" : "Own stay",
  };
});

export const ads = agents.flatMap((agent, agentIndex) =>
  ["08", "09"].flatMap((month, monthIndex) =>
    [5, 12, 19, 26].map((day, dayIndex) => {
      const campaign = campaigns[(agentIndex + dayIndex) % campaigns.length];
      return {
        day: `2026-${month}-${String(day).padStart(2, "0")}`,
        agent,
        campaignId: campaign.id,
        campaign: campaign.name,
        spend: 125 + agentIndex * 22 + monthIndex * 16 + dayIndex * 13,
        impressions: 2400 + agentIndex * 420 + dayIndex * 260,
        clicks: 45 + agentIndex * 6 + dayIndex * 4,
      };
    }),
  ),
);

export const payouts = [
  { salesNo: "DEMO-SP-001", payoutDate: "2026-08-18", agent: "PW00349", project: "Sample Residence", unit: "A-08-01", amount: 1800 },
  { salesNo: "DEMO-SP-002", payoutDate: "2026-08-27", agent: "PW00349", project: "Harbour View", unit: "B-12-03", amount: 1450 },
  { salesNo: "DEMO-SP-003", payoutDate: "2026-09-12", agent: "PW00349", project: "Sample Residence", unit: "A-16-05", amount: 2050 },
  { salesNo: "DEMO-SP-004", payoutDate: "2026-08-21", agent: "PW00314", project: "Harbour View", unit: "C-05-09", amount: 1200 },
  { salesNo: "DEMO-SP-005", payoutDate: "2026-09-23", agent: "PW00314", project: "Sample Residence", unit: "A-03-02", amount: 1700 },
  { salesNo: "DEMO-SP-006", payoutDate: "2026-08-29", agent: "PW00348", project: "Sample Residence", unit: "B-06-08", amount: 900 },
  { salesNo: "DEMO-SP-007", payoutDate: "2026-09-19", agent: "PW00348", project: "Harbour View", unit: "C-11-01", amount: 1150 },
];

export const imports = [
  { id: "DEMO-06", type: "Commission", file: "sample-commission-sep.csv", agent: "Mixed agents", from: "2026-09-01", to: "2026-09-30", rows: 3 },
  { id: "DEMO-05", type: "Ads", file: "sample-ads-sep.xlsx", agent: "3 agents", from: "2026-09-01", to: "2026-09-30", rows: 12 },
  { id: "DEMO-04", type: "Leads", file: "sample-leads-sep.xlsx", agent: "3 agents", from: "2026-09-01", to: "2026-09-30", rows: 18 },
  { id: "DEMO-03", type: "Commission", file: "sample-commission-aug.csv", agent: "Mixed agents", from: "2026-08-01", to: "2026-08-31", rows: 4 },
  { id: "DEMO-02", type: "Ads", file: "sample-ads-aug.xlsx", agent: "3 agents", from: "2026-08-01", to: "2026-08-31", rows: 12 },
  { id: "DEMO-01", type: "Leads", file: "sample-leads-aug.xlsx", agent: "3 agents", from: "2026-08-01", to: "2026-08-31", rows: 18 },
];

export function inPeriod(day, from, to) {
  return day >= from && day <= to;
}

export function filterData({ from, to, agent = "", search = "" }) {
  const term = search.trim().toLowerCase();
  const byAgent = row => !agent || row.agent === agent;
  return {
    leads: leads.filter(row => inPeriod(row.date, from, to) && byAgent(row) && (!term || [row.name, row.email, row.id, row.city].some(value => value.toLowerCase().includes(term)))),
    ads: ads.filter(row => inPeriod(row.day, from, to) && byAgent(row)),
    payouts: payouts.filter(row => inPeriod(row.payoutDate, from, to) && byAgent(row)),
  };
}

export function monthlyRoi({ from, to, agent = "" }) {
  const filtered = filterData({ from, to, agent });
  const keys = new Set([
    ...filtered.leads.map(row => `${row.date.slice(0, 7)}:${row.agent}`),
    ...filtered.ads.map(row => `${row.day.slice(0, 7)}:${row.agent}`),
    ...filtered.payouts.map(row => `${row.payoutDate.slice(0, 7)}:${row.agent}`),
  ]);
  return [...keys].sort().map(key => {
    const [month, agentCode] = key.split(":");
    const spend = filtered.ads.filter(row => row.agent === agentCode && row.day.startsWith(month)).reduce((sum, row) => sum + row.spend, 0);
    const commission = filtered.payouts.filter(row => row.agent === agentCode && row.payoutDate.startsWith(month)).reduce((sum, row) => sum + row.amount, 0);
    const leadCount = filtered.leads.filter(row => row.agent === agentCode && row.date.startsWith(month)).length;
    return { month, agent: agentCode, leads: leadCount, spend, commission, roi: spend > 0 ? (commission - spend) / spend : null };
  });
}

export function campaignPerformance({ from, to, agent = "" }) {
  const filtered = filterData({ from, to, agent });
  const keys = new Set([...filtered.ads, ...filtered.leads].map(row => `${row.agent}:${row.campaignId}`));
  return [...keys].map(key => {
    const [agentCode, campaignId] = key.split(":");
    const spend = filtered.ads.filter(row => row.agent === agentCode && row.campaignId === campaignId).reduce((sum, row) => sum + row.spend, 0);
    const leadCount = filtered.leads.filter(row => row.agent === agentCode && row.campaignId === campaignId).length;
    return { agent: agentCode, campaign: campaigns.find(row => row.id === campaignId)?.name ?? campaignId, spend, leads: leadCount, cpl: leadCount && spend ? spend / leadCount : null };
  }).sort((a, b) => b.spend - a.spend);
}

export function csvText(headers, rows) {
  const safe = value => {
    const text = String(value ?? "");
    const escaped = /^[\s]*[=+@\-\t\r]/.test(text) ? `'${text}` : text;
    return `"${escaped.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [headers, ...rows].map(row => row.map(safe).join(",")).join("\r\n") + "\r\n";
}
