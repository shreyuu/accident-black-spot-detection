import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { countOccurrences, exportedNames, findUnusedExports } from '../unusedExports.mjs';

describe('exportedNames', () => {
  it('reads every exported declaration kind', () => {
    const source = [
      'export const a = 1;',
      'export let b = 2;',
      'export var c = 3;',
      'export function d() {}',
      'export async function e() {}',
      'export class F {}',
      'export interface G {}',
      'export type H = string;',
      'export enum I {}',
    ].join('\n');

    assert.deepEqual([...exportedNames(source)], ['a', 'b', 'c', 'd', 'e', 'F', 'G', 'H', 'I']);
  });

  it('ignores a declaration that is not exported', () => {
    assert.deepEqual([...exportedNames('const internal = 1;')], []);
  });

  it('handles a $-prefixed name', () => {
    assert.deepEqual([...exportedNames('export const $ref = 1;')], ['$ref']);
  });
});

describe('countOccurrences', () => {
  it('counts whole words only', () => {
    assert.equal(countOccurrences('user users userId user', 'user'), 2);
  });

  /**
   * Regression: `\b` was used for the boundary, and `$` is not a word
   * character — so `\b$ref` never matched and every `$`-prefixed export read as
   * dead. A false "delete this" is the one error this report must not make.
   */
  it('counts a $-prefixed name, which a \\b boundary misses', () => {
    assert.equal(countOccurrences('const $ref = $ref + 1;', '$ref'), 2);
  });

  it('does not match a name embedded in a longer identifier', () => {
    assert.equal(countOccurrences('$ref $refExtra prefix$ref', '$ref'), 1);
  });
});

describe('findUnusedExports', () => {
  it('reports an export nothing else mentions', () => {
    const files = new Map([
      ['a.ts', 'export const alpha = 1;'],
      ['b.ts', 'const unrelated = 2;'],
    ]);

    assert.deepEqual(findUnusedExports(files), [{ file: 'a.ts', name: 'alpha', selfUses: 1 }]);
  });

  it('says nothing about an export another file imports', () => {
    const files = new Map([
      ['a.ts', 'export const alpha = 1;'],
      ['b.ts', "import { alpha } from './a';"],
    ]);

    assert.deepEqual(findUnusedExports(files), []);
  });

  /**
   * The distinction the report turns on: `selfUses === 1` is a declaration and
   * nothing else, so delete it; anything higher is live code behind too wide a
   * door, so drop only the `export`.
   */
  it('separates dead from merely over-exported by selfUses', () => {
    const files = new Map([
      ['dead.ts', 'export const gone = 1;'],
      ['wide.ts', 'export const helper = () => 1;\nconst x = helper();\n'],
    ]);

    assert.deepEqual(findUnusedExports(files), [
      { file: 'dead.ts', name: 'gone', selfUses: 1 },
      { file: 'wide.ts', name: 'helper', selfUses: 2 },
    ]);
  });

  it('counts a test as a consumer, so a test-only helper is not called dead', () => {
    const files = new Map([
      ['a.ts', 'export const helper = 1;'],
      ['__tests__/a.test.ts', "import { helper } from '../a';"],
    ]);

    assert.deepEqual(
      findUnusedExports(files, (path) => !path.includes('__tests__')),
      [],
    );
  });

  it('does not read exports out of a test file itself', () => {
    const files = new Map([['__tests__/a.test.ts', 'export const fixture = 1;']]);

    assert.deepEqual(
      findUnusedExports(files, (path) => !path.includes('__tests__')),
      [],
    );
  });

  it('returns findings sorted by file then name', () => {
    const files = new Map([
      ['b.ts', 'export const zeta = 1;\nexport const alpha = 2;'],
      ['a.ts', 'export const only = 3;'],
    ]);

    assert.deepEqual(
      findUnusedExports(files).map((finding) => `${finding.file}:${finding.name}`),
      ['a.ts:only', 'b.ts:alpha', 'b.ts:zeta'],
    );
  });

  it('handles an empty set of files', () => {
    assert.deepEqual(findUnusedExports(new Map()), []);
  });
});
