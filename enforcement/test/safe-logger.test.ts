import { describe, it, expect } from "vitest";
import {
  createLogger, logUnhandled, markErrorLogged, redactDiagnostic, resolveRequestId, safeErrorName,
  wasErrorLogged, type LogEvent, type LogSink,
} from "../safe-logger";

const OPERATIONS = ["request.unhandled", "email.send_failed", "email.send_retrying"] as const;
type Op = (typeof OPERATIONS)[number];

function capture() {
  const events: LogEvent<string>[] = [];
  const push = (event: LogEvent<string>) => { events.push(event); };
  const sink: LogSink = { error: push, warn: push, info: push };
  return { events, logger: createLogger<Op>({ operations: OPERATIONS, sink, now: () => new Date(0) }) };
}

// Opaque, secret-shaped values: an allow-list has to be tested against these, not against
// values a human would recognise as secrets.
const HOSTILE = [
  "sk-live-51H8ZfakeSECRETvalue0000000000000000",
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJlLWlzLWhlcmU",
  "jane.doe@example.com",
  "https://api.example.com/reset?token=abc123",
];

describe("closed fields", () => {
  it("emits a versioned event with only allow-listed fields", () => {
    const { events, logger } = capture();
    logger.warn({ operation: "email.send_retrying", attempt: { number: 1, total: 3 }, status: 429 });
    expect(events).toEqual([{
      schemaVersion: 1, timestamp: "1970-01-01T00:00:00.000Z", severity: "warn",
      operation: "email.send_retrying", requestId: logger.requestId,
      attempt: { number: 1, total: 3 }, status: 429,
    }]);
  });

  it("drops an undeclared operation rather than emitting free text", () => {
    const { events, logger } = capture();
    logger.error({ operation: "Error: user jane@example.com not found" as Op });
    expect(events).toEqual([]);
  });

  it("drops unknown keys smuggled past the type system", () => {
    const { events, logger } = capture();
    logger.error({ operation: "email.send_failed", body: "secret", message: "secret" } as never);
    expect(JSON.stringify(events)).not.toContain("secret");
  });

  it("drops raw URLs with query strings, invalid attempts and negative numbers", () => {
    const { events, logger } = capture();
    logger.error({
      operation: "email.send_failed", route: "/reset?token=abc",
      attempt: { number: 4, total: 3 }, durationMs: -1, count: 1.5,
    });
    expect(events[0]).not.toHaveProperty("route");
    expect(events[0]).not.toHaveProperty("attempt");
    expect(events[0]).not.toHaveProperty("durationMs");
    expect(events[0]).not.toHaveProperty("count");
  });

  it.each(HOSTILE)("never emits a hostile value through a validated string field: %s", (value) => {
    const { events, logger } = capture();
    logger.error({
      operation: "email.send_failed", method: value, errorName: value, route: `/x?${value}`,
      diagnostic: `upstream said: ${value}`,
    });
    expect(JSON.stringify(events)).not.toContain(value);
  });

  it("rejects entity ids that are visibly not opaque ids", () => {
    // entity.id is caller-trusted (see LogInput); shape checks catch only the obvious leaks.
    const { events, logger } = capture();
    for (const id of ["jane.doe@example.com", "https://x.io/a", "two words"]) {
      logger.error({ operation: "email.send_failed", entity: { kind: "user", id } });
    }
    expect(events.every((event) => event.entity === undefined)).toBe(true);
  });

  it("never throws, even when the sink does", () => {
    const sink = { error: () => { throw new Error("sink down"); } } as unknown as LogSink;
    const logger = createLogger<Op>({ operations: OPERATIONS, sink });
    expect(() => logger.error({ operation: "email.send_failed" })).not.toThrow();
  });
});

describe("helpers", () => {
  it("accepts only a well-formed UUID as a client correlation id", () => {
    const uuid = "123e4567-e89b-42d3-a456-426614174000";
    expect(resolveRequestId(uuid)).toBe(uuid);
    expect(resolveRequestId("<script>", () => "fresh")).toBe("fresh");
    expect(resolveRequestId(undefined, () => "fresh")).toBe("fresh");
  });

  it("reduces an error to its class name, never its message", () => {
    expect(safeErrorName(new TypeError("password=hunter2"))).toBe("TypeError");
    const weird = new Error("x");
    weird.name = "Error: with spaces and jane@example.com";
    expect(safeErrorName(weird)).toBeUndefined();
    expect(safeErrorName("a string")).toBeUndefined();
    const hostile = new Proxy(new Error("x"), { get() { throw new Error("trap"); } });
    expect(safeErrorName(hostile)).toBeUndefined();
  });

  it("redacts and bounds diagnostics", () => {
    const out = redactDiagnostic(`fail api_key=abc123 for a@b.co at https://x.io/y ${"z".repeat(500)}`);
    expect(out).not.toContain("abc123");
    expect(out).not.toContain("a@b.co");
    expect(out).not.toContain("https://");
    expect(out.length).toBeLessThanOrEqual(256);
  });
});

describe("exactly-one ownership", () => {
  it("the root boundary logs an unowned error once", () => {
    const { events, logger } = capture();
    logUnhandled(logger, new RangeError("boom"), "request.unhandled", { method: "GET", route: "/api/items/:id" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ operation: "request.unhandled", status: 500, errorName: "RangeError", route: "/api/items/:id" });
  });

  it("the root boundary stays quiet for an error a call site already logged", () => {
    const { events, logger } = capture();
    const error = new Error("send failed");
    logger.error({ operation: "email.send_failed", errorName: safeErrorName(error) });
    logUnhandled(logger, markErrorLogged(error), "request.unhandled", {});
    expect(events.map((e) => e.operation)).toEqual(["email.send_failed"]);
  });

  it("wraps a frozen error so ownership is still recorded", () => {
    const frozen = Object.freeze(new Error("x"));
    const marked = markErrorLogged(frozen);
    expect(wasErrorLogged(marked)).toBe(true);
  });
});
