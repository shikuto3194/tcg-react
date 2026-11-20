import test from 'node:test';
import assert from 'node:assert/strict';
import { aiBuild, includesAI } from '../../scripts/ai-build.mjs';

test('AI is omitted only from Android release, including the ARM Android platform name', () => {
  for (const platform of ['android', 'androideabi']) {
    assert.equal(includesAI({ TAURI_ENV_PLATFORM: platform }), false);
    assert.equal(includesAI({ TAURI_ENV_PLATFORM: platform, TAURI_ENV_DEBUG: 'false' }), false);
    assert.equal(includesAI({ TAURI_ENV_PLATFORM: platform, TAURI_ENV_DEBUG: 'true' }), true);
  }
  for (const platform of [undefined, 'windows', 'linux', 'darwin']) {
    assert.equal(includesAI({ TAURI_ENV_PLATFORM: platform }), true);
    assert.equal(includesAI({ TAURI_ENV_PLATFORM: platform, TAURI_ENV_DEBUG: 'true' }), true);
  }
});

test('Android release fails to build if a new import bypasses the AI entry', () => {
  const plugin = aiBuild({ TAURI_ENV_PLATFORM: 'android' });
  const context = { error(message) { throw new Error(message); } };
  const bundle = id => ({ app: { type: 'chunk', modules: { [id]: {} } } });
  for (const id of ['C:\\app\\src\\automation\\connection.js', '/app/src/automation/ui.js', '/app/node_modules/@modelcontextprotocol/sdk/client.js']) {
    assert.throws(() => plugin.generateBundle.call(context, {}, bundle(id)), /must not include AI code/);
  }
  for (const id of ['/app/src/automation/disabled.js', '/app/src/local/nativeFiles.js']) {
    assert.doesNotThrow(() => plugin.generateBundle.call(context, {}, bundle(id)));
  }
  assert.doesNotThrow(() => aiBuild({ TAURI_ENV_PLATFORM: 'android', TAURI_ENV_DEBUG: 'true' }).generateBundle.call(context, {}, bundle('/app/src/automation/connection.js')));
});
