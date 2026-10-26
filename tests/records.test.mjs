import test from 'node:test';
import assert from 'node:assert/strict';
import {loadLocalData,saveLocalData,clearLocalData,upsertRecord,STORAGE_KEY,HISTORY_LIMIT} from '../dist/records.mjs';

function memoryStorage() {
  const values = new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
function round(id) {
  return {id,startedAt:'2026-10-27T00:00:00Z',seed:`seed-${id}`,board:Array.from({length:36},(_,i)=>35-i),draws:15,phase:'won',selected:[35,3,0]};
}
test('browser data preserves board, seed, result and settings without sharing storage',()=>{
  const a=memoryStorage();
  const data={version:1,preferences:{'no-shuffle':true,draws:'14'},history:[round('one')]};
  assert.equal(saveLocalData(a,data),true);
  assert.deepEqual(loadLocalData(a),data);
  assert.deepEqual(loadLocalData(memoryStorage()).history,[]);
});
test('history retains the last 100 rounds and snapshots do not mutate',()=>{
  let history=[];
  for(let i=0;i<120;i+=1) history=upsertRecord(history,round(String(i)));
  assert.equal(history.length,HISTORY_LIMIT);
  assert.equal(history[0].id,'20');
  const record=round('119');
  history=upsertRecord(history,record);
  record.board.reverse();
  assert.equal(history.length,HISTORY_LIMIT);
  assert.equal(history.at(-1).board[0],35);
});
test('invalid JSON and invalid saved boards are ignored',()=>{
  const storage=memoryStorage();
  storage.setItem(STORAGE_KEY,'broken');
  assert.deepEqual(loadLocalData(storage).history,[]);
  saveLocalData(storage,{version:1,preferences:{},history:[{...round('bad'),board:Array(36).fill(0)},round('good')]});
  assert.equal(loadLocalData(storage).history.length,1);
});
test('clearing records leaves unrelated applications on the same origin intact',()=>{
  const storage=memoryStorage();
  storage.setItem('other-project','keep');
  storage.setItem('bingo-theme','black');
  saveLocalData(storage,{version:1,preferences:{},history:[round('one')]});
  assert.equal(clearLocalData(storage),true);
  assert.equal(storage.getItem(STORAGE_KEY),null);
  assert.equal(storage.getItem('bingo-theme'),null);
  assert.equal(storage.getItem('other-project'),'keep');
});
