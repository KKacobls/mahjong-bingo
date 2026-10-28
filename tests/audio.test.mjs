import test from 'node:test';
import assert from 'node:assert/strict';
import { createTileAudio } from '../dist/audio.mjs';

test('audio waits for interaction, limits overlapping voices, and respects mute', () => {
  const previous = globalThis.AudioContext;
  const nodes = [];
  let created = 0;
  const parameter = () => ({value:0,setValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(){}});
  const node = () => {
    const value = {gain:parameter(),frequency:parameter(),Q:parameter(),playbackRate:parameter(),threshold:parameter(),ratio:parameter(),connect(target){return target;},disconnect(){},start(){this.started=true;},stop(){this.stopped=true;}};
    nodes.push(value);
    return value;
  };
  globalThis.AudioContext = class {
    constructor(){created+=1;this.currentTime=0;this.state='running';this.sampleRate=8000;this.destination=node();}
    createGain(){return node();}
    createDynamicsCompressor(){return node();}
    createBuffer(){return {getChannelData:()=>new Float32Array(640)};}
    createBufferSource(){return node();}
    createBiquadFilter(){return node();}
    createOscillator(){return node();}
  };
  try {
    const audio = createTileAudio();
    audio.play('pick');
    assert.equal(created,0);
    audio.unlock();
    assert.equal(created,1);
    for(let i=0;i<100;i+=1) audio.play('place');
    const playing = nodes.filter(value=>value.started);
    assert.equal(playing.length,24);
    audio.setEnabled(false);
    assert.ok(playing.every(value=>value.stopped));
    audio.play('win');
    assert.equal(nodes.filter(value=>value.started).length,24);
    for(const value of playing) value.onended();
    audio.setEnabled(true);
    audio.play('win');
    assert.equal(nodes.filter(value=>value.started).length,28);
    audio.stop();
  } finally { globalThis.AudioContext=previous; }
});

test('unsupported audio leaves gameplay callable', () => {
  const previous = globalThis.AudioContext;
  const previousWebkit = globalThis.webkitAudioContext;
  globalThis.AudioContext=undefined;
  globalThis.webkitAudioContext=undefined;
  try {
    const audio=createTileAudio();
    assert.doesNotThrow(()=>{audio.unlock();audio.play('shuffle');audio.stop();});
  } finally {globalThis.AudioContext=previous;globalThis.webkitAudioContext=previousWebkit;}
});
