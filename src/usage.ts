export const CURRENT_PERIOD_USAGE_URL =
  "https://api2.cursor.sh/aiserver.v1.DashboardService/GetCurrentPeriodUsage";

const USAGE_TIMEOUT_MS = 12_000;

export interface PlanUsage {
  totalSpendCents: number;
  includedSpendCents: number;
  remainingCents: number | null;
  limitCents: number;
  totalPercentUsed: number;
}

export interface SpendLimitUsage {
  totalSpendCents: number | null;
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

export interface FetchUsageOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export class SessionExpiredError extends Error {
  constructor() {
    super("Cursor session expired. Sign in again.");
    this.name = "SessionExpiredError";
  }
}

export class UsageResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageResponseError";
  }
}

export class UsageUnavailableError extends Error {
  constructor(message = "Cursor usage is unavailable.") {
    super(message);
    this.name = "UsageUnavailableError";
  }
}

export function formatPercent(percent: number): string {
  if (!Number.isFinite(percent)) {
    return "—";
  }
  return `${Math.round(Math.min(100, Math.max(0, percent)))}%`;
}

export function usagePercent(plan: PlanUsage): number {
  if (plan.limitCents > 0) {
    return (plan.includedSpendCents / plan.limitCents) * 100;
  }
  return plan.totalPercentUsed;
}

export function formatDollars(cents: number): string {
  const amount = Math.abs(cents) / 100;
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${amount.toFixed(2)}`;
}

export function formatUsageDetails(usage: CurrentPeriodUsage): string {
  const lines: string[] = [];
  if (usage.displayMessage) {
    lines.push(usage.displayMessage);
  }
  lines.push(`Included ${formatDollars(usage.planUsage.includedSpendCents)}`);
  lines.push(
    `Remaining ${usage.planUsage.remainingCents === null ? "—" : formatDollars(usage.planUsage.remainingCents)}`,
  );
  lines.push(`Limit ${formatDollars(usage.planUsage.limitCents)}`);
  if (usage.spendLimitUsage?.totalSpendCents != null) {
    lines.push(`On-demand ${formatDollars(usage.spendLimitUsage.totalSpendCents)}`);
  }
  lines.push(`Cycle ${formatCycleDate(usage.billingCycleStartMs)} – ${formatCycleDate(usage.billingCycleEndMs)}`);
  return lines.join("\n");
}

function formatCycleDate(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) {
    return "—";
  }
  return new Date(ms).toISOString().slice(0, 10);
}

export async function fetchCurrentPeriodUsage(
  accessToken: string,
  options: FetchUsageOptions = {},
): Promise<CurrentPeriodUsage> {
  const fetchImpl = options.fetch ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(CURRENT_PERIOD_USAGE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
      },
      body: "{}",
      signal: AbortSignal.timeout(options.timeoutMs ?? USAGE_TIMEOUT_MS),
    });
  } catch (error) {
    if (isTimeout(error)) {
      throw new UsageUnavailableError("Cursor usage request timed out.");
    }
    throw new UsageUnavailableError("Cursor usage request failed.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new SessionExpiredError();
  }
  if (!response.ok) {
    throw new UsageUnavailableError(`Cursor usage request failed (${response.status}).`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new UsageResponseError("Cursor usage response was not valid JSON.");
  }
  return parseCurrentPeriodUsage(body);
}

export function parseCurrentPeriodUsage(body: unknown): CurrentPeriodUsage {
  const root = asRecord(body);
  if (!root) {
    throw new UsageResponseError("Cursor usage response has no planUsage.");
  }

  const planRecord = asRecord(pick(root, "planUsage", "plan_usage"));
  if (!planRecord) {
    throw new UsageResponseError("Cursor usage response has no planUsage.");
  }

  const spend = pick(root, "spendLimitUsage", "spend_limit_usage");
  let spendLimitUsage: SpendLimitUsage | null = null;
  if (spend !== undefined) {
    const spendRecord = asRecord(spend);
    if (!spendRecord) {
      throw new UsageResponseError("Cursor usage response has an invalid spendLimitUsage.");
    }
    const limitType = pick(spendRecord, "limitType", "limit_type");
    spendLimitUsage = {
      totalSpendCents: optionalNumber(spendRecord, ["totalSpend", "total_spend"]),
      individualLimitCents: optionalNumber(spendRecord, ["individualLimit", "individual_limit"]),
      individualUsedCents: optionalNumber(spendRecord, ["individualUsed", "individual_used"]),
      individualRemainingCents: optionalNumber(spendRecord, ["individualRemaining", "individual_remaining"]),
      limitType: typeof limitType === "string" ? limitType : null,
    };
  }

  const displayMessage = pick(root, "displayMessage", "display_message");
  const includedSpendCents = requireNumber(planRecord, ["includedSpend", "included_spend"], "planUsage.includedSpend");
  const limitCents = requireNumber(planRecord, ["limit"], "planUsage.limit");
  const remainingCents = optionalNumber(planRecord, ["remaining"]) ?? limitCents - includedSpendCents;

  return {
    billingCycleStartMs: optionalNumber(root, ["billingCycleStart", "billing_cycle_start"]),
    billingCycleEndMs: optionalNumber(root, ["billingCycleEnd", "billing_cycle_end"]),
    planUsage: {
      totalSpendCents: requireNumber(planRecord, ["totalSpend", "total_spend"], "planUsage.totalSpend"),
      includedSpendCents,
      remainingCents,
      limitCents,
      totalPercentUsed: requireNumber(planRecord, ["totalPercentUsed", "total_percent_used"], "planUsage.totalPercentUsed"),
    },
    spendLimitUsage,
    displayMessage: typeof displayMessage === "string" ? displayMessage : null,
  };
}

function requireNumber(record: Record<string, unknown>, keys: string[], label: string): number {
  const value = optionalNumber(record, keys);
  if (value === null) {
    throw new UsageResponseError(`Cursor usage response is missing ${label}.`);
  }
  return value;
}

function optionalNumber(record: Record<string, unknown>, keys: string[]): number | null {
  const value = pick(record, ...keys);
  if (value === undefined) {
    return null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}
