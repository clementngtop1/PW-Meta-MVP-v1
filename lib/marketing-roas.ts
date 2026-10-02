export type MonthlyCommissionRow = {
  adRows: number;
  spend: number;
  commission: number;
};

export type RoasSummary = {
  commissionBasedRoas: number | null;
  marketingRoas: null;
  eligibleAdSpend: number;
  eligibleDirectCommission: number;
  eligibleAgentMonths: number;
  commissionWithoutAdSpend: number;
  excludedAgentMonths: number;
};

// This is a commission-return proxy, not verified ad-attributed sale revenue.
export function summarizeCommissionRoas(rows: MonthlyCommissionRow[]): RoasSummary {
  let eligibleAdSpend = 0;
  let eligibleDirectCommission = 0;
  let eligibleAgentMonths = 0;
  let commissionWithoutAdSpend = 0;
  let excludedAgentMonths = 0;

  for (const row of rows) {
    if (row.adRows > 0 && row.spend > 0) {
      eligibleAdSpend += row.spend;
      eligibleDirectCommission += row.commission;
      eligibleAgentMonths++;
    } else if (row.commission > 0) {
      commissionWithoutAdSpend += row.commission;
      excludedAgentMonths++;
    }
  }

  return {
    commissionBasedRoas: eligibleAdSpend > 0 ? eligibleDirectCommission / eligibleAdSpend : null,
    marketingRoas: null,
    eligibleAdSpend,
    eligibleDirectCommission,
    eligibleAgentMonths,
    commissionWithoutAdSpend,
    excludedAgentMonths,
  };
}
