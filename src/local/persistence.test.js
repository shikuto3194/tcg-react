import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { openLibrary, createSaveQueue } from './persistence.js';
import { initializeLibrary, createGame, addImages, editCard, getLocalCards, getLocalSettings, getLocalStorage, getGames, applySettings, snapshotLibrary, flushLibrary, exportLibrary, restoreLibrary } from './store.js';
import { validateLibrary } from './backup.js';

const image='data:image/png;base64,aGVsbG8=';
test('IndexedDBを閉じて再接続しても、画像・項目・作成中／保存デッキをゲーム別に復元する', async()=>{
 const factory=new IDBFactory(); let db=await openLibrary(factory);
 await initializeLibrary(db);
 assert.equal(getGames()[0].decks,4);
 const id=createGame('永続化の検証');
 addImages([{path:'第1弾/a.png',image}]);const card=getLocalCards()[0];
 editCard(card.id,null,{name:'編集後',effect:'長い説明',limit:'2'});
 applySettings({...getLocalSettings(),labels:['色','種別','希少度','種族','コスト','力'],cardSize:{width:63,height:88}});
 getLocalStorage().setItem('savedCanvasDecks',JSON.stringify([{id:'saved-test',name:'保存済み',cards:[{id:card.id,count:2}]}]));
 getLocalStorage().setItem('draft',JSON.stringify({deck:[{id:card.id,count:1}],deckName:'作成中'}));
 await flushLibrary(); const before=snapshotLibrary(); db.close();
 db=await openLibrary(factory);await initializeLibrary(db);
 assert.deepEqual(snapshotLibrary(),before);assert.equal(snapshotLibrary().activeGameId,id);
 assert.equal(getLocalCards()[0].image,image);assert.equal(getLocalCards()[0].mockLimit,'2');
 const backup=await exportLibrary(async()=>image); assert.ok(backup.games.every(g=>g.cards.every(c=>c.image.startsWith('data:'))));
 const count=getGames().length;await restoreLibrary(backup);assert.equal(getGames().length,count*2);
 const { automation, ...stored }=await db.read();assert.ok(automation.revision);assert.deepEqual(stored,snapshotLibrary());
 const snapshot=snapshotLibrary();
 const invalid=structuredClone(snapshot);invalid.games[0].cards[0].image='https://example.com/a.png';
 await assert.rejects(restoreLibrary(invalid));assert.deepEqual(snapshotLibrary(),snapshot);
 const broken=structuredClone(snapshot);broken.games[0].storage.savedCanvasDecks=JSON.stringify([{cards:[{id:999999,count:1}]}]);
 assert.throws(()=>validateLibrary(broken));
 const many=structuredClone(snapshot);many.games=Array.from({length:101},(_,i)=>({...many.games[0],gameId:`many-${i}`}));many.activeGameId='many-0';
 assert.equal(validateLibrary(many).games.length,101);
 db.close();
});

test('保存中の変更を直列化し、最新値まで保存完了を待ち、容量エラーを隠さない', async()=>{
 const values=[],status=[];let release;
 const queue=createSaveQueue(async value=>{values.push(value);if(value.n===1)await new Promise(resolve=>{release=resolve;});},s=>status.push(s.kind));
 queue.enqueue({n:1});await Promise.resolve();queue.enqueue({n:2});queue.enqueue({n:3});release();await queue.flush();
 assert.deepEqual(values,[{n:1},{n:3}]);assert.equal(status.at(-1),'saved');
 const fail=createSaveQueue(async()=>{throw new Error('quota');},s=>status.push(s.kind));fail.enqueue({n:1});await assert.rejects(fail.flush(),/quota/);assert.equal(status.at(-1),'error');
});

test('読込失敗時は保存処理を開始せず既存データを上書きしない', async()=>{
 let writes=0;
 await assert.rejects(initializeLibrary({read:async()=>({format:'invalid'}),write:async()=>{writes++;}}));
 assert.equal(writes,0);
});

test('復元の保存失敗ではゲームを切り替えず、追加途中のゲームを次の自動保存に残さない', async () => {
 let stored = { format: 'tcg-local-library-v1', activeGameId: 'original', games: [{ gameId: 'original', name: '元ゲーム', cards: [], settings: { labels: [], source: 'folder' }, storage: {} }] };
 let fail = false, release;
 await initializeLibrary({ read: async () => stored, write: async value => {
   if (release) await new Promise(resolve => { release = resolve; });
   if (fail) throw new Error('quota');
   stored = structuredClone(value);
 } });
 const before = snapshotLibrary();
 fail = true;
 await assert.rejects(restoreLibrary(before), /quota/);
 assert.deepEqual(snapshotLibrary(), before);
 fail = false; getLocalStorage().setItem('draft', JSON.stringify({ deck: [] })); await flushLibrary();
 assert.equal(stored.games.length, 1);
 release = true;
 const pending = restoreLibrary(before);
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(snapshotLibrary().activeGameId, 'original');
 const done = release; release = null; done(); await pending;
 assert.equal(stored.games.length, 2);
 const { automation, ...saved } = stored;
 assert.ok(automation.revision); assert.deepEqual(snapshotLibrary(), saved);
});

test('旧v1保存を読め、新しい画像だけを書き、失敗した更新は画像とデータを一緒に取り消す', async()=>{
 const factory=new IDBFactory(), old={games:[{cards:[{image}],storage:{draft:'old'}}]};
 const legacy=await new Promise((ok,fail)=>{const request=factory.open('tcg-local-library-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('library');request.onsuccess=()=>ok(request.result);request.onerror=()=>fail(request.error);});
 await new Promise((ok,fail)=>{const tx=legacy.transaction('library','readwrite');tx.objectStore('library').put(old,'current');tx.oncomplete=ok;tx.onabort=fail;});legacy.close();
 const db=await openLibrary(factory);assert.deepEqual(await db.read(),old);
 const original=IDBObjectStore.prototype.put;let images=0,abort=false;
 IDBObjectStore.prototype.put=function(...args){if(this.name==='images'){images++;if(abort){this.transaction.abort();throw new Error('quota');}}return original.apply(this,args);};
 try {
  await db.write(old);assert.equal(images,1);
  await db.write({...old,activeGameId:'updated'});assert.equal(images,1);
  abort=true;await assert.rejects(db.write({games:[{cards:[{image:'data:image/png;base64,bmV3'}]}]}),/quota/);
  assert.deepEqual(await db.read(),{...old,activeGameId:'updated'});
  abort=false;await db.write(old);assert.deepEqual(await db.read(),old);
  await db.write({games:[]});
  await db.write(old);assert.equal(images,3,'deleted images must be written again');
  assert.deepEqual(await db.read(),old);
 }finally{IDBObjectStore.prototype.put=original;db.close();}
});
