export const LEAD_AGENT_IDS = ["PW00349", "PW00314", "PW00348"] as const;

export function isLeadAgentId(value: string): boolean {
  return LEAD_AGENT_IDS.some(agentId => agentId === value);
}
