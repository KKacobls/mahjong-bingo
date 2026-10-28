import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedProbabilityRows, FIXED_SAMPLE_COUNT } from '../v2/fixed-probabilities.mjs';

test('fixed probability table has 6–30 draws and exact direct-win rate',()=>{
  const rows = fixedProbabilityRows();
  assert.equal(rows.length,25);
  assert.deepEqual(rows.map(r=>r.draws),Array.from({length:25},(_,i)=>i+6));
  assert.ok(Math.abs(rows.find(r=>r.draws===15).win-0.03582649190613709)<1e-10);
  assert.equal(FIXED_SAMPLE_COUNT,2000000);
});

test('same settings return identical frozen probability rows without simulation',()=>{
  const a=fixedProbabilityRows({bonus:5,doubleReplay:true});
  const b=fixedProbabilityRows({bonus:5,doubleReplay:true});
  assert.strictEqual(a,b);
  assert.ok(Object.isFrozen(a[0]));
  const row=a.find(r=>r.draws===15);
  assert.ok(Math.abs(row.replay-0.13343)<0.001);
  assert.ok(Math.abs(row.eventual-0.04134)<0.001);
});

test('precomputed settings cover full bonus range and both double-wait modes',()=>{
  for(const doubleReplay of [false,true]){
    for(let bonus=0;bonus<=35;bonus++){
      const rows=fixedProbabilityRows({bonus,doubleReplay});
      assert.equal(rows.length,25);
      for(const row of rows){
        assert.ok(row.win>=0&&row.win<=1);
        assert.ok(row.replay>=0&&row.replay<=1);
        assert.ok(row.eventual>=0&&row.eventual<=1);
      }
    }
  }
  for(let draws=6;draws<=30;draws++){
    const a=fixedProbabilityRows({bonus:0,doubleReplay:false})[draws-6];
    assert.equal(a.replay,0);
    const noDouble=fixedProbabilityRows({bonus:5,doubleReplay:false})[draws-6].replay;
    const double=fixedProbabilityRows({bonus:5,doubleReplay:true})[draws-6].replay;
    assert.ok(double>=noDouble-1e-12);
  }
});
