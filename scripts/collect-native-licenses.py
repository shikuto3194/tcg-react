"""Collect installed Cargo/Gradle notices; fetch only pinned upstream license files.

Inputs: .codex-temp/release-cargo-{windows,android}.json and
.codex-temp/release-android-dependencies.json. Output is distribution/licenses/.
No signing material or application source is collected.
"""
import argparse
import hashlib
import io
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'distribution/licenses'
LEGAL = re.compile(r'^(licen[cs]e|copying|copyright|notice)(?:[._-]|$)', re.I)


def read_json(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def download(url, cache, fetch):
    file = cache / hashlib.sha256(url.encode()).hexdigest()
    if not file.exists():
        if not fetch:
            raise RuntimeError(f'Uncached license; rerun with --fetch: {url}')
        request = urllib.request.Request(url, headers={'User-Agent': 'TCG-Manager-license-collector'})
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read(2_000_000)
        text = data.decode('utf-8-sig')
        if '<html' in text[:500].lower() or len(text) < 50:
            raise ValueError(f'Not a license: {url}')
        file.write_bytes(data)
    return file.read_text(encoding='utf-8-sig')


def crate_licenses(package, cache, fetch):
    directory = Path(package['manifest_path']).parent
    files = sorted(p for p in directory.rglob('*') if p.is_file() and LEGAL.match(p.name))
    entries = [(str(p.relative_to(directory)).replace('\\', '/'), p.read_text(encoding='utf-8-sig')) for p in files]
    if entries:
        return entries
    if package.get('license') == 'MPL-2.0':
        url = 'https://www.mozilla.org/media/MPL/2.0/index.txt'
        return [(url, download(url, cache, fetch))]
    vcs = read_json(directory / '.cargo_vcs_info.json')
    repo = package.get('repository', '').rstrip('/').removesuffix('.git')
    if not repo.startswith('https://github.com/'):
        raise ValueError(f'Missing license; inspect upstream: {package["name"]}: {repo}')
    repo = '/'.join(repo.removeprefix('https://github.com/').split('/')[:2])
    commit = vcs['git']['sha1']
    # Fetch at the exact crate commit, never the mutable default branch.
    candidates = ['LICENSE-MIT', 'LICENSE', 'LICENSE.txt', 'LICENSE.md', 'COPYING', 'LICENSE-APACHE']
    errors = []
    for name in candidates:
        url = f'https://raw.githubusercontent.com/{repo}/{commit}/{name}'
        try:
            text = download(url, cache, fetch)
            entries.append((url, text))
            # A dual licensed crate can be distributed under its MIT option.
            if 'MIT' in (package.get('license') or '') and 'Permission is hereby granted' in text:
                return entries
            if 'MPL' in (package.get('license') or '') and 'Mozilla Public License' in text:
                return entries
            if 'BSD' in (package.get('license') or '') and 'Redistribution' in text:
                return entries
        except (urllib.error.HTTPError, RuntimeError) as error:
            errors.append(str(error))
    if not entries:
        raise ValueError(f'No pinned license for {package["name"]}: {errors[-1:]}')
    return entries


def embedded_notices(data, label):
    results = []
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        for name in sorted(archive.namelist()):
            if name.endswith('/'):
                continue
            if LEGAL.match(Path(name).name):
                results.append((label + '/' + name, archive.read(name).decode('utf-8-sig')))
            elif name == 'classes.jar' or name.startswith('libs/') and name.endswith('.jar'):
                results.extend(embedded_notices(archive.read(name), label + '/' + name))
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--gradle-cache', type=Path, required=True)
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    cache = ROOT / '.codex-temp/license-cache'
    cache.mkdir(parents=True, exist_ok=True)
    packages = {}
    for target in ['windows', 'android']:
        for package in read_json(ROOT / f'.codex-temp/release-cargo-{target}.json')['packages']:
            if package.get('source'):
                packages[package['id']] = package
    inventory = []
    sections = ['TCG Manager: Native third-party software notices',
                'Includes dependencies of the Windows and Android builds, including build-time dependencies.',
                'Original license and copyright texts follow. Dual-license alternatives are retained where provided.',
                'Unmodified source for the listed MPL-2.0 crates is in MPL-sources.zip beside this file.']
    sources = []
    for package in sorted(packages.values(), key=lambda p: (p['name'], p['version'])):
        entries = crate_licenses(package, cache, args.fetch)
        identity = f'{package["name"]} {package["version"]}'
        inventory.append({'ecosystem': 'cargo', 'name': package['name'], 'version': package['version'],
                          'license': package['license'], 'repository': package.get('repository'),
                          'texts': [{'name': name, 'sha256': hashlib.sha256(text.encode()).hexdigest()} for name, text in entries]})
        sections.append('\n' + '=' * 72 + '\n' + identity + '\nLicense: ' + package['license'])
        for name, text in entries:
            sections.append('\n--- ' + name + ' ---\n' + text)
        if 'MPL' in package['license']:
            directory = Path(package['manifest_path']).parent
            sources.append((package, directory))
    apache = download('https://www.apache.org/licenses/LICENSE-2.0.txt', cache, args.fetch)
    namespace = {'m': 'http://maven.apache.org/POM/4.0.0'}
    for package in read_json(ROOT / '.codex-temp/release-android-dependencies.json'):
        identity = ':'.join(package[k] for k in ['group', 'name', 'version'])
        directory = args.gradle_cache / package['group'] / package['name'] / package['version']
        poms = sorted(directory.rglob('*.pom'))
        if len(poms) != 1:
            raise ValueError(f'Expected one cached POM: {identity}')
        pom = ET.parse(poms[0])
        licenses = [{'name': el.findtext('m:name', namespaces=namespace), 'url': el.findtext('m:url', namespaces=namespace)}
                    for el in pom.findall('m:licenses/m:license', namespace)]
        if not licenses:
            parent = pom.find('m:parent', namespace)
            if parent is not None:
                group, name, version = [parent.findtext('m:' + key, namespaces=namespace) for key in ['groupId', 'artifactId', 'version']]
                parent_poms = sorted((args.gradle_cache / group / name / version).rglob('*.pom'))
                if len(parent_poms) == 1:
                    licenses = [{'name': el.findtext('m:name', namespaces=namespace), 'url': el.findtext('m:url', namespaces=namespace)}
                                for el in ET.parse(parent_poms[0]).findall('m:licenses/m:license', namespace)]
        if not licenses:
            raise ValueError(f'Missing Android license declaration: {identity}')
        sections.append('\n' + '=' * 72 + '\n' + identity)
        for license_info in licenses:
            sections.append('License: ' + str(license_info))
            name = license_info['name'] or ''
            url = license_info['url'] or ''
            if 'apache' in (name + url).lower() and ('2' in name + url):
                sections.append(apache)
            else:
                sections.append(download(url.replace('http://', 'https://', 1), cache, args.fetch))
        for artifact in sorted(directory.rglob('*')):
            if artifact.suffix in ['.aar', '.jar']:
                for label, text in embedded_notices(artifact.read_bytes(), artifact.name):
                    sections.append('\n--- ' + label + ' ---\n' + text)
        inventory.append({'ecosystem': 'maven', **package, 'licenses': licenses,
                          'pomSha256': hashlib.sha256(poms[0].read_bytes()).hexdigest()})
    with zipfile.ZipFile(OUT / 'MPL-sources.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for package, directory in sources:
            for file in sorted(directory.rglob('*')):
                if file.is_file():
                    name = f'{package["name"]}-{package["version"]}/{file.relative_to(directory).as_posix()}'
                    info = zipfile.ZipInfo(name, date_time=(2026, 10, 10, 0, 0, 0))
                    info.compress_type = zipfile.ZIP_DEFLATED
                    archive.writestr(info, file.read_bytes())
    (OUT / 'THIRD_PARTY_NOTICES.native.txt').write_text('\n'.join(sections) + '\n', encoding='utf-8')
    (OUT / 'native-inventory.json').write_text(json.dumps(inventory, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Collected {len(packages)} Cargo packages, {len(inventory)-len(packages)} Maven components; {len(sources)} MPL source packages.')


if __name__ == '__main__':
    main()
