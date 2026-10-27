export const TILE_COUNT = 36;
export const LINES = [
  ...Array.from({ length: 6 }, (_, row) => Array.from({ length: 6 }, (_, col) => row * 6 + col)),
  ...Array.from({ length: 6 }, (_, col) => Array.from({ length: 6 }, (_, row) => row * 6 + col)),
  [0, 7, 14, 21, 28, 35], [5, 10, 15, 20, 25, 30],
].filter(line => line.every(position => position < TILE_COUNT));

export function combination(n, k) {
  if (k < 0 || k > n) return 0;
  let result = 1;
  for (let i = 1; i <= Math.min(k, n - k); i += 1) result = result * (n - i + 1) / i;
  return result;
}

export function analyze(positions) {
  const chosen = new Set(positions);
  const complete = [];
  const targets = new Set();
  for (const line of LINES) {
    const missing = line.filter(position => !chosen.has(position));
    if (missing.length === 0) complete.push(line);
    if (missing.length === 1) targets.add(missing[0]);
  }
  return { complete, targets: [...targets] };
}

export function bonusProbability(remaining, targets, bonus) {
  if (targets === 0 || bonus === 0) return 0;
  let miss = 1;
  for (let i = 0; i < Math.min(bonus, remaining); i += 1) miss *= Math.max(0, remaining - targets - i) / (remaining - i);
  return 1 - miss;
}

let coefficients;
export function exactWinProbability(draws) {
  if (!coefficients) {
    coefficients = new Float64Array(TILE_COUNT + 1);
    const unions = Array(1 << LINES.length).fill(0n);
    const signs = new Int8Array(1 << LINES.length);
    const masks = LINES.map(line => line.reduce((mask, position) => mask | (1n << BigInt(position)), 0n));
    signs[0] = -1;
    for (let subset = 1; subset < (1 << LINES.length); subset += 1) {
      const bit = subset & -subset;
      const previous = subset ^ bit;
      unions[subset] = unions[previous] | masks[Math.log2(bit)];
      signs[subset] = -signs[previous];
      let value = unions[subset];
      let size = 0;
      while (value) { value &= value - 1n; size += 1; }
      coefficients[size] += signs[subset];
    }
  }
  if (!Number.isInteger(draws) || draws < 0 || draws > TILE_COUNT) return 0;
  return Math.max(0, Math.min(1, coefficients.reduce((sum, coefficient, size) => sum + coefficient * combination(TILE_COUNT - size, draws - size), 0) / combination(TILE_COUNT, draws)));
}

let conditionalMasks;
function bitCount(value) {
  value -= (value >>> 1) & 0x55555555;
  value = (value & 0x33333333) + ((value >>> 2) & 0x33333333);
  return (((value + (value >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
}

export function conditionalWinProbability(knownPositions, draws) {
  const known=[...new Set(knownPositions)];
  if (!Number.isInteger(draws) || draws<known.length || draws>TILE_COUNT || known.some(p=>!Number.isInteger(p)||p<0||p>=TILE_COUNT)) return 0;
  if (analyze(known).complete.length) return 1;
  const left=draws-known.length;
  if (!left) return 0;
  if (!known.length) return exactWinProbability(draws);
  if (!conditionalMasks) {
    const size=1<<LINES.length;
    const low=new Uint32Array(size);
    const high=new Uint32Array(size);
    const signs=new Int8Array(size);
    signs[0]=-1;
    const lineLow=LINES.map(line=>line.reduce((mask,p)=>p<32?mask|(1<<p):mask,0));
    const lineHigh=LINES.map(line=>line.reduce((mask,p)=>p>=32?mask|(1<<(p-32)):mask,0));
    for(let subset=1;subset<size;subset+=1) {
      const bit=subset&-subset;
      const previous=subset^bit;
      const index=Math.log2(bit);
      low[subset]=low[previous]|lineLow[index];
      high[subset]=high[previous]|lineHigh[index];
      signs[subset]=-signs[previous];
    }
    conditionalMasks={low,high,signs};
  }
  let knownLow=0;
  let knownHigh=0;
  for(const p of known) { if(p<32)knownLow|=1<<p;else knownHigh|=1<<(p-32); }
  const counts=new Int32Array(TILE_COUNT+1);
  const {low,high,signs}=conditionalMasks;
  for(let subset=1;subset<low.length;subset+=1) counts[bitCount(low[subset]&~knownLow)+bitCount(high[subset]&~knownHigh)]+=signs[subset];
  let probability=0;
  let weight=1;
  for(let size=0;size<=left;size+=1) {
    if(size>0)weight*= (left-size+1)/(TILE_COUNT-known.length-size+1);
    probability+=counts[size]*weight;
  }
  return Math.max(0,Math.min(1,probability));
}

export function economics({ win, replay, games, price, prize }) {
  const eventual = Math.min(1, win / (1 - replay));
  return {
    eventual,
    packageWin: -Math.expm1(games * Math.log1p(-eventual)),
    expectedPrizes: games * eventual,
    net: games * eventual * prize - price,
    fairPrize: eventual > 0 ? price / (games * eventual) : Infinity,
    expectedRounds: games / (1 - replay),
  };
}

export function seededRandom(seed) {
  let state = 2166136261;
  for (const char of String(seed)) state = Math.imul(state ^ char.charCodeAt(0), 16777619);
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(values, random = Math.random) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function simulate({ samples = 300000, doubleReplay = true, bonus = 5, seed = 'chance-lab-v1' }, progress = () => {}) {
  const random = seededRandom(seed);
  const deck = Array.from({ length: TILE_COUNT }, (_, i) => i);
  const selected = new Uint8Array(TILE_COUNT);
  const counts = new Uint8Array(LINES.length);
  const membership = Array.from({ length: TILE_COUNT }, (_, i) => LINES.flatMap((line, index) => line.includes(i) ? [index] : []));
  const totals = Array.from({ length: TILE_COUNT }, () => ({ win: 0, replay: 0, replaySquared: 0, waiting: 0, double: 0 }));
  for (let sample = 0; sample < samples; sample += 1) {
    selected.fill(0);
    counts.fill(0);
    for (let drawn = 0; drawn < TILE_COUNT; drawn += 1) {
      const j = drawn + Math.floor(random() * (TILE_COUNT - drawn));
      [deck[drawn], deck[j]] = [deck[j], deck[drawn]];
      const position = deck[drawn];
      selected[position] = 1;
      for (const index of membership[position]) counts[index] += 1;
      if (drawn < 4) continue;
      const target = totals[drawn];
      if (counts.includes(6)) { target.win += 1; continue; }
      const missing = new Set();
      for (let index = 0; index < LINES.length; index += 1) {
        if (counts[index] === 5) missing.add(LINES[index].find(cell => !selected[cell]));
      }
      if (missing.size > 0) target.waiting += 1;
      if (missing.size >= 2) target.double += 1;
      const replay = doubleReplay && missing.size >= 2 ? 1 : bonusProbability(TILE_COUNT - 1 - drawn, missing.size, bonus);
      target.replay += replay;
      target.replaySquared += replay * replay;
    }
    if (sample % 30000 === 0) progress(sample / samples);
  }
  return totals.map((total, index) => {
    const replay = total.replay / samples;
    const standardError = Math.sqrt(Math.max(0, total.replaySquared / samples - replay * replay) / samples);
    return { draws: index + 1, win: exactWinProbability(index + 1), sampledWin: total.win / samples, replay, standardError, waiting: total.waiting / samples, double: total.double / samples, samples };
  });
}
