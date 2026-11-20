import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join, relative, sep } from 'node:path';
import cards from '../cardData.js';
import manifest from '../imagesManifest.generated.js';
import { PACK_OPTIONS } from './deckPacks.js';

const imagesDir = fileURLToPath(new URL('../../images/', import.meta.url));
const facesOf = card => card.isDoubleSided ? [card.front, card.back] : [card];
const faces = cards.flatMap(facesOf);
const imageKey = url => url.split(/[?#]/)[0].replace(/^\/?images\//, '');

function unique(values, label) {
  assert.equal(new Set(values).size, values.length, `Duplicate ${label}`);
}

test('カードID・表裏の番号・画像参照に欠損や重複がない', () => {
  assert.equal(cards.length, 40);
  unique(cards.map(card => card.id), 'card ID');
  unique(faces.map(face => face.cardNumber), 'card number');
  for (const card of cards) {
    assert.ok(Number.isInteger(card.id) && card.id > 0, `Invalid ID: ${card.id}`);
    if (card.isDoubleSided) {
      assert.ok(card.front && card.back, `Missing face: ${card.id}`);
      assert.notEqual(card.front.image, card.back.image, `Same face image: ${card.id}`);
    }
    for (const face of facesOf(card)) {
      assert.ok(face.name && face.cardNumber && face.image, `Incomplete card: ${card.id}`);
      const key = imageKey(face.image);
      assert.ok(Object.hasOwn(manifest, key), `Missing image: ${face.image}`);
      assert.equal(new URL(face.image, 'https://test.invalid/').searchParams.get('v'), manifest[key]);
    }
  }
});

test('関連トークンの参照先が残っている', () => {
  const names = new Set(cards.map(card => card.name));
  for (const card of cards) {
    for (const owner of new Set([card, ...facesOf(card)])) {
      for (const name of owner.relatedTokens || []) {
        assert.ok(names.has(name), `Missing related token: ${card.id} -> ${name}`);
      }
    }
  }
});

test('収録セット候補が実カードの表裏と一致する', () => {
  unique(PACK_OPTIONS, 'pack');
  assert.deepEqual([...new Set(faces.map(face => face.pack))].sort(), [...PACK_OPTIONS].sort());
});

test('画像ファイル・マニフェスト・データ参照が一致し、内容ハッシュが最新', async () => {
  async function walk(dir) {
    const files = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) files.push(...await walk(path));
      else if (entry.isFile()) files.push(relative(imagesDir, path).split(sep).join('/'));
    }
    return files.sort();
  }
  const files = await walk(imagesDir);
  const references = new Set(faces.map(face => imageKey(face.image)));
  assert.deepEqual(files, [...references].sort(), 'Missing or unreferenced images');
  assert.deepEqual(files, Object.keys(manifest).sort(), 'Stale image manifest');
  for (const path of files) {
    const hash = createHash('sha1').update(await readFile(join(imagesDir, path))).digest('hex').slice(0, 8);
    assert.equal(hash, manifest[path], `Stale image hash: ${path}`);
  }
});
