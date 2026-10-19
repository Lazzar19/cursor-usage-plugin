export const CURRENT_PERIOD_USAGE_URL =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";

export interface PlanUsage {
  totalSpendCents: number;
  includedSpendCents: number;
  remainingCents: number;
  limitCents: number;
  totalPercentUsed: number;
}

export interface SpendLimitUsage {
  totalSpendCents: number;
  individualLimitCents: number | null;
  individualUsedCents: number | null;
  individualRemainingCents: number | null;
  limitType: string | null;
}

export interface CurrentPeriodUsage {
  billingCycleStartMs: number | null;
  billingCycleEndMs: number | null;
  planUsage: PlanUsage;
  spendLimitUsage: SpendLimitUsage | null;
  displayMessage: string | null;
}

export class UsageNotReadyError extends Error {
  constructor() {
    super("Fetching Cursor usage is not implemented yet.");
    this.name = "UsageNotReadyError";
  }
}

export function formatPercent(percent: number): string {
  if (!Number.isFinite(percent)) {
    return "—";
  }
  return `${Math.round(Math.min(100, Math.max(0, percent)))}%`;
}

export function fetchCurrentPeriodUsage(_accessToken: string): Promise<CurrentPeriodUsage> {
  return Promise.reject(new UsageNotReadyError());
}
