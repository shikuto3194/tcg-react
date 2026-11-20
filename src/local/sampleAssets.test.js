import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { parseCardData } from './importData.js';
import cards from '../cardData.js';

test('40枚の完成PNGは本文を含む統一寸法で、原画とCSVが実データに対応する',async()=>{
 const rows=parseCardData(await readFile('sample-game/cards.csv','utf8'),'cards.csv').map(x=>x.record);
 assert.equal(rows.length,40);
 for(const row of rows){
  const n=String(row.id).padStart(2,'0'),card=cards.find(c=>c.id===10000+Number(row.id));
  assert.equal(card.name,row.name);assert.equal(card.effect,row.effect+'\n\n'+row.flavor);
  const file=`images/starlit/${n}.png`,meta=await sharp(file).metadata();
  assert.equal(meta.format,'png');assert.equal(meta.width,756);assert.equal(meta.height,1056);
  const art=await sharp(`sample-game/art/${n}.webp`).metadata();assert.ok(art.width>=1000 && art.height>=900);
  // Catch accidentally blank art slots after SVG image embedding, without a pixel-perfect golden image.
  const stats=await sharp(file).extract({left:29,top:142,width:698,height:510}).stats();
  assert.ok(stats.entropy>5,`${n}: missing or flat artwork`);
 }
});
