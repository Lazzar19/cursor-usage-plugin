import { AccessTokenNotFoundError, StateDbNotFoundError } from "./auth";
import { SessionExpiredError } from "./usage";

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
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return "Could not read Cursor usage.";
}
