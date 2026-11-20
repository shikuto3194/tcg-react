export async function pluginArchive(files) {
  const { zipSync, strToU8 } = await import('fflate');
  return new Blob([zipSync(Object.fromEntries(Object.entries(files).map(([name, text]) => [name, strToU8(text)])))], { type: 'application/zip' });
}

export async function saveClaudeCoworkPlugin() {
  const { invoke } = await import('@tauri-apps/api/core');
  const { saveNativeBlob } = await import('../local/nativeFiles.js');
  const files = await invoke('ai_plugin_files');
  return saveNativeBlob(await pluginArchive(files), 'TCG-Manager-local-plugin.zip');
}

export async function openWorkPlugin() {
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('open_work_plugin');
}
