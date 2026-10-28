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

test('U-shape obstacle and mobile tilt keep tiles outside board',()=>{
 const width=360,height=420,obstacle={left:65,right:295,top:95,bottom:390};
 const bodies=createBodies({count:36,width,height,tileWidth:22,tileHeight:31,random:seededRandom('u-shape')});
 for(let i=0;i<360;i++)stepBodies(bodies,{width,height,dt:1/120,obstacle,gravity:{x:Math.sin(i/20)*600,y:Math.cos(i/25)*500}});
 for(const b of bodies){
  const ex=Math.abs(Math.cos(b.angle))*b.halfWidth+Math.abs(Math.sin(b.angle))*b.halfHeight+2;
  const ey=Math.abs(Math.sin(b.angle))*b.halfWidth+Math.abs(Math.cos(b.angle))*b.halfHeight+2;
  assert.ok(b.x+ex<=obstacle.left||b.x-ex>=obstacle.right||b.y+ey<=obstacle.top||b.y-ey>=obstacle.bottom);
  assert.ok(b.x>=ex-.1&&b.x<=width-ex+.1);assert.ok(b.y>=ey-.1&&b.y<=height-ey+.1);
 }
 bodies[0].picked=true;const p=[bodies[0].x,bodies[0].y];
 for(let i=0;i<24;i++)stepBodies(bodies,{width,height,dt:1/120,obstacle,gravity:{x:800,y:800}});
 assert.deepEqual([bodies[0].x,bodies[0].y],p);
});
