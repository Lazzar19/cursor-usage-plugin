import { AccessTokenNotFoundError, StateDbNotFoundError } from "./auth";
import { renderBar } from "./bar";
import { formatPercent, formatUsageDetails, SessionExpiredError, usagePercent, type CurrentPeriodUsage } from "./usage";

const DEFAULT_POLL_SECONDS = 300;
const MIN_POLL_SECONDS = 60;

export interface UsageFailure {
  label: string;
  keepLastSuccess: boolean;
}

export function pollIntervalMs(seconds: number | undefined): number {
  const value = typeof seconds === "number" && Number.isFinite(seconds) ? seconds : DEFAULT_POLL_SECONDS;
  return Math.max(MIN_POLL_SECONDS, value) * 1000;
}

export function describeFailure(error: unknown): UsageFailure {
  if (error instanceof StateDbNotFoundError || error instanceof AccessTokenNotFoundError) {
    return { label: "Cursor: sign in", keepLastSuccess: false };
  }
  if (error instanceof SessionExpiredError) {
    return { label: "Cursor: session expired", keepLastSuccess: false };
  }
  return { label: "Cursor: usage unavailable", keepLastSuccess: true };
}

export function failureMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "Could not read Cursor usage.";
  }
  const message = error.message.split("\n")[0]?.trim() ?? "";
  if (!message || /authorization:\s*bearer/i.test(message)) {
    return "Could not read Cursor usage.";
  }
  return message;
}

export type MeterLevel = "normal" | "warning" | "critical";

export const CURSOR_MODELS_COLOR = "#5B9DFF";
export const OTHER_MODELS_COLOR = "#E8A838";

export interface PoolMeter {
  key: "cursor" | "other";
  text: string;
  level: MeterLevel;
  color: string | null;
}

export interface UsageView {
  pools: PoolMeter[];
  text: string;
  tooltip: string;
  level: MeterLevel;
  output: string;
}

export function meterLevel(percent: number, warningPercent: number, criticalPercent: number): MeterLevel {
  if (percent >= criticalPercent) {
    return "critical";
  }
  if (percent >= warningPercent) {
    return "warning";
  }
  return "normal";
}

export function presentUsage(
  usage: CurrentPeriodUsage,
  segments: number,
  warningPercent: number,
  criticalPercent: number,
): UsageView {
  const details = formatUsageDetails(usage);
  const pools = [
    poolMeter("cursor", "$(pulse) Cursor", usage.planUsage.autoPercentUsed, segments, warningPercent, criticalPercent, CURSOR_MODELS_COLOR),
    poolMeter("other", "Other", usage.planUsage.apiPercentUsed, segments, warningPercent, criticalPercent, OTHER_MODELS_COLOR),
  ];
  return {
    pools,
    text: pools.map((pool) => pool.text).join(" · "),
    tooltip: details,
    level: meterLevel(leadingPercent(usage.planUsage), warningPercent, criticalPercent),
    output: details,
  };
}

export function presentSpin(
  usage: CurrentPeriodUsage | undefined,
  segments: number,
  warningPercent: number,
  criticalPercent: number,
): UsageView {
  if (!usage) {
    return {
      pools: [{ key: "cursor", text: "$(sync~spin) Cursor", level: "normal", color: CURSOR_MODELS_COLOR }],
      text: "$(sync~spin) Cursor",
      tooltip: "Refreshing Cursor usage…",
      level: "normal",
      output: "",
    };
  }
  const shown = presentUsage(usage, segments, warningPercent, criticalPercent);
  const pools = shown.pools.map((pool, index) =>
    index === 0 ? { ...pool, text: pool.text.replace("$(pulse)", "$(sync~spin)") } : pool,
  );
  return { ...shown, pools, text: pools.map((pool) => pool.text).join(" · ") };
}

function poolMeter(
  key: PoolMeter["key"],
  label: string,
  percent: number | null,
  segments: number,
  warningPercent: number,
  criticalPercent: number,
  color: string,
): PoolMeter {
  if (percent === null) {
    return { key, text: `${label} —`, level: "normal", color };
  }
  const bar = renderBar(percent, { segments, fillGlyph: "▓", emptyGlyph: "░" });
  return {
    key,
    text: `${label} ${bar} ${formatPercent(percent)}`,
    level: meterLevel(percent, warningPercent, criticalPercent),
    color,
  };
}

function leadingPercent(plan: CurrentPeriodUsage["planUsage"]): number {
  const pools = [plan.autoPercentUsed, plan.apiPercentUsed].filter((value): value is number => value !== null);
  if (pools.length === 0) {
    return usagePercent(plan);
  }
  return Math.max(...pools);
}

export function presentFailure(error: unknown, last: UsageView | undefined): UsageView {
  const failure = describeFailure(error);
  const message = failureMessage(error);
  if (failure.keepLastSuccess && last) {
    const suffix = failure.label.replace(/^Cursor:\s*/, "");
    const pools = last.pools.map((pool, index) =>
      index === last.pools.length - 1 ? { ...pool, text: `${pool.text} · ${suffix}` } : pool,
    );
    return {
      pools,
      text: pools.map((pool) => pool.text).join(" · "),
      tooltip: message,
      level: last.level,
      output: [failure.label, message, last.output].join("\n"),
    };
  }
  return {
    pools: [{ key: "cursor", text: failure.label, level: "normal", color: null }],
    text: failure.label,
    tooltip: message,
    level: "normal",
    output: `${failure.label}\n${message}`,
  };
}
