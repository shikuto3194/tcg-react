import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { losslessImage } from '../../scripts/optimized-images.mjs';
import { splitImages, restoreImages, copyLibrary } from './storedImages.js';

test('lossless distribution image preserves pixels and dimensions', async () => {
  const png=await sharp({create:{width:32,height:48,channels:4,background:{r:40,g:70,b:200,alpha:0.5}}}).png().toBuffer();
  const webp=await losslessImage(png);
  assert.deepEqual(await sharp(webp).raw().toBuffer(),await sharp(png).raw().toBuffer());
});
test('image storage deduplicates faces, reuses unchanged images and detects missing data', () => {
  const image='data:image/png;base64,aGVsbG8=', source={cards:[{image},{front:{image},back:{image}}]};
  const known=new Map(), first=splitImages(source,known);
  assert.equal(first.additions.size,1);
  assert.equal(splitImages(source,known).additions.size,0);
  assert.deepEqual(restoreImages(first.value,first.additions),source);
  assert.throws(()=>restoreImages(first.value,new Map()),/画像/);
  const copy=copyLibrary(source);copy.cards[0].image='changed';assert.equal(source.cards[0].image,image);
});
