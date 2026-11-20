import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export async function dependencyRoot(moduleId) {
  const id = moduleId.replace(/^\0/, '').replaceAll('\\', '/').split('?')[0];
  if (!id.includes('/node_modules/')) return null;
  let directory = dirname(id);
  while (directory.includes('node_modules')) {
    try {
      const metadata = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (metadata.name && metadata.version) return { directory, metadata };
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
    directory = dirname(directory);
  }
  throw new Error(`Dependency package not found: ${moduleId}`);
}

export async function packageNotices(directory) {
  const files = (await readdir(directory)).filter(name => /^(licen[cs]e|notice|copying|copyright)([._-]|$)/i.test(name)).sort();
  const texts = [];
  for (const name of files) {
    if ((await stat(join(directory, name))).isFile()) texts.push(`${name}\n${await readFile(join(directory, name), 'utf8')}`);
  }
  if (!texts.length) throw new Error(`License text missing: ${directory}`);
  return texts.join('\n\n');
}

export function thirdPartyLicenses() {
  return {
    name: 'tcg-third-party-licenses', apply: 'build',
    async generateBundle(_options, bundle) {
      const packages = new Map();
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const moduleId of Object.keys(output.modules)) {
          const dependency = await dependencyRoot(moduleId);
          if (dependency) packages.set(dependency.directory, dependency.metadata);
        }
      }
      const sections = ['TCG Manager: Web third-party software notices', 'Licenses for packages actually included in this build.'];
      const inventory = [];
      for (const [directory, metadata] of [...packages].sort((a, b) => a[1].name.localeCompare(b[1].name))) {
        sections.push(`\n${'='.repeat(72)}\n${metadata.name} ${metadata.version}\nLicense: ${metadata.license || 'See text below'}\n\n${await packageNotices(directory)}`);
        inventory.push({ name: metadata.name, version: metadata.version, license: metadata.license });
      }
      this.emitFile({ type: 'asset', fileName: 'licenses/THIRD_PARTY_NOTICES.web.txt', source: sections.join('\n') + '\n' });
      this.emitFile({ type: 'asset', fileName: 'licenses/web-inventory.json', source: JSON.stringify(inventory, null, 2) + '\n' });
      for (const name of ['THIRD_PARTY_NOTICES.native.txt', 'native-inventory.json', 'MPL-sources.zip']) {
        this.emitFile({ type: 'asset', fileName: `licenses/${name}`, source: await readFile(resolve('distribution/licenses', name)) });
      }
    },
  };
}
