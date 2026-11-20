import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
async function walk(dir,prefix='') {
 const result=[];
 for(const e of await readdir(dir,{withFileTypes:true})) {
   if(e.isDirectory()) result.push(...await walk(`${dir}/${e.name}`,`${prefix}${e.name}/`));
   else if(e.name!=='sw.js')result.push(`${prefix}${e.name}`);
 }
 return result.sort();
}
const files=await walk('dist');
const source=await readFile('public/sw.js','utf8');
// Worker-only changes need a distinct cache too, so a failed update never
// removes the cache still used by the previous worker.
const hash=createHash('sha256').update(source);
const revisions={};
for(const file of files){const data=await readFile(`dist/${file}`);hash.update(file).update('\0').update(data);revisions[file]=createHash('sha256').update(data).digest('hex');}
await writeFile('dist/sw.js',source.replace('__BUILD_VERSION__',hash.digest('hex').slice(0,12)).replace('/* PRECACHE */[]',JSON.stringify(files)).replace('/* REVISIONS */{}',JSON.stringify(revisions)));
console.log(`[offline] ${files.length} local files precached`);
