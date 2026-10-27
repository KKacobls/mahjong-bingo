import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLiveStats,purchaseGames,beginPlayedRound,completePlayedRound,normalizeLiveStats} from '../dist/live.mjs';
import {conditionalWinProbability,exactWinProbability} from '../dist/math.mjs';

test('payment charges one complete package; playing consumes credit but never charges again',()=>{
  let s=emptyLiveStats();
  assert.equal(beginPlayedRound(s),null);
  s=purchaseGames(s,6,100);
  assert.equal(s.spent,100);
  assert.equal(s.credits,6);
  s=beginPlayedRound(s);
  s=completePlayedRound(s,'won');
  assert.equal(s.spent,100);
  assert.equal(s.credits,5);
  assert.deepEqual(s.lastWin,{round:1,spent:100});
  assert.equal(s.wins/s.completed,1);
});
test('free replay does not spend a purchased credit and real win rate uses completed attempts',()=>{
  let s=purchaseGames(emptyLiveStats(),1,100);
  s=completePlayedRound(beginPlayedRound(s),'replay');
  assert.equal(s.credits,0);
  s=beginPlayedRound(s);
  assert.ok(s);
  assert.equal(s.paid,1);
  assert.equal(s.spent,100);
  s=completePlayedRound(s,'won');
  assert.equal(s.completed,2);
  assert.equal(s.wins/s.completed,.5);
  assert.equal(s.replays,1);
  assert.equal(beginPlayedRound(s),null);
  assert.deepEqual(normalizeLiveStats(JSON.parse(JSON.stringify(s))),s);
});
test('new prices apply only to the next purchase',()=>{
  let s=purchaseGames(emptyLiveStats(),6,100);
  s=purchaseGames(s,2,80);
  assert.equal(s.spent,180);
  assert.equal(s.credits,8);
  assert.equal(s.points.at(-1).spent,180);
});
test('current chance uses revealed information and deduplicates the same missing tile',()=>{
  assert.equal(conditionalWinProbability([],15),exactWinProbability(15));
  assert.ok(Math.abs(conditionalWinProbability([0,1,2,3,4],6)-1/31)<1e-12);
  assert.equal(conditionalWinProbability([0,1,2,3,4,5],15),1);
  assert.equal(conditionalWinProbability([0,1,8,9,16,17],6),0);
  assert.ok(Math.abs(conditionalWinProbability([1,2,3,4,5,6,12,18,24,30],11)-1/26)<1e-12);
});
