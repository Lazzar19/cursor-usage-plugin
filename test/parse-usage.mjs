import { createRequire } from "node:module";

const {
  parseCurrentPeriodUsage,
  fetchCurrentPeriodUsage,
  usagePercent,
  formatUsageDetails,
  UsageResponseError,
  SessionExpiredError,
  UsageUnavailableError,
  UsageAbortedError,
} = createRequire(import.meta.url)("../out/usage.js");

let failed = 0;

function assert(condition, message) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${message}`);
  }
}

const camel = parseCurrentPeriodUsage({
  billingCycleStart: "1768399334000",
  billingCycleEnd: "1771077734000",
  planUsage: {
    totalSpend: 23222,
    includedSpend: 23222,
    remaining: 16778,
    limit: 40000,
    totalPercentUsed: 15.48,
  },
  spendLimitUsage: {
    totalSpend: 0,
    individualLimit: 10000,
    individualUsed: 0,
    individualRemaining: 10000,
    limitType: "user",
  },
  displayMessage: "You've used 15% of your usage limit",
});

assert(camel.planUsage.totalPercentUsed === 15.48, "camelCase percent");
assert(camel.planUsage.includedSpendCents === 23222, "camelCase included spend");
assert(camel.billingCycleStartMs === 1768399334000, "cycle start from string millis");
assert(camel.spendLimitUsage?.limitType === "user", "spend limit type");
assert(camel.displayMessage?.includes("15%"), "display message");

const snake = parseCurrentPeriodUsage({
  billing_cycle_start: 10,
  billing_cycle_end: 20,
  plan_usage: {
    total_spend: 1,
    included_spend: 1,
    remaining: 2,
    limit: 3,
    total_percent_used: 0,
  },
});
assert(snake.planUsage.totalPercentUsed === 0, "explicit zero percent stays zero");
assert(snake.spendLimitUsage === null, "missing spend limit is null");

const liveShape = parseCurrentPeriodUsage({
  billingCycleStart: "1768399334000",
  billingCycleEnd: "1771077734000",
  planUsage: {
    totalSpend: 1000,
    includedSpend: 1000,
    limit: 4000,
    totalPercentUsed: 25,
  },
  spendLimitUsage: { limitType: "user" },
  displayMessage: "You've used 25% of your included usage",
});
assert(liveShape.planUsage.remainingCents === 3000, "remaining is limit minus included spend when omitted");
assert(liveShape.spendLimitUsage?.totalSpendCents === null, "on-demand spend stays empty when omitted");
assert(liveShape.spendLimitUsage?.limitType === "user", "limit type without spend amounts");

try {
  parseCurrentPeriodUsage({ displayMessage: "no plan" });
  assert(false, "missing planUsage should fail");
} catch (error) {
  assert(error instanceof UsageResponseError, "missing planUsage raises UsageResponseError");
  assert(error.message.includes("no planUsage"), "missing planUsage message");
}

try {
  parseCurrentPeriodUsage({
    planUsage: { totalSpend: 1, includedSpend: 1, remaining: 1, limit: 1 },
  });
  assert(false, "missing percent should fail");
} catch (error) {
  assert(error instanceof UsageResponseError, "missing percent raises UsageResponseError");
  assert(error.message.includes("totalPercentUsed"), "missing percent names the field");
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

try {
  await fetchCurrentPeriodUsage("token", {
    fetch: async () => jsonResponse(401, {}),
  });
  assert(false, "401 should fail");
} catch (error) {
  assert(error instanceof SessionExpiredError, "401 raises SessionExpiredError");
}

try {
  await fetchCurrentPeriodUsage("token", {
    fetch: async () => jsonResponse(500, {}),
  });
  assert(false, "500 should fail");
} catch (error) {
  assert(error instanceof UsageUnavailableError, "500 raises UsageUnavailableError");
}

try {
  await fetchCurrentPeriodUsage("token", {
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("bad json");
      },
    }),
  });
  assert(false, "bad json should fail");
} catch (error) {
  assert(error instanceof UsageResponseError, "bad json raises UsageResponseError");
}

try {
  await fetchCurrentPeriodUsage("token", {
    fetch: async () => {
      throw new TypeError("fetch failed");
    },
  });
  assert(false, "network failure should fail");
} catch (error) {
  assert(error instanceof UsageUnavailableError, "network failure raises UsageUnavailableError");
}

const fetched = await fetchCurrentPeriodUsage("token", {
  fetch: async (_url, init) => {
    assert(init.method === "POST", "usage request is POST");
    assert(init.headers.Authorization === "Bearer token", "usage request sends the bearer token");
    assert(init.headers["Connect-Protocol-Version"] === "1", "usage request sets connect protocol");
    return jsonResponse(200, {
      planUsage: {
        totalSpend: 5,
        includedSpend: 5,
        remaining: 5,
        limit: 10,
        totalPercentUsed: 50,
      },
    });
  },
});
assert(fetched.planUsage.totalPercentUsed === 50, "fetch maps a successful body");

const cancelled = new AbortController();
cancelled.abort();
try {
  await fetchCurrentPeriodUsage("token", {
    signal: cancelled.signal,
    fetch: async (_url, init) => {
      init.signal.throwIfAborted();
      return jsonResponse(200, {});
    },
  });
  assert(false, "aborted request should fail");
} catch (error) {
  assert(error instanceof UsageAbortedError, "aborted request raises UsageAbortedError");
}

const exhausted = {
  totalSpendCents: 5875,
  includedSpendCents: 2000,
  remainingCents: 0,
  limitCents: 2000,
  totalPercentUsed: 12.7,
};
assert(usagePercent(exhausted) === 100, "bar uses included spend against the limit");
assert(usagePercent({ ...exhausted, includedSpendCents: 1000, limitCents: 4000 }) === 25, "partial included spend");
assert(
  usagePercent({ ...exhausted, limitCents: 0, totalPercentUsed: 12.7 }) === 12.7,
  "falls back to totalPercentUsed when the limit is zero",
);

const details = formatUsageDetails({
  billingCycleStartMs: Date.parse("2026-10-11T00:00:00.000Z"),
  billingCycleEndMs: Date.parse("2026-11-11T00:00:00.000Z"),
  planUsage: exhausted,
  spendLimitUsage: { totalSpendCents: null, individualLimitCents: null, individualUsedCents: null, individualRemainingCents: null, limitType: "user" },
  displayMessage: "You've hit your usage limit",
});
assert(details.includes("You've hit your usage limit"), "details include the API message");
assert(details.includes("Included $20.00"), "details show included dollars");
assert(details.includes("Remaining $0.00"), "details show remaining dollars");
assert(details.includes("Limit $20.00"), "details show the limit in dollars");
assert(!details.includes("On-demand"), "details omit on-demand when spend is absent");
assert(details.includes("Cycle 2026-10-11 – 2026-11-11"), "details show the billing cycle");
assert(!details.includes("eyJ"), "details do not include a token");

if (failed > 0) {
  process.exitCode = 1;
} else {
  console.log("parse-usage: ok");
}
