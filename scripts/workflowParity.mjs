/**
 * Does CI still run everything `npm run verify` runs?
 *
 * `verify` is the command a developer trusts before pushing; the CI job is what
 * decides whether a pull request is mergeable. They are written in two files, in
 * two languages, and there is nothing in either that notices when they diverge —
 * so adding a check to `verify` and forgetting the workflow produces a pipeline
 * that is quietly weaker than the local gate, and nobody finds out until
 * something it would have caught reaches main.
 *
 * The direction of the check matters. CI must be a **superset**: every script in
 * `verify` has to appear in the workflow. The reverse is deliberately allowed —
 * CI legitimately runs things a developer should not have to (a Next production
 * build, four emulators, a Python toolchain).
 *
 * Detection lives here, separate from the script that runs it, so it can be
 * unit-tested against fixtures rather than against the repository's real files.
 */

/**
 * Extracts the npm scripts a `&&`-chained composite script delegates to.
 *
 * Text matching rather than a shell parser, because the input is a package.json
 * script we control and the alternative is a dependency. `npm run x -- --flag`
 * and `npm run x --workspace y` both yield `x`.
 *
 * @param {string} script The composite script body, e.g. `npm run a && npm run b`.
 * @returns {string[]} Script names in order of first appearance, deduplicated.
 */
export function referencedScripts(script) {
  const names = [];
  // `npm run <name>` where <name> is the usual script-name shape. The negative
  // lookahead on `--` keeps a flag from being mistaken for a script name.
  const pattern = /\bnpm\s+run\s+(?!-)([\w:.-]+)/g;

  for (const match of script.matchAll(pattern)) {
    const name = match[1];
    if (name !== undefined && !names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}

/**
 * Script names the workflow invokes anywhere in its text.
 *
 * The workflow is read as text, not parsed as YAML, on purpose: a YAML parser is
 * a dependency, and every form a step can take — `run:`, a block scalar, a
 * matrix — still contains the literal characters `npm run <name>`. The cost is
 * that a script named inside a comment counts as covered; the comments in
 * `.github/workflows/ci.yml` name scripts freely, so this is checked against the
 * `run:` lines only.
 *
 * @param {string} workflowYaml Raw contents of the workflow file.
 * @returns {string[]} Script names, deduplicated.
 */
export function workflowScripts(workflowYaml) {
  const executable = workflowYaml
    .split('\n')
    // Drop whole-line comments. An inline `#` after a command is not stripped:
    // it would be part of a shell command, not a YAML comment.
    .filter((line) => !/^\s*#/.test(line))
    .join('\n');

  return referencedScripts(executable);
}

/**
 * @param {string} verifyScript The `verify` script body from package.json.
 * @param {string} workflowYaml Raw contents of the CI workflow.
 * @returns {string[]} Scripts `verify` runs that the workflow does not. Empty when in sync.
 */
export function missingFromWorkflow(verifyScript, workflowYaml) {
  const covered = new Set(workflowScripts(workflowYaml));
  return referencedScripts(verifyScript).filter((name) => !covered.has(name));
}
