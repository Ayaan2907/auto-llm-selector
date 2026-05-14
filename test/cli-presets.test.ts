import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, presetToProperties } from '../src/cli/presets.js';
import { assertValidPromptProperties } from '../src/validation/schemas.js';

const NAMES = ['coding', 'creative', 'quick', 'analytical'] as const;

test('each preset survives the prompt-properties schema', () => {
  for (const name of NAMES) {
    const props = presetToProperties(name);
    assert.doesNotThrow(() => assertValidPromptProperties(props));
  }
});

test('preset values stay within [0,1] for unit knobs', () => {
  for (const name of NAMES) {
    const p = PRESETS[name];
    for (const k of ['accuracy', 'cost', 'speed'] as const) {
      assert.ok(p[k] >= 0 && p[k] <= 1, `${name}.${k} out of range`);
    }
    assert.ok(p.tokenLimit > 0, `${name}.tokenLimit must be positive`);
  }
});
