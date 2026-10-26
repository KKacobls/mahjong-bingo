import test from 'node:test';
import assert from 'node:assert/strict';
import { LINES, analyze, exactWinProbability, combination, economics, bonusProbability, seededRandom, shuffled, simulate } from '../dist/math.mjs';

test('14 unique lines, six distinct cells per line', () => {
  assert.equal(LINES.length, 14);
  assert.equal(new Set(LINES.map(line => [...line].sort((a,b) => a-b).join(','))).size, 14);
  assert.ok(LINES.every(line => new Set(line).size === 6));
});
test('inclusion exclusion matches exact six and seven tile counts', () => {
  assert.equal(exactWinProbability(5), 0);
  assert.ok(Math.abs(exactWinProbability(6) - 14 / combination(36, 6)) < 1e-14);
  assert.ok(Math.abs(exactWinProbability(7) - 14 * 30 / combination(36, 7)) < 1e-14);
  assert.equal(exactWinProbability(36), 1);
  assert.ok(exactWinProbability(15) < 14 * combination(30, 9) / combination(36,15));
});
test('two lines missing the same cell count as only one target', () => {
  const info = analyze([1,2,3,4,5,6,12,18,24,30]);
  assert.deepEqual(info.targets, [0]);
  assert.equal(info.complete.length, 0);
  assert.equal(analyze([0,1,2,3,4,5]).complete.length, 1);
});
test('bonus draw is without replacement', () => {
  assert.ok(Math.abs(bonusProbability(21,1,5) - 5/21) < 1e-14);
  assert.ok(Math.abs(bonusProbability(21,2,5) - (1-combination(19,5)/combination(21,5))) < 1e-14);
  assert.equal(bonusProbability(21,1,0),0);
});
test('free replays form a geometric series and package EV counts every purchased game', () => {
  const value = economics({ win: .04, replay: .2, games: 6, price: 100, prize: 300 });
  assert.ok(Math.abs(value.eventual - .05) < 1e-14);
  assert.ok(Math.abs(value.net + 10) < 1e-12);
  assert.ok(Math.abs(value.packageWin - (1 - .95 ** 6)) < 1e-12);
  assert.equal(value.expectedRounds, 7.5);
});
test('seed reproduces a permutation with no duplicate or missing tiles', () => {
  const ids = Array.from({length:36},(_,i)=>i);
  assert.deepEqual(shuffled(ids,seededRandom('hello')), shuffled(ids,seededRandom('hello')));
  assert.equal(new Set(shuffled(ids,seededRandom('hello'))).size,36);
});
test('simulation matches exact win and rules affect replay only', () => {
  const a = simulate({ samples: 120000, seed: 'verification', bonus: 5, doubleReplay: true });
  const b = simulate({ samples: 120000, seed: 'verification', bonus: 0, doubleReplay: false });
  for (let i = 5; i < 30; i += 1) {
    const row = a[i];
    const error = Math.sqrt(row.win * (1 - row.win) / row.samples);
    assert.ok(Math.abs(row.sampledWin - row.win) < 6 * error);
    assert.equal(b[i].replay, 0);
    assert.equal(a[i].sampledWin,b[i].sampledWin);
    assert.ok(row.replay >= 0 && row.replay <= 1 - row.win + .01);
  }
});
