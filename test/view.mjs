import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { StateDbNotFoundError } = require("../out/auth.js");
const { meterLevel, presentFailure, presentUsage } = require("../out/status.js");
const { UsageUnavailableError } = require("../out/usage.js");

const TOKEN = "secret-session-token";

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${message}`);
  }
}

function assertNoSecret(text, message) {
  assert(!text.includes(TOKEN), message);
  assert(!/authorization:\s*bearer/i.test(text), `${message} (authorization header)`);
  assert(!text.includes("\n    at "), `${message} (stack trace)`);
}

const usage = {
  billingCycleStartMs: Date.parse("2026-10-11T00:00:00.000Z"),
  billingCycleEndMs: Date.parse("2026-11-11T00:00:00.000Z"),
  planUsage: {
    totalSpendCents: 5875,
    includedSpendCents: 2000,
    remainingCents: 0,
    limitCents: 2000,
    totalPercentUsed: 12.7,
  },
  spendLimitUsage: null,
  displayMessage: "You've hit your usage limit",
};

const view = presentUsage(usage, 8, 80, 95);
assert(view.text === "$(pulse) Cursor ▓▓▓▓▓▓▓▓ 100%", "meter shows a full bar and 100%");
assert(view.level === "critical", "100% is critical at the default 95% threshold");
assert(view.tooltip.includes("Included $20.00"), "hover shows included dollars");
assert(view.tooltip.includes("Remaining $0.00"), "hover shows remaining dollars");
assert(view.tooltip.includes("Limit $20.00"), "hover shows the limit");
assert(view.tooltip.includes("Cycle 2026-10-11 – 2026-11-11"), "hover shows the billing cycle");
assert(view.tooltip === view.output, "details output matches the hover text");
assertNoSecret(view.output, "success output hides the session");

assert(meterLevel(50, 80, 95) === "normal", "50% stays normal at the default thresholds");
assert(meterLevel(50, 40, 95) === "warning", "lowering the warning threshold below 50% warns");
assert(meterLevel(50, 40, 45) === "critical", "lowering the critical threshold below 50% turns critical");

const missing = presentFailure(new StateDbNotFoundError("/tmp/missing-state.vscdb"), view);
assert(missing.text === "Cursor: sign in", "a missing database replaces the meter with sign in");
assert(missing.level === "normal", "sign in clears the warning background");
assert(missing.output.startsWith("Cursor: sign in\n"), "sign in output starts with the short status");
assert(missing.output.includes("/tmp/missing-state.vscdb"), "sign in output includes the database path");
assert(!missing.output.includes("100%"), "sign in output drops the previous meter");
assertNoSecret(missing.output, "sign in output hides the session");

const stack = new Error("Could not read the Cursor state database.\n    at readAccessToken (auth.ts:1:1)");
const stacked = presentFailure(stack, undefined);
assert(!stacked.output.includes("at readAccessToken"), "output drops a stack trace");

const leaked = presentFailure(new Error(`Authorization: Bearer ${TOKEN}`), undefined);
assertNoSecret(leaked.output, "output drops a bearer token");

const halfway = presentUsage(
  {
    ...usage,
    planUsage: { ...usage.planUsage, includedSpendCents: 1000, remainingCents: 1000, limitCents: 2000 },
    displayMessage: "You've used 50% of your usage limit",
  },
  8,
  80,
  95,
);
const unavailable = presentFailure(new UsageUnavailableError("Cursor usage request timed out."), halfway);
assert(unavailable.text.includes("50%"), "a network error keeps the last percent");
assert(unavailable.text.endsWith("· usage unavailable"), "a network error adds the short status");
assert(unavailable.level === "normal", "the kept meter stays at its previous level");
assert(unavailable.output.includes("Cursor usage request timed out."), "output includes the longer error");
assert(unavailable.output.includes("Included $10.00"), "output keeps the last dollar amounts");
assertNoSecret(unavailable.output, "network error output hides the session");

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("view: ok");
}
