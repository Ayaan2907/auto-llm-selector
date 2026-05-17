import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTryArgs, ArgError } from '../src/cli/args.js';

test('parses prompt and numeric knobs', () => {
  const a = parseTryArgs([
    '--prompt',
    'hello',
    '--accuracy',
    '0.8',
    '--cost',
    '0.3',
    '--speed',
    '0.7',
    '--token-limit',
    '12000',
    '--reasoning',
  ]);
  assert.equal(a.prompt, 'hello');
  assert.equal(a.accuracy, 0.8);
  assert.equal(a.cost, 0.3);
  assert.equal(a.speed, 0.7);
  assert.equal(a.tokenLimit, 12000);
  assert.equal(a.reasoning, true);
});

test('parses preset + multi-label + non-interactive', () => {
  const a = parseTryArgs([
    '--preset',
    'coding',
    '--multi-label',
    '--non-interactive',
    '--prompt',
    'p',
  ]);
  assert.equal(a.preset, 'coding');
  assert.equal(a.multiLabel, true);
  assert.equal(a.nonInteractive, true);
});

test('parses allow/deny CSV', () => {
  const a = parseTryArgs([
    '--allow',
    'openai/*,anthropic/*',
    '--deny',
    'meta/*',
  ]);
  assert.deepEqual(a.allow, ['openai/*', 'anthropic/*']);
  assert.deepEqual(a.deny, ['meta/*']);
});

test('rejects out-of-range numeric values', () => {
  assert.throws(
    () => parseTryArgs(['--accuracy', '1.5']),
    (err: unknown) => err instanceof ArgError
  );
});

test('rejects unknown flag', () => {
  assert.throws(
    () => parseTryArgs(['--bogus', 'x']),
    (err: unknown) => err instanceof ArgError
  );
});

test('non-interactive without --prompt is valid at parse time', () => {
  const a = parseTryArgs(['--non-interactive']);
  assert.equal(a.nonInteractive, true);
  assert.equal(a.prompt, undefined);
});
