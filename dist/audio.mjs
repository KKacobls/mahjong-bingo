export function createTileAudio() {
  let context;
  let master;
  let noise;
  let enabled = true;
  let lastImpact = -1;
  const voices = new Set();
  const db = value => 10 ** (value / 20);

  function unlock() {
    if (!enabled) return;
    try {
      if (!context) {
        const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Audio) return;
        context = new Audio();
        master = context.createGain();
        master.gain.value = db(-9);
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -10;
        limiter.ratio.value = 12;
        master.connect(limiter).connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * .08), context.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Audio support must never block gameplay. */ }
  }

  function voice(source, filter, duration, volume, delay = 0) {
    if (voices.size >= 24) return;
    const start = context.currentTime + delay;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(db(volume), start + .003);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter).connect(envelope).connect(master);
    voices.add(source);
    source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); voices.delete(source); };
    source.start(start);
    source.stop(start + duration + .01);
  }

  function tap(volume = -9, delay = 0, pitch = 1) {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = pitch * (.93 + Math.random() * .14);
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1700 + Math.random() * 900;
    filter.Q.value = 1.5;
    voice(source, filter, .055, volume, delay);
    const body = context.createOscillator();
    body.frequency.setValueAtTime(780 * pitch, context.currentTime + delay);
    body.frequency.exponentialRampToValueAtTime(310 * pitch, context.currentTime + delay + .045);
    voice(body, context.createGain(), .06, volume - 9, delay);
  }

  function play(event) {
    if (!enabled || !context || context.state !== 'running') return;
    if (event === 'shuffle') {
      if (context.currentTime - lastImpact < .075) return;
      lastImpact = context.currentTime;
      tap(-17, 0, .85);
      tap(-21, .024, 1.2);
    } else if (event === 'win' || event === 'replay') {
      const notes = event === 'win' ? [523.25, 659.25, 783.99, 1046.5] : [587.33, 783.99];
      notes.forEach((frequency, index) => {
        const source = context.createOscillator();
        source.type = 'sine';
        source.frequency.value = frequency;
        voice(source, context.createGain(), .32, -17, index * .09);
      });
    } else tap(event === 'place' ? -7 : -12, 0, event === 'flip' ? 1.4 : 1);
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    if (master) master.gain.setTargetAtTime(enabled ? db(-9) : 0, context.currentTime, .01);
    if (!enabled) for (const source of voices) { try { source.stop(); } catch { /* Already ended. */ } }
  }
  function stop() { for (const source of voices) { try { source.stop(); } catch { /* Already ended. */ } } }
  return { unlock, play, setEnabled, stop };
}
