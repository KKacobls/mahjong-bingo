import test from 'node:test';
import assert from 'node:assert/strict';
import {createBodies,stepBodies} from '../dist/shuffle.mjs';
import {seededRandom} from '../dist/math.mjs';

test('rotating tiles stay finite and inside the pool on phone and desktop',()=>{
  for(const width of [285,620]) {
    const height = width < 300 ? 240 : 280;
    const tileWidth = Math.min(38,width/13);
    const bodies=createBodies({count:36,width,height,tileWidth,tileHeight:tileWidth*1.4,random:seededRandom(`pool-${width}`)});
    for(let i=0;i<480;i+=1) stepBodies(bodies,{width,height,dt:1/120,time:i/120,driving:i<280});
    for(const body of bodies) {
      assert.ok([body.x,body.y,body.vx,body.vy,body.angle,body.spin].every(Number.isFinite));
      assert.ok(body.x>=body.halfWidth*.7 && body.x<=width-body.halfWidth*.7);
      assert.ok(body.y>=body.halfWidth*.7 && body.y<=height-body.halfWidth*.7);
    }
    assert.ok(new Set(bodies.map(b=>b.angle.toFixed(2))).size>25);
  }
});
