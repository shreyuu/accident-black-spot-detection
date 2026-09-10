/**
 * Find Firestore collection names written as string literals.
 *
 * `COLLECTIONS` in `packages/shared-types` calls itself the single source of
 * truth for collection paths "across both apps and the rules", and
 * `firebase/tests/coverage.test.mjs` holds `COLLECTIONS` and `firestore.rules`
 * to each other. Neither of those notices a *third* copy of the name — and the
 * mobile app had seven of them, one per repository module, none importing
 * `COLLECTIONS` at all.
 *
 * That gap is the dangerous one. Mobile is the only deployable the security
 * rules actually constrain, so a rename that updates `COLLECTIONS` and the rules
 * together passes the parity test, ships, and leaves the client reading and
 * writing a path the rules no longer mention — where the catch-all denies it.
 * The symptom is a PERMISSION_DENIED with nothing to say which rule was missing,
 * which is precisely the quiet failure the parity test was written to end.
 *
 * Logic lives here rather than in the runner so it can be unit-tested against
 * fixture strings instead of this repository's real files.
 */

/**
 * Blank out line and block comments, so prose naming a collection is not a
 * finding.
 *
 * These files carry long rationale comments that mention collection names
 * constantly — `// writes to 'alertLogs'` is documentation, not a second source
 * of truth. Only code can drift.
 *
 * A block comment is replaced by *its own newlines* rather than removed, so
 * every later line keeps its number. Deleting them outright shifts the reported
 * line for each finding by the length of every comment above it, which in these
 * files is tens of lines — a report that points at the wrong place is worse than
 * no report, because the reader concludes the check is broken and turns it off.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Positions where a bare string is genuinely a Firestore path.
 *
 * ## Why this is not simply "any string equal to a collection name"
 *
 * That was the first version, and it was wrong in a way worth recording. Three
 * other things in this app spell a collection name without being one:
 *
 *   - **React Query cache keys** — `queryKey: ['blackSpots', 'nearby', key]`.
 *     A client-local cache identifier. Renaming the Firestore collection does
 *     not require renaming the key, and coupling them would make a server-side
 *     rename silently invalidate every installed client's cache.
 *   - **The Cloud Storage prefix** — `REPORT_IMAGES_PREFIX = 'incidentReports'`,
 *     governed by `storage.rules`, not `firestore.rules`. A different namespace
 *     that happens to share a spelling.
 *   - **User-facing copy** naming a concept rather than a path.
 *
 * Flagging those would have made the check noise, and a noisy gate gets
 * suppressed rather than fixed. So the match is on *position*: a literal handed
 * to the Firestore SDK, or assigned to a constant whose name claims to be a
 * collection. Those are the only places where the value must track `COLLECTIONS`.
 */
/** `export const X_COLLECTION = 'x'` — a constant claiming to be a collection. */
const COLLECTION_CONSTANT = /\b[A-Z0-9_]*COLLECTIONS?\s*(?::[^=]+)?=\s*(['"])([^'"]+)\1/g;

/** `collection(` · `collectionGroup(` · `doc(` — the SDK's path-taking calls. */
const FIRESTORE_CALL = /\b(?:collection|collectionGroup|doc)\s*\(/g;

/**
 * A string literal sitting in argument position.
 *
 * `argumentList` returns the text *between* the parentheses, so the last
 * argument is followed by end-of-string rather than `)` — which is where the
 * collection name usually sits. Both endings have to count.
 */
const LITERAL_ARGUMENT = /(?:^|[(,])\s*(['"])([^'"]+)\1\s*(?=[,)]|$)/g;

/**
 * The text between a call's parentheses, honouring nesting.
 *
 * A regex cannot do this: real call sites read
 * `collection(getFirebaseFirestore(), 'alertLogs')`, and any pattern that stops
 * at the first `)` stops inside the nested call and never sees the argument that
 * matters. That is not a hypothetical — it is how every collection reference in
 * this app is actually written.
 *
 * @returns {string} The argument list, or '' if the parentheses never close.
 */
function argumentList(source, openIndex) {
  let depth = 0;

  for (let i = openIndex; i < source.length; i += 1) {
    const character = source[i];

    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openIndex + 1, i);
      }
    }
  }

  return '';
}

/**
 * Every collection name written as a literal in a Firestore path position.
 *
 * Exact match only. `'users/{id}'` is not flagged: it is not a reference the
 * SDK accepts on its own, and substring matching would flag every URL and every
 * piece of copy containing the word.
 *
 * @param {string} source           File contents.
 * @param {readonly string[]} names Collection names from `COLLECTIONS`.
 * @returns {{ line: number, name: string }[]} Findings, in file order.
 */
export function findCollectionLiterals(source, names) {
  const wanted = new Set(names);
  const code = stripComments(source);
  const findings = [];
  const lineOf = (index) => code.slice(0, index).split('\n').length;

  for (const match of code.matchAll(COLLECTION_CONSTANT)) {
    if (wanted.has(match[2])) {
      findings.push({ line: lineOf(match.index), name: match[2] });
    }
  }

  for (const call of code.matchAll(FIRESTORE_CALL)) {
    const openIndex = call.index + call[0].length - 1;
    const args = argumentList(code, openIndex);

    for (const argument of args.matchAll(LITERAL_ARGUMENT)) {
      if (wanted.has(argument[2])) {
        findings.push({ line: lineOf(openIndex + 1 + argument.index), name: argument[2] });
      }
    }
  }

  return findings.sort((a, b) => a.line - b.line || a.name.localeCompare(b.name));
}
