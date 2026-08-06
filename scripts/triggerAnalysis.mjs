#!/usr/bin/env node
/**
 * Trigger an analytics run and print the result in a form worth reading.
 *
 * A convenience for the demo, not part of the product. The equivalent `curl` is
 * in `docs/demo.md` and is what a real caller would use; this exists because the
 * raw response is several hundred lines of JSON and the interesting parts —
 * which clusters were found, what patterns, how the scores compare — are the
 * hardest to see in it.
 *
 * Usage (emulators, seed data and the analytics service must all be running):
 *   npm run analyse            # dry run: computes everything, writes nothing
 *   npm run analyse -- --write # writes candidates and a job record
 *
 * `--write` is opt-in for the same reason `dry_run` defaults to true in the API:
 * a run writes to the moderation queue, and somebody exploring should not fill
 * it by accident.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const BASE_URL = process.env.ANALYTICS_SERVICE_URL ?? 'http://127.0.0.1:8000';

/**
 * The bearer token, from the environment or from the service's own `.env`.
 *
 * Read from the file as a fallback because the alternative is telling the
 * reader to export a variable that already exists three directories away, and a
 * demo step that fails on a 401 with no explanation is a demo step that gets
 * skipped.
 */
function resolveToken() {
  const fromEnv = process.env.ANALYSIS_API_TOKEN?.trim();
  if (fromEnv !== undefined && fromEnv.length > 0) {
    return fromEnv;
  }

  try {
    const envFile = readFileSync(resolve(repoRoot, 'services/analytics/.env'), 'utf8');
    const match = /^\s*ANALYSIS_API_TOKEN\s*=\s*(.+)$/m.exec(envFile);
    const value = match?.[1]?.trim().replace(/^["']|["']$/g, '');
    if (value !== undefined && value.length > 0) {
      return value;
    }
  } catch {
    // No .env file. Fall through to the message below.
  }

  return null;
}

function formatScore(components) {
  return Object.entries(components)
    .map(([name, value]) => `${name} ${Number(value).toFixed(2)}`)
    .join('  ');
}

async function main() {
  const write = process.argv.slice(2).includes('--write');
  const token = resolveToken();

  if (token === null) {
    process.stderr.write(
      'No ANALYSIS_API_TOKEN found.\n\n' +
        'The service refuses every request when no token is configured — it fails closed,\n' +
        'so an unconfigured deployment is inert rather than open. Create the service\n' +
        'configuration and restart it:\n\n' +
        '  cp services/analytics/.env.example services/analytics/.env\n',
    );
    process.exitCode = 1;
    return;
  }

  let response;
  try {
    response = await fetch(`${BASE_URL}/analyse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ dry_run: !write }),
    });
  } catch (error) {
    process.stderr.write(
      `Could not reach the analytics service at ${BASE_URL}.\n\n  npm run analytics\n\n${String(error)}\n`,
    );
    process.exitCode = 1;
    return;
  }

  if (!response.ok) {
    process.stderr.write(`${response.status} ${response.statusText}\n${await response.text()}\n`);
    process.exitCode = 1;
    return;
  }

  const result = await response.json();

  process.stdout.write(
    `\nJob ${result.job_id}   algorithm ${result.algorithm_version}   ` +
      `${result.dry_run ? 'DRY RUN — nothing written' : `wrote ${result.candidates_written} candidates`}\n\n` +
      `  reports ingested       ${result.reports_ingested}\n` +
      `  after cleaning         ${result.reports_after_cleaning} (${result.duplicates_removed} duplicates removed)\n` +
      `  clusters found         ${result.clusters_found}\n\n`,
  );

  for (const candidate of result.candidates) {
    process.stdout.write(
      `── ${candidate.category} · ${candidate.risk_level} · score ${candidate.severity_score}\n` +
        `   ${candidate.report_count} reports from ${candidate.distinct_reporters} people, ` +
        `radius ${Math.round(candidate.radius_m)} m\n` +
        `   ${formatScore(candidate.score_components)}\n`,
    );
    for (const pattern of candidate.patterns) {
      process.stdout.write(`   • ${pattern}\n`);
    }
    process.stdout.write('\n');
  }

  // Restated here as well as in the API response. This is the project's central
  // claim and the one a demo is most likely to leave a viewer confused about.
  process.stdout.write(
    'Candidates are proposals. They are not visible to app users, no client can read or\n' +
      'write them, and an administrator must review and publish each one.\n',
  );
}

await main();
