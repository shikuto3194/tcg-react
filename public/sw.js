const CACHE = 'tcg-local-__BUILD_VERSION__';
const FILES = /* PRECACHE */[];
const REVISIONS = /* REVISIONS */{};
const scope = new URL('./', self.location.href);
const inventoryUrl = new URL('.tcg-cache-inventory', scope).href;
self.addEventListener('install', event => event.waitUntil((async()=>{
 if(FILES.length){
  const cache = await caches.open(CACHE);
  if (!Object.keys(REVISIONS).length) await cache.addAll(FILES.map(path=>new URL(path,scope).href));
  else try {
   const previous=[];
   for(const key of await caches.keys()) if(key.startsWith('tcg-local-') && key!==CACHE){
    const old=await caches.open(key), receipt=await old.match(inventoryUrl);
    if(receipt) previous.push({cache:old,revisions:await receipt.json()});
   }
   for(const file of FILES){
    const url=new URL(file,scope).href;
    let response;
    for(const old of previous) if(old.revisions[file]===REVISIONS[file]){response=await old.cache.match(url);if(response)break;}
    if(!response){
     response=await fetch(url,{cache:'no-store'});
     if(!response.ok)throw new Error(`Offline asset failed: ${file}`);
     const digest=await crypto.subtle.digest('SHA-256',await response.clone().arrayBuffer());
     const revision=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
     if(revision!==REVISIONS[file])throw new Error(`Offline asset changed: ${file}`);
    }
    await cache.put(url,response);
   }
   await cache.put(inventoryUrl,new Response(JSON.stringify(REVISIONS)));
  }catch(error){await caches.delete(CACHE);throw error;}
 }
 await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async()=>{
 // Vite serves this unbuilt file. Retire registrations left by earlier versions.
 if(!FILES.length){
  await self.clients.claim();
  await self.registration.unregister();
  return;
 }
 for(const key of await caches.keys()) if(key.startsWith('tcg-local-') && key!==CACHE) await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch', event=>{
 if(!FILES.length)return;
 const url=new URL(event.request.url);
 if(event.request.method!=='GET' || url.origin!==scope.origin || !url.pathname.startsWith(scope.pathname))return;
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  // Only verified static build assets live here. Their bytes do not vary by
  // Origin, even when the preview server adds Vary: Origin to CORS responses.
  const cached=await cache.match(event.request,{ignoreSearch:true,ignoreVary:true});
  if(cached)return cached;
  if(event.request.mode==='navigate'){
   const page=await cache.match(new URL('index.html',scope).href);
   if(page)return page;
  }
  return fetch(event.request);
 })());
});
