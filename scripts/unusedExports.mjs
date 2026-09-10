/**
 * Exported symbols no other file imports.
 *
 * A reporting aid, not a gate. See `reportUnusedExports.mjs` for why it is not
 * wired into `verify`.
 *
 * ## Why this is hand-rolled
 *
 * `eslint-plugin-import`'s `no-unused-modules` is the obvious tool and does not
 * work here: it is incompatible with ESLint 9's flat config and throws inside
 * the rule rather than reporting (import-js/eslint-plugin-import#3079). This is
 * a text-level approximation of the same question, which is enough for a
 * signal a human reads.
 *
 * It is **deliberately not** precise enough to gate on. It counts word
 * occurrences rather than resolving imports, so a symbol named the same as
 * something unrelated in another file reads as used. That direction is the safe
 * one for a report: it under-reports rather than accusing live code.
 */

/** `export const|let|var|function|class|interface|type|enum NAME`. */
const EXPORTED_DECLARATION =
  /export\s+(?:declare\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g;

/** Exported names declared in `source`. */
export function exportedNames(source) {
  return new Set([...source.matchAll(EXPORTED_DECLARATION)].map((match) => match[1]));
}

/**
 * Occurrences of `name` in `source`, as a whole identifier.
 *
 * Lookarounds rather than `\b`, because `$` is not a word character: `\b$ref`
 * demands a word boundary before the `$`, which a preceding space does not
 * provide, so every `$`-prefixed export counted zero and read as dead. The
 * project has few of those today, but a false "delete this" is the one kind of
 * error this report must not make.
 */
export function countOccurrences(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (source.match(new RegExp(`(?<![\\w$])${escaped}(?![\\w$])`, 'g')) ?? []).length;
}

/**
 * Exports in `files` that no *other* file mentions.
 *
 * `selfUses` distinguishes the two shapes this finds, which want opposite fixes:
 *
 *   - `selfUses === 1` — the declaration and nothing else. Dead; delete it.
 *   - `selfUses > 1` — used inside its own module but exported anyway. Live
 *     code with too wide a door; drop the `export` keyword.
 *
 * @param {Map<string, string>} files Path → contents. Include tests, so a symbol
 *   only a test uses is not reported as dead.
 * @param {(path: string) => boolean} [isDeclarer] Which files to read exports
 *   from. Defaults to all of them.
 * @returns {{ file: string, name: string, selfUses: number }[]}
 */
export function findUnusedExports(files, isDeclarer = () => true) {
  const findings = [];

  for (const [file, source] of files) {
    if (!isDeclarer(file)) {
      continue;
    }

    for (const name of exportedNames(source)) {
      let elsewhere = 0;

      for (const [other, otherSource] of files) {
        if (other !== file) {
          elsewhere += countOccurrences(otherSource, name);
        }
      }

      if (elsewhere === 0) {
        findings.push({ file, name, selfUses: countOccurrences(source, name) });
      }
    }
  }

  return findings.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}
