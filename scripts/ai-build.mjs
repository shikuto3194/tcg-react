import { fileURLToPath } from 'node:url';

// Tauri supplies these values to beforeBuildCommand, including `build --debug`.
export function includesAI(env) {
  return !['android', 'androideabi'].includes(env.TAURI_ENV_PLATFORM) || env.TAURI_ENV_DEBUG === 'true';
}

export function aiBuild(env) {
  const enabled = includesAI(env);
  return {
    name: 'tcg-ai-build',
    config: () => enabled ? {} : {
      resolve: { alias: [{
        find: /^\.\.?\/automation\/integration\.js$/,
        replacement: fileURLToPath(new URL('../src/automation/disabled.js', import.meta.url)),
      }] },
    },
    generateBundle(_options, bundle) {
      if (enabled) return;
      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk') continue;
        for (const id of Object.keys(chunk.modules)) {
          const path = id.replaceAll('\\', '/');
          if ((path.includes('/src/automation/') && !path.endsWith('/disabled.js')) || path.includes('/@modelcontextprotocol/')) {
            this.error(`Android release must not include AI code: ${id}`);
          }
        }
      }
    },
  };
}
