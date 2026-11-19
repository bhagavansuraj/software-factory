/**
 * require-observable-error-handling: the static half of ADR 0001.
 *
 * Every `catch` block, `.catch(handler)` and `.then(_, handler)` must make the failure
 * observable. It must do one of three things in its OWN body (not in a nested function it
 * defines):
 *
 *   1. rethrow           -> propagated: the root boundary owns it
 *   2. logger.error/warn -> recovered or translated: this call site owns it
 *   3. a comment `// expected-failure: <why>` inside the block
 *                        -> quiet on purpose, and the reason is written down where the next
 *                           reader (human or agent) will see it
 *
 * `console.*` doesn't count: it bypasses the closed logger. Passing a named handler
 * (`.catch(handleError)`) doesn't count either, because the rule can't see inside it. Write the
 * arrow inline, so a reviewer can.
 */

const MESSAGE =
  "Handle this failure by throwing, calling logger.error/logger.warn directly, or adding a local expected-failure justification.";

function unwrapChain(node) {
  return node?.type === "ChainExpression" ? node.expression : node;
}

function staticMemberName(member) {
  if (member.type !== "MemberExpression") return null;
  if (!member.computed && member.property.type === "Identifier") {
    return member.property.name;
  }
  if (
    member.computed &&
    member.property.type === "Literal" &&
    typeof member.property.value === "string"
  ) {
    return member.property.value;
  }
  return null;
}

function isApprovedLoggerCall(node) {
  if (node.type !== "CallExpression") return false;

  const callee = unwrapChain(node.callee);
  if (callee?.type !== "MemberExpression") return false;

  const method = staticMemberName(callee);
  return (
    (method === "error" || method === "warn") &&
    unwrapChain(callee.object)?.type === "Identifier" &&
    unwrapChain(callee.object).name === "logger"
  );
}

function isNestedBoundary(node) {
  return (
    node.type === "FunctionDeclaration" ||
    node.type === "FunctionExpression" ||
    node.type === "ArrowFunctionExpression" ||
    node.type === "ClassDeclaration" ||
    node.type === "ClassExpression"
  );
}

function walkOwnBody(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (isNestedBoundary(node)) return;

  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "parent" || key === "range" || key === "loc") continue;
    if (Array.isArray(value)) {
      for (const child of value) walkOwnBody(child, visitor);
    } else if (value && typeof value.type === "string") {
      walkOwnBody(value, visitor);
    }
  }
}

function nestedBoundaryRanges(block) {
  const ranges = [];

  function collect(node) {
    if (!node || typeof node !== "object") return;
    if (isNestedBoundary(node)) {
      if (node.range) ranges.push(node.range);
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "parent" || key === "range" || key === "loc") continue;
      if (Array.isArray(value)) {
        for (const child of value) collect(child);
      } else if (value && typeof value.type === "string") {
        collect(value);
      }
    }
  }

  collect(block);
  return ranges;
}

function hasLocalJustification(block, sourceCode) {
  if (block.type !== "BlockStatement" || !block.range) return false;
  const excluded = nestedBoundaryRanges(block);

  return sourceCode.getAllComments().some((comment) => {
    if (!comment.range) return false;
    const insideBlock =
      comment.range[0] > block.range[0] && comment.range[1] < block.range[1];
    const insideNestedBoundary = excluded.some(
      ([start, end]) => comment.range[0] >= start && comment.range[1] <= end,
    );
    return (
      insideBlock &&
      !insideNestedBoundary &&
      /expected-failure\s*:\s*\S/i.test(comment.value)
    );
  });
}

function isObservableBlock(block, sourceCode) {
  if (hasLocalJustification(block, sourceCode)) return true;

  let observable = false;
  walkOwnBody(block, (node) => {
    if (node.type === "ThrowStatement" || isApprovedLoggerCall(node)) {
      observable = true;
    }
  });
  return observable;
}

function isObservableHandler(handler, sourceCode) {
  if (
    handler?.type !== "ArrowFunctionExpression" &&
    handler?.type !== "FunctionExpression"
  ) {
    return false;
  }

  if (handler.body.type === "BlockStatement") {
    return isObservableBlock(handler.body, sourceCode);
  }

  return (
    handler.body.type === "CallExpression" && isApprovedLoggerCall(handler.body)
  );
}

function promiseMethodCall(node) {
  const callee = unwrapChain(node.callee);
  if (callee?.type !== "MemberExpression") return null;
  const method = staticMemberName(callee);
  return method === "catch" || method === "then" ? method : null;
}

const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "Require explicit handling of caught and rejected errors",
    },
    schema: [],
    messages: { unobservable: MESSAGE },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function report(node) {
      context.report({ node, messageId: "unobservable" });
    }

    return {
      CatchClause(node) {
        if (!isObservableBlock(node.body, sourceCode)) report(node);
      },

      CallExpression(node) {
        const method = promiseMethodCall(node);
        if (!method) return;

        const handler = method === "catch" ? node.arguments[0] : node.arguments[1];
        if (handler && !isObservableHandler(handler, sourceCode)) report(handler);
      },
    };
  },
};

export default rule;
