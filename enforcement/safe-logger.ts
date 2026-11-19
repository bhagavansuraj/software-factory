// A closed, structured logger: the runtime half of ADR 0001. (The lint rule beside it is the
// static half.)
//
// "Closed" means a caller can't log arbitrary data:
//   - `operation` must be one of YOUR declared operation names (a type parameter);
//   - every other field is allow-listed, and validated or bounded before it's emitted;
//   - an error is reduced to its class name, never its message or stack;
//   - anything that fails validation is DROPPED, not escaped, so the event still emits.
//
// Framework-agnostic: it needs a sink (console by default) and nothing else. Adapt the field
// list to your domain, but add fields here, never at call sites.

const REQUEST_ID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export const SAFE_TOKEN_RE = /^[A-Za-z0-9_.-]{1,96}$/;
// A JS class name: an identifier, no `-` or `.`. Allowing those would let a JWT or an
// `sk-live-…` key pass as an "error name"; the hostile-value tests check for exactly that.
export const SAFE_ERROR_NAME_RE = /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/;
const HTTP_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const SAFE_ENTITY_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_ROUTE_CHARS = 256;
const MAX_DIAGNOSTIC_CHARS = 256;
const LOGGED_ERROR = Symbol.for("safe-logger.logged-error");

export type Severity = "error" | "warn" | "info";

export type LogInput<Op extends string> = {
  operation: Op;
  /** A route PATTERN (`/api/items/:id`), never a raw URL: raw URLs carry ids, tokens and emails. */
  route?: string;
  method?: string;
  status?: number;
  errorName?: string;
  durationMs?: number;
  count?: number;
  /** For retries: attempt N of total. Warn while retrying; one error on exhaustion. */
  attempt?: { number: number; total: number };
  /**
   * An opaque internal id: never an email, name, or anything a user typed. The ONE field that
   * trusts its caller: a random secret and a random id look the same, so shape validation can
   * only reject the obvious cases (emails, spaces, URLs). Only pass ids your own code minted.
   */
  entity?: { kind: string; id: string };
  /** Upstream provider diagnostic text. Always passed through redactDiagnostic(). */
  diagnostic?: string;
};

export type LogEvent<Op extends string> = Omit<LogInput<Op>, "operation"> & {
  schemaVersion: 1;
  timestamp: string;
  severity: Severity;
  operation: Op;
  requestId: string;
};

export type LogSink = Record<Severity, (event: LogEvent<string>) => void>;

export type SafeLogger<Op extends string> = {
  readonly requestId: string;
  error(input: LogInput<Op>): void;
  warn(input: LogInput<Op>): void;
  info(input: LogInput<Op>): void;
};

const consoleSink: LogSink = {
  // Structured objects, not strings: Workers Logs / most sinks index object fields.
  error: (event) => console.error(event),
  warn: (event) => console.warn(event),
  info: (event) => console.info(event),
};

/** Accept a client-supplied correlation id only if it's a well-formed UUID; otherwise mint one. */
export function resolveRequestId(
  incoming: string | null | undefined, create: () => string = () => crypto.randomUUID(),
): string {
  return typeof incoming === "string" && REQUEST_ID_RE.test(incoming) ? incoming : create();
}

/** An error's class name if it's a safe token. Never the message, never the stack. */
export function safeErrorName(error: unknown): string | undefined {
  try {
    if (!(error instanceof Error)) return undefined;
    return SAFE_ERROR_NAME_RE.test(error.name) ? error.name : undefined;
  } catch {
    // expected-failure: hostile error objects (throwing getters, proxies) must not break logging
    return undefined;
  }
}

/** Last-pass net for free text from upstream providers: URLs, emails, bearer tokens, key=value secrets, long opaque tokens. */
export function redactDiagnostic(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[redacted-email]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(
      /\b(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|cookie|session|secret|password|token)\b\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    )
    // JWTs: each dot-separated segment can be under 40 chars, so the long-token rule below misses them.
    .replace(/\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, "[redacted-jwt]")
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted-token]")
    .slice(0, MAX_DIAGNOSTIC_CHARS);
}

const isCount = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;

function buildEvent<Op extends string>(
  operations: ReadonlySet<string>, severity: Severity, requestId: string, input: LogInput<Op>, now: () => Date,
): LogEvent<Op> | null {
  // An undeclared operation is a programming error; dropping it is safer than emitting free text.
  if (!operations.has(input.operation)) return null;
  const event: LogEvent<Op> = {
    schemaVersion: 1, timestamp: now().toISOString(), severity, operation: input.operation, requestId,
  };
  if (input.method && HTTP_METHODS.has(input.method)) event.method = input.method;
  if (input.route && input.route.length <= MAX_ROUTE_CHARS && !input.route.includes("?")) event.route = input.route;
  if (Number.isInteger(input.status)) event.status = input.status;
  if (input.errorName && SAFE_ERROR_NAME_RE.test(input.errorName)) event.errorName = input.errorName;
  if (isCount(input.durationMs)) event.durationMs = input.durationMs;
  if (isCount(input.count)) event.count = input.count;
  const a = input.attempt;
  if (a && Number.isInteger(a.number) && Number.isInteger(a.total) && a.number > 0 && a.total >= a.number) {
    event.attempt = { number: a.number, total: a.total };
  }
  const e = input.entity;
  if (e && SAFE_TOKEN_RE.test(e.kind) && SAFE_ENTITY_ID_RE.test(e.id)) event.entity = { kind: e.kind, id: e.id };
  if (typeof input.diagnostic === "string") event.diagnostic = redactDiagnostic(input.diagnostic);
  return event;
}

export function createLogger<Op extends string>(opts: {
  operations: readonly Op[];
  requestId?: string | null;
  sink?: LogSink;
  now?: () => Date;
}): SafeLogger<Op> {
  const operations = new Set<string>(opts.operations);
  const requestId = resolveRequestId(opts.requestId);
  const sink = opts.sink ?? consoleSink;
  const now = opts.now ?? (() => new Date());
  const emit = (severity: Severity, input: LogInput<Op>) => {
    try {
      const event = buildEvent(operations, severity, requestId, input, now);
      if (event) sink[severity](event);
    } catch {
      // expected-failure: logging must never change request behavior
    }
  };
  return {
    requestId,
    error: (input) => emit("error", input),
    warn: (input) => emit("warn", input),
    info: (input) => emit("info", input),
  };
}

// --- Exactly-one ownership ----------------------------------------------------------------
//
// A call site that logs a failure and then rethrows (to abort the request) marks the error, so
// the root boundary doesn't log it a second time.

export function markErrorLogged(error: unknown): Error {
  const result = error instanceof Error ? error : new Error("logged_operation_failed");
  try {
    Object.defineProperty(result, LOGGED_ERROR, { value: true });
    return result;
  } catch {
    // expected-failure: a frozen error is wrapped so ownership stays explicit
    const wrapped = new Error("logged_operation_failed");
    Object.defineProperty(wrapped, LOGGED_ERROR, { value: true });
    return wrapped;
  }
}

export function wasErrorLogged(error: unknown): boolean {
  try {
    return error instanceof Error && Boolean((error as unknown as Record<symbol, unknown>)[LOGGED_ERROR]);
  } catch {
    // expected-failure: hostile errors are treated as not yet logged
    return false;
  }
}

/**
 * The root boundary: call it from your framework's top-level error handler (Hono's
 * `app.onError`, Express's error middleware, …). It logs the one terminal event unless a call
 * site already owns this error.
 */
export function logUnhandled<Op extends string>(
  logger: SafeLogger<Op>, error: unknown, operation: Op, request: { method?: string; route?: string },
): void {
  if (wasErrorLogged(error)) return;
  logger.error({ operation, method: request.method, route: request.route, status: 500, errorName: safeErrorName(error) });
}
