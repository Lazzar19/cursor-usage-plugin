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

export interface UsageView {
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
  const percent = usagePercent(usage.planUsage);
  const bar = renderBar(percent, { segments, fillGlyph: "▓", emptyGlyph: "░" });
  const details = formatUsageDetails(usage);
  return {
    text: `$(pulse) Cursor ${bar} ${formatPercent(percent)}`,
    tooltip: details,
    level: meterLevel(percent, warningPercent, criticalPercent),
    output: details,
  };
}

export function presentSpin(usage: CurrentPeriodUsage | undefined, segments: number): string {
  if (!usage) {
    return "$(sync~spin) Cursor";
  }
  const percent = usagePercent(usage.planUsage);
  const bar = renderBar(percent, { segments, fillGlyph: "▓", emptyGlyph: "░" });
  return `$(sync~spin) Cursor ${bar} ${formatPercent(percent)}`;
}

export function presentFailure(error: unknown, last: UsageView | undefined): UsageView {
  const failure = describeFailure(error);
  const message = failureMessage(error);
  if (failure.keepLastSuccess && last) {
    const suffix = failure.label.replace(/^Cursor:\s*/, "");
    return {
      text: `${last.text} · ${suffix}`,
      tooltip: message,
      level: last.level,
      output: [failure.label, message, last.output].join("\n"),
    };
  }
  return {
    text: failure.label,
    tooltip: message,
    level: "normal",
    output: `${failure.label}\n${message}`,
  };
}
