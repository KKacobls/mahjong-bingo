import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { LINES } from '../dist/math.mjs';

const html = readFileSync(new URL('../v3/index.html',import.meta.url),'utf8');
const start = html.indexOf('function selectWaitingLine(positions)');
const end = html.indexOf('function focusWaitingLines()',start);
assert.ok(start>0 && end>start,'v3 should include single-line selection');
const snippet = html.slice(start,end);
const selectWaitingLine = vm.runInNewContext(snippet+';selectWaitingLine',{LINES});

test('15 drawn with one missing tile retains exactly 6 cells / drops the other 30',()=>{
 const selected=[0,1,2,3,4,6,8,10,13,15,17,20,22,25,27];
 const survivor=selectWaitingLine(selected);
 assert.deepEqual(Array.from(survivor),[0,1,2,3,4,5]);
 assert.equal(new Set(survivor).size,6);
 assert.equal(36-new Set(survivor).size,30);
});
test('not waiting / two distinct waits => no single-line collapse',()=>{
 assert.equal(selectWaitingLine([0,1,2,3]),null);
 assert.equal(selectWaitingLine([0,1,2,3,4,6,7,8,9,10]),null);
});
test('one missing tile shared by two lines keeps one full six-cell line',()=>{
 const line=selectWaitingLine([1,2,3,4,5,6,12,18,24,30]);
 assert.equal(Array.from(line).length,6);
 assert.deepEqual(Array.from(line),[0,1,2,3,4,5]);
});
test('v3 standalone script is valid javascript and physics fall is present',()=>{
 const script=html.match(/<script type="module">([\\s\\S]*?)<\\/script>/)?.[1];
 assert.ok(script,'standalone inline module');
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.match(html,/--fall-y/);
 assert.match(html,/bonus-tile-fall/);
});
