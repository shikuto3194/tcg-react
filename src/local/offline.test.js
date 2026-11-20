import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

test('開発用ワーカーは通信を横取りせず、自身の登録だけを解除する',async()=>{
 const handlers={},lifecycle=[];
 const self={
   location:{href:'http://localhost:5173/sw.js'},
   addEventListener:(name,handler)=>handlers[name]=handler,
   skipWaiting:async()=>lifecycle.push('skipWaiting'),
   clients:{claim:async()=>lifecycle.push('claim')},
   registration:{unregister:async()=>lifecycle.push('unregister')},
 };
 const source=await readFile('public/sw.js','utf8');
 runInNewContext(source,{self,URL,caches:{
   open:()=>assert.fail('development worker must not create caches'),
   keys:()=>assert.fail('development worker must preserve existing caches'),
 },fetch:()=>assert.fail('development worker must leave requests to the browser')});
 for(const phase of ['install','activate']){let pending;handlers[phase]({waitUntil:task=>pending=task});await pending;}
 assert.deepEqual(lifecycle,['skipWaiting','claim','unregister']);
 for(const [path,mode] of [['','navigate'],['src/App.jsx','cors']]){
   handlers.fetch?.({request:{url:'http://localhost:5173/'+path,method:'GET',mode},respondWith:()=>assert.fail('development request intercepted')});
 }
});

test('更新は変更ファイルだけ取得し、途中失敗時は旧キャッシュを保持する',async()=>{
 const digest=value=>createHash('sha256').update(value).digest('hex');
 const origin='https://local.test/app/',inventory=origin+'.tcg-cache-inventory';
 const old=new Map([[origin+'same.js',new Response('same')],[origin+'index.html',new Response('old')],[inventory,new Response(JSON.stringify({'same.js':digest('same'),'index.html':digest('old')}))]]);
 for(const fail of [false,true]){
  const handlers={},stores=new Map([['tcg-local-old',old]]),requests=[];
  const caches={keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),open:async name=>{
   if(!stores.has(name))stores.set(name,new Map());const entries=stores.get(name);
   return {match:async url=>entries.get(url)?.clone(),put:async(url,response)=>entries.set(url,response.clone())};
  }};
  const self={location:{href:origin+'sw.js'},addEventListener:(name,handler)=>handlers[name]=handler,skipWaiting:async()=>{}};
  const source=(await readFile('public/sw.js','utf8')).replace('/* PRECACHE */[]',JSON.stringify(['same.js','index.html'])).replace('/* REVISIONS */{}',JSON.stringify({'same.js':digest('same'),'index.html':digest('new')}));
  runInNewContext(source,{self,caches,URL,Response,Uint8Array,crypto:webcrypto,fetch:async url=>{requests.push(url);return new Response(fail?'corrupted':'new');}});
  let pending;handlers.install({waitUntil:task=>pending=task});
  if(fail){await assert.rejects(pending,/changed/);assert.equal(stores.size,1);}else{await pending;assert.equal(stores.size,2);}
  assert.deepEqual(requests,[origin+'index.html']);assert.ok(stores.has('tcg-local-old'));
 }
});

test('画面のキャッシュがない場合はネットワーク応答を返す',async()=>{
 const handlers={},response={status:200},requests=[];
 const self={location:{href:'https://local.test/app/sw.js'},addEventListener:(name,handler)=>handlers[name]=handler};
 const source=(await readFile('public/sw.js','utf8')).replace('/* PRECACHE */[]',JSON.stringify(['index.html']));
 runInNewContext(source,{self,URL,caches:{open:async()=>({match:async()=>undefined})},fetch:async request=>{requests.push(request);return response;}});
 const request={url:'https://local.test/app/',method:'GET',mode:'navigate'};
 let pending;
 handlers.fetch({request,respondWith:task=>pending=task});
 assert.equal(await pending,response);
 assert.deepEqual(requests,[request]);
});

test('オフラインキャッシュは同梱画像の版付きURLと画面を返し、他アプリのキャッシュを消さない',async()=>{
 const handlers={},entries=new Map(),deleted=[];
 const cache={addAll:async urls=>{for(const url of urls)entries.set(url,{url});},match:async(request,options)=>{
   // Preview adds Vary: Origin; module/image requests can carry Origin even
   // though the install-time fetch did not. Static assets must still match.
   if(request.headers?.Origin && !options?.ignoreVary)return undefined;
   const url=new URL(typeof request==='string'?request:request.url);
   if(options?.ignoreSearch)url.search='';return entries.get(url.href);
 }};
 const self={location:{href:'https://local.test/app/sw.js'},addEventListener:(name,handler)=>handlers[name]=handler,skipWaiting:async()=>{},clients:{claim:async()=>{}}};
 const caches={open:async()=>cache,keys:async()=>['tcg-local-old','tcg-local-__BUILD_VERSION__','another-app'],delete:async key=>deleted.push(key)};
 const source=(await readFile('public/sw.js','utf8')).replace('/* PRECACHE */[]',JSON.stringify(['index.html','images/starlit/01.png']));
 runInNewContext(source,{self,caches,URL,fetch:()=>{throw Error('Unexpected network');}});
 for(const phase of ['install','activate']){let pending;handlers[phase]({waitUntil:task=>pending=task});await pending;}
 assert.deepEqual(deleted,['tcg-local-old']);
 for(const [url,mode,expected] of [['images/starlit/01.png?v=abc','cors','images/starlit/01.png'],['','navigate','index.html']]){
   let response;handlers.fetch({request:{url:'https://local.test/app/'+url,method:'GET',mode,headers:{Origin:'https://local.test'}},respondWith:task=>response=task});
   assert.equal((await response).url,'https://local.test/app/'+expected);
 }
 handlers.fetch({request:{url:'https://external.test/x',method:'GET'},respondWith:()=>assert.fail('cross-origin intercepted')});
});
