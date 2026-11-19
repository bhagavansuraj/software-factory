import { RuleTester, type Rule } from "eslint";
import { describe, it } from "vitest";
import rule from "../require-observable-error-handling.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
  },
});

const error = { messageId: "unobservable" as const };

tester.run("require-observable-error-handling", rule as unknown as Rule.RuleModule, {
  valid: [
    "try { work(); } catch (error) { throw error; }",
    "try { work(); } catch (error) { logger.error({ operation: 'request.unhandled' }); }",
    "try { work(); } catch { logger.warn({ operation: 'email.delivery_skipped' }); }",
    "function parse() { try { work(); } catch { /* expected-failure: malformed client input maps to 4xx */ return null; } }",
    "function parse() { try { work(); } catch { // expected-failure: invalid untrusted session material\n return null; } }",
    "promise.catch((error) => { throw error; });",
    "promise.catch(() => logger.error({ operation: 'email.delivery_failed' }));",
    "promise.catch(() => { logger.warn({ operation: 'email.delivery_failed' }); });",
    "promise.catch(() => { /* expected-failure: optional cache miss */ return null; });",
    "promise.then(onValue, (error) => { throw error; });",
    "promise.then(onValue, () => logger.warn({ operation: 'email.delivery_failed' }));",
    "promise['catch'](() => { logger.warn({ operation: 'email.delivery_failed' }); });",
    "promise['then'](onValue, () => { throw new Error('translated'); });",
    "promise?.catch?.(() => logger.error({ operation: 'email.delivery_failed' }));",
    "promise?.['then']?.(onValue, () => logger.warn({ operation: 'email.delivery_failed' }));",
  ],
  invalid: [
    { code: "try { work(); } catch {}", errors: [error] },
    {
      code: "function parse() { try { work(); } catch { return null; } }",
      errors: [error],
    },
    { code: "try { work(); } catch { failed = true; }", errors: [error] },
    { code: "try { work(); } catch (error) { console.error(error); }", errors: [error] },
    { code: "promise.catch(() => null);", errors: [error] },
    { code: "promise.catch(() => { return null; });", errors: [error] },
    { code: "promise.then(onValue, () => null);", errors: [error] },
    { code: "promise.catch(handleError);", errors: [error] },
    { code: "promise.then(onValue, handleError);", errors: [error] },
    {
      code: "promise.catch(condition ? handleOne : handleTwo);",
      errors: [error],
    },
    {
      code: "try { work(); } catch { function later() { throw new Error('hidden'); } later(); }",
      errors: [error],
    },
    {
      code: "try { work(); } catch { const later = () => logger.error({ operation: 'hidden' }); later(); }",
      errors: [error],
    },
    {
      code: "try { work(); } catch { class Later { run() { throw new Error('hidden'); } } new Later(); }",
      errors: [error],
    },
    {
      code: "function parse() { try { work(); } catch { const text = 'expected-failure: not a comment'; return null; } }",
      errors: [error],
    },
    {
      code: "function parse() { /* expected-failure: outside */ try { work(); } catch { return null; } }",
      errors: [error],
    },
    {
      code: "function parse() { try { work(); } catch { /* expected-failure: */ return null; } }",
      errors: [error],
    },
    {
      code: "try { work(); } catch { const later = () => { /* expected-failure: nested */ return null; }; later(); }",
      errors: [error],
    },
    {
      code: "promise.catch(() => null /* expected-failure: expression body */);",
      errors: [error],
    },
    { code: "promise['catch'](() => null);", errors: [error] },
    { code: "promise['then'](onValue, () => null);", errors: [error] },
    { code: "promise?.catch?.(() => null);", errors: [error] },
    { code: "promise?.['then']?.(onValue, () => null);", errors: [error] },
    {
      code: "promise.catch(() => { const nested = () => { throw new Error('hidden'); }; nested(); });",
      errors: [error],
    },
    {
      code: "promise.then(onValue, () => { console.warn('raw'); });",
      errors: [error],
    },
  ],
});
