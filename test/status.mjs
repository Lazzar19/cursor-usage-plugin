import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { AccessTokenNotFoundError, AuthReadError, StateDbNotFoundError } = require("../out/auth.js");
const { describeFailure, pollIntervalMs } = require("../out/status.js");
const { SessionExpiredError, UsageAbortedError, UsageResponseError, UsageUnavailableError } = require("../out/usage.js");

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${message}`);
  }
}

assert(pollIntervalMs(undefined) === 300_000, "default poll is 5 minutes");
assert(pollIntervalMs(60) === 60_000, "minimum poll is kept");
assert(pollIntervalMs(10) === 60_000, "poll below 60 seconds is raised");
assert(pollIntervalMs(120) === 120_000, "longer poll is kept");

const signIn = describeFailure(new StateDbNotFoundError("/tmp/missing.vscdb"));
assert(signIn.label === "Cursor: sign in", "missing database asks to sign in");
assert(signIn.keepLastSuccess === false, "missing database clears the last meter");
assert(describeFailure(new AccessTokenNotFoundError()).label === "Cursor: sign in", "missing token asks to sign in");

const expired = describeFailure(new SessionExpiredError());
assert(expired.label === "Cursor: session expired", "401 is session expired");
assert(expired.keepLastSuccess === false, "session expiry clears the last meter");

const network = describeFailure(new UsageUnavailableError("Cursor usage request timed out."));
assert(network.label === "Cursor: usage unavailable", "timeout is usage unavailable");
assert(network.keepLastSuccess === true, "timeout keeps the last meter");
assert(describeFailure(new UsageResponseError("bad shape")).keepLastSuccess === true, "bad payload keeps the last meter");
assert(describeFailure(new AuthReadError("locked")).keepLastSuccess === true, "locked database keeps the last meter");
assert(describeFailure(new UsageAbortedError()).keepLastSuccess === true, "cancelled refresh is not a sign-in error");

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("status: ok");
}
