import { readFile, writeFile, mkdir } from 'node:fs/promises';
import sharp from 'sharp';
import { parseCardData } from '../src/local/importData.js';
import { PACK_OPTIONS, packKey, packTitle } from '../src/utils/deckPacks.js';
const records = parseCardData(await readFile('sample-game/cards.csv','utf8'),'cards.csv').map(x=>x.record);
const template = await readFile('sample-game/card.html','utf8');
const colors = ['#285748','#994831','#8b6430','#3d5577'];
const gardens = PACK_OPTIONS.map(packTitle);
const esc = x => String(x).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function lines(text, width, startY, step) {
  const result=[]; let line='';
  for(const char of text) {
    if([...line].length>=width && !'、。）」』'.includes(char)){result.push(line);line='';}
    line+=char;
  }
  if(line)result.push(line);
  if(result.length>3)throw Error('Card text overflows: '+text);
  return result.map((line,i)=>`<tspan x="48" y="${startY+i*step}">${esc(line)}</tspan>`).join('');
}
const cards=[];
await mkdir('images/starlit',{recursive:true});
await mkdir('.codex-temp/cards',{recursive:true});
for(const r of records){
  const id=Number(r.id), serial=String(id).padStart(2,'0'), faction=gardens.indexOf(r.garden);
  if(faction<0)throw Error('Unknown garden');
  const number=`${packKey(PACK_OPTIONS[faction])}-${String((id-1)%10+1).padStart(3,'0')}`;
  const path=`images/starlit/${serial}.png`;
  const only = process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',').map(Number);
  if(!process.argv.includes('--data-only') && (!only || only.includes(id))){
    let art;
    let original = true;
    try {art=await readFile(`sample-game/art/${serial}.png`);} catch {art=await readFile(`sample-game/art/${serial}.webp`);original=false;}
    const webp=original ? await sharp(art).webp({quality:94, effort:6}).toBuffer() : art;
    await writeFile(`sample-game/art/${serial}.webp`,webp);
    const embedded = await sharp(webp).png().toBuffer();
    const fit = id === 3 ? 'xMinYMid slice' : [2,6,11,15,23,25,31,35,36].includes(id) ? 'xMidYMin slice' : 'xMidYMid slice';
    const data={...r,number,color:colors[faction],titleSize:r.name.length>10?30:34,art:`data:image/png;base64,${embedded.toString('base64')}`,fit,effectLines:lines(r.effect,20,770,42),flavorLines:lines(r.flavor,29,923,29)};
    const html=template.replace(/\{\{(\w+)\}\}/g,(_,key)=>key.endsWith('Lines')?data[key]:esc(data[key]));
    const svg=html.slice(html.indexOf('<svg'),html.indexOf('</svg>')+6);
    await sharp(Buffer.from(svg)).png({compressionLevel:9}).withMetadata({density:305}).toFile(path);
    await writeFile(`.codex-temp/cards/${serial}.html`,html);
  }
  cards.push({id:10000+id,name:r.name,image:path,cardNumber:number,pack:PACK_OPTIONS[faction],color:[r.garden],type:r.kind,rarity:r.rarity,tribe:r.tribe,cost:Number(r.cost),reduction:[r.power],effect:r.effect+'\n\n'+r.flavor,symbol:[]});
}
await writeFile('src/cardData.js',`// Original sample. Regenerate from sample-game/cards.csv with npm run sample:build.\nimport { applyVersionToCard } from './imageUrl.js';\nconst cards = ${JSON.stringify(cards,null,2)};\nexport default cards.map(applyVersionToCard);\n`);
console.log(`Built ${cards.length} original sample cards${process.argv.includes('--data-only')?' (data only)':''}`);
