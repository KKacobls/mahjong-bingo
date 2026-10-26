import { analyze, exactWinProbability, economics, TILE_COUNT } from './math.mjs';
import { createBodies, stepBodies } from './shuffle.mjs';
import { loadLocalData, upsertRecord, saveLocalData, clearLocalData, validBoard } from './records.mjs';

const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['draws','games','price','prize','bonus','double-replay','auto-place','appearance','seed','lock-seed','board','pool','tray','tray-section','status-title','status-detail','draw-counter','round-label','pool-count','seed-label','new-round','auto-draw','place-all','eventual','direct','replay-prob','package-win','fair-prize','net','net-note','ev-label','compute-state','estimate-note','bar-win','bar-replay','comparison-body','config-error','run-simulation','toast'].map(id => [id, $(id)]));
const ids = Array.from({ length: TILE_COUNT }, (_, i) => i);
const names = [...['萬','筒','索'].flatMap(suit => Array.from({ length: 9 }, (_, i) => `${i + 1}${suit}`)), '東','南','西','北','白','發','中','紅五萬','紅五條'];
const images = [...['Man','Pin','Sou'].flatMap(suit => Array.from({ length: 9 }, (_, i) => `tiles/${suit}${i + 1}.png`)), ...['Ton','Nan','Shaa','Pei','Haku','Hatsu','Chun','Man5-Dora','Sou5-Dora'].map(name => `tiles/${name}.png`)];
const money = value => `NT$ ${new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(value)}`;
const percent = value => `${(value * 100).toFixed(2)}%`;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let board = [];
let deck = [];
let roundSeed = '';
let roundNumber = 0;
let selected = [];
let placed = new Set();
let revealed = new Set();
let phase = 'initial';
let baseTargets = [];
let bonusCount = 0;
let activeTile = null;
let isDrawing = false;
let generation = 0;
let stats = null;
let worker = null;
let simulationNumber = 0;
let simulationTimer;
let toastTimer;
let drag = null;
let suppressClickUntil = 0;
let flightNodes = new Set();
let shuffleFrame = 0;
let finishShuffle = null;
let poolBodies = [];
let poolWidth = 0;
let poolHeight = 0;
const placementAnimations = new Set();
let isRunning = false;
let runGeneration = 0;
let runResult = null;
let localData = {version:1,preferences:{},history:[]};
let currentRecordId = null;
let roundStartedAt = '';
let roundPreferences = null;
let recordTimer;
const preferenceIds = ['draws','games','price','prize','bonus','double-replay','auto-place','no-shuffle','appearance','lock-seed','seed','run-mode','run-count','run-speed'];

function readPreferences() {
  return Object.fromEntries(preferenceIds.map(id => {
    const input = $(id);
    return [id, input.type === 'checkbox' ? input.checked : input.value];
  }));
}

function restorePreferences(preferences) {
  for (const id of preferenceIds) {
    const input = $(id);
    const value = preferences[id];
    if (input.type === 'checkbox') {
      if (typeof value === 'boolean') input.checked = value;
    } else if (typeof value === 'string') {
      if (input.tagName === 'SELECT' && ![...input.options].some(option => option.value === value)) continue;
      input.value = value.slice(0, 64);
      if (!input.checkValidity()) input.value = input.defaultValue;
    }
  }
  $('run-count-field').hidden = $('run-mode').value === 'win';
  $('run-count').disabled = $('run-mode').value === 'win';
}

function persistLocalData() {
  let saved = false;
  try { saved = saveLocalData(localStorage, localData); } catch { /* Storage access may be disabled. */ }
  $('storage-status').textContent = saved ? '設定與最近 100 局只存於此瀏覽器。' : '此瀏覽器無法儲存本機紀錄。';
  return saved;
}

function renderHistory() {
  $('history-count').textContent = `${localData.history.length} 局`;
  const fragment = document.createDocumentFragment();
  const labels = {initial:'進行中',bonus:'補摸中',won:'中獎',lost:'未中獎',replay:'免費重來'};
  for (const record of [...localData.history].reverse().slice(0, 10)) {
    const row = document.createElement('div');
    row.className = 'history-row';
    const text = document.createElement('span');
    const stamp = new Intl.DateTimeFormat('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(record.startedAt));
    text.textContent = `${stamp}　${record.draws} 張　${labels[record.phase] || '進行中'}`;
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.className = 'text-button';
    replay.dataset.recordId = record.id;
    replay.textContent = '重現';
    row.append(text, replay);
    fragment.append(row);
  }
  if (!localData.history.length) {
    const empty = document.createElement('p');
    empty.className = 'field-note';
    empty.textContent = '尚無紀錄';
    fragment.append(empty);
  }
  $('history-list').replaceChildren(fragment);
}

function recordCurrentRound() {
  clearTimeout(recordTimer);
  if (!currentRecordId || !validBoard(board) || !['initial','bonus','won','lost','replay'].includes(phase)) return;
  localData.history = upsertRecord(localData.history, {
    id:currentRecordId,startedAt:roundStartedAt,seed:roundSeed,board:[...board],
    draws:Number(roundPreferences?.draws || settings().draws),phase,selected:[...selected],placed:[...placed],
    preferences:roundPreferences || readPreferences(),
  });
  persistLocalData();
  renderHistory();
}

function scheduleRecord() {
  clearTimeout(recordTimer);
  recordTimer = setTimeout(recordCurrentRound, 150);
}

function settings() {
  return { draws: Number(ui.draws.value), games: Number(ui.games.value), price: Number(ui.price.value), prize: Number(ui.prize.value), bonus: Number(ui.bonus.value), doubleReplay: ui['double-replay'].checked };
}
function validSettings() { return $('settings-form').checkValidity(); }
function say(text) {
  ui.toast.textContent = text;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2400);
}
function randomSeed() { return [...crypto.getRandomValues(new Uint32Array(8))].map(n => n.toString(16).padStart(8, '0')).join(''); }
function secureRandom() { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; }

async function deckForSeed(seed) {
  const bytes = new TextEncoder();
  const buffers = await Promise.all(Array.from({ length: 8 }, (_, index) => crypto.subtle.digest('SHA-256', bytes.encode(`${seed}:${index}`))));
  const values = buffers.flatMap(buffer => [...new Uint32Array(buffer)]);
  let cursor = 0;
  const result = [...ids];
  for (let i = TILE_COUNT - 1; i > 0; i -= 1) {
    const range = i + 1;
    const limit = Math.floor(4294967296 / range) * range;
    let value = values[cursor++];
    while (value >= limit) value = values[cursor++];
    if (value === undefined) throw new Error('洗牌亂數不足，請重新開局。');
    const j = value % range;
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function face(id) {
  const element = document.createElement(images[id] && ui.appearance.value === 'mahjong' ? 'img' : 'span');
  if (ui.appearance.value === 'numbers') {
    element.className = 'number-face';
    element.textContent = String(id + 1).padStart(2, '0');
  } else if (images[id]) {
    element.className = 'tile-face';
    element.src = `assets/${images[id]}`;
    element.alt = names[id];
    element.draggable = false;
  }
  return element;
}
function tileName(id) { return ui.appearance.value === 'numbers' ? `${id + 1} 號` : names[id]; }

function renderBoard() {
  const fragment = document.createDocumentFragment();
  for (const [position, id] of board.entries()) {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cell';
    cell.dataset.position = String(position);
    cell.dataset.id = String(id);
    cell.setAttribute('aria-label', `${String.fromCharCode(65 + position % 6)}${Math.floor(position / 6) + 1}，${tileName(id)}，未放置`);
    cell.append(face(id));
    fragment.append(cell);
  }
  for (let position = board.length; position < 36; position += 1) {
    const empty = document.createElement('div');
    empty.className = 'cell void';
    empty.setAttribute('aria-label', '空格，不參與連線');
    fragment.append(empty);
  }
  ui.board.replaceChildren(fragment);
  updateBoard();
}
function updateBoard() {
  const positions = [...placed].map(id => board.indexOf(id));
  const info = analyze(positions);
  const winning = new Set(info.complete.flat());
  const targets = new Set(info.targets);
  for (const [position, cell] of [...ui.board.children].entries()) {
    const id = board[position];
    if (id === undefined) continue;
    cell.classList.toggle('placed', placed.has(id));
    cell.classList.toggle('winning', winning.has(position));
    cell.classList.toggle('waiting', !winning.size && targets.has(position));
    cell.setAttribute('aria-label', `${String.fromCharCode(65 + position % 6)}${Math.floor(position / 6) + 1}，${tileName(id)}，${placed.has(id) ? '已放置' : '未放置'}`);
  }
}
function renderPool() {
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < TILE_COUNT; index += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'back-tile';
    button.dataset.index = String(index);
    button.setAttribute('aria-label', `選第 ${index + 1} 張牌背`);
    fragment.append(button);
  }
  ui.pool.replaceChildren(fragment);
  layoutPool(true);
}

function paintPool() {
  for (const [index, body] of poolBodies.entries()) {
    const tile = ui.pool.children[index];
    if (!tile) continue;
    tile.style.setProperty('--tile-x', `${body.x - body.halfWidth}px`);
    tile.style.setProperty('--tile-y', `${body.y - body.halfHeight}px`);
    tile.style.setProperty('--tile-angle', `${body.angle}rad`);
    tile.style.setProperty('--tile-width', `${body.halfWidth * 2}px`);
    tile.style.setProperty('--tile-height', `${body.halfHeight * 2}px`);
  }
}

function layoutPool(reset = false) {
  const width = ui.pool.clientWidth;
  const height = ui.pool.clientHeight;
  if (!width || !height) return;
  const tileWidth = Math.min(38, Math.max(23, width / 13));
  const tileHeight = tileWidth * 1.4;
  if (reset || poolBodies.length !== TILE_COUNT) {
    poolBodies = createBodies({count:TILE_COUNT,width,height,tileWidth,tileHeight,random:secureRandom});
  } else {
    for (const body of poolBodies) {
      body.x *= width / poolWidth;
      body.y *= height / poolHeight;
      body.halfWidth = tileWidth / 2;
      body.halfHeight = tileHeight / 2;
    }
  }
  poolWidth = width;
  poolHeight = height;
  for (let i = 0; i < 100; i += 1) stepBodies(poolBodies,{width,height,dt:1/120});
  paintPool();
}
const poolObserver = new ResizeObserver(() => {
  if (ui.pool.clientWidth !== poolWidth || ui.pool.clientHeight !== poolHeight) layoutPool();
});
poolObserver.observe(ui.pool);
function renderTray() {
  const pending = selected.filter(id => !placed.has(id));
  ui['place-all'].hidden = pending.length === 0;
  $('reveal-all').hidden = !pending.some(id => !revealed.has(id));
  const fragment = document.createDocumentFragment();
  for (const id of pending) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = revealed.has(id) ? 'hand-tile' : 'hand-tile back-tile unrevealed';
    button.classList.toggle('active', id === activeTile);
    button.dataset.id = String(id);
    button.setAttribute('aria-label', revealed.has(id) ? `手上的${tileName(id)}，選取後點底盤相同牌面` : `翻開第 ${selected.indexOf(id) + 1} 張手牌`);
    button.setAttribute('aria-pressed', String(id === activeTile));
    if (revealed.has(id)) button.append(face(id));
    fragment.append(button);
  }
  if (!pending.length) {
    const empty = document.createElement('span');
    empty.className = 'tray-empty';
    empty.textContent = selected.length ? '已擺好' : '點上方牌背，或拖到這裡';
    fragment.append(empty);
  }
  ui.tray.replaceChildren(fragment);
}
function updateControls() {
  const config = settings();
  const limit = config.draws + bonusCount;
  ui['draw-counter'].textContent = `${selected.length} / ${limit}`;
  ui['pool-count'].textContent = `${TILE_COUNT - selected.length} 張`;
  const canPick = (phase === 'initial' || phase === 'bonus') && selected.length < limit;
  for (const button of ui.pool.children) button.disabled = button.classList.contains('picked') || !canPick;
  ui['auto-draw'].disabled = !canPick || isDrawing || isRunning;
  ui['place-all'].disabled = isRunning;
  $('reveal-all').disabled = isRunning;
  ui['auto-draw'].textContent = phase === 'bonus' ? `補摸 ${Math.max(0, limit - selected.length)} 張` : '隨機選滿';
  scheduleRecord();
}
function status(title, detail) {
  ui['status-title'].textContent = title;
  ui['status-detail'].textContent = detail;
}
function finishRound(nextPhase, title, detail) {
  phase = nextPhase;
  status(title, detail);
  ui['new-round'].textContent = nextPhase === 'replay' ? '↻ 免費重來' : '↻ 洗牌';
  updateControls();
  recordCurrentRound();
}
function checkRound() {
  updateBoard();
  renderTray();
  updateControls();
  const config = settings();
  const limit = config.draws + bonusCount;
  if (!['initial','bonus'].includes(phase)) return;
  if (selected.length < limit) {
    if (phase === 'initial') status(`已選 ${selected.length} / ${config.draws} 張`, ui['auto-place'].checked ? '自動擺牌' : '下方點手牌翻開，再拖到對應位置');
    return;
  }
  if (placed.size < selected.length) {
    status(isRunning ? `已擺 ${placed.size} / ${selected.length} 張` : '已選滿，請翻牌擺放', `剩 ${selected.length - placed.size} 張`);
    return;
  }
  if (phase === 'bonus') {
    const hit = baseTargets.some(id => selected.slice(config.draws).includes(id));
    finishRound(hit ? 'replay' : 'lost', hit ? '補中，免費重來' : '補摸未中', '');
    return;
  }
  const info = analyze(selected.map(id => board.indexOf(id)));
  if (info.complete.length) {
    finishRound('won', `中獎 · ${info.complete.length} 條線`, '獎品一份');
  } else if (config.doubleReplay && info.targets.length >= 2) {
    finishRound('replay', `聽 ${info.targets.length} 張，免費重來`, '');
  } else if (info.targets.length && config.bonus > 0) {
    phase = 'bonus';
    baseTargets = info.targets.map(position => board[position]);
    bonusCount = Math.min(config.bonus, TILE_COUNT - config.draws);
    status(`聽牌，補摸 ${bonusCount} 張`, `等 ${baseTargets.map(tileName).join('、')}`);
    updateControls();
  } else {
    finishRound('lost', '未中獎', '');
  }
}

async function animatePlacement(id, source, { duration = 260 } = {}) {
  const cell = ui.board.children[board.indexOf(id)];
  cell.classList.remove('just-placed');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !source) { cell.classList.add('just-placed'); return; }
  const from = source.getBoundingClientRect();
  const to = cell.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'hand-tile drag-ghost';
  ghost.append(face(id));
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  document.body.append(ghost);
  flightNodes.add(ghost);
  cell.classList.add('receiving');
  const animation = ghost.animate([{ transform: 'translate(0,0) rotate(-5deg)', opacity: 1 },{ transform: `translate(${to.left - from.left}px,${to.top - from.top}px) rotate(0deg)`, opacity: 1 }], { duration, easing: 'cubic-bezier(.2,.7,.3,1)' });
  placementAnimations.add(animation);
  try {
    await animation.finished;
    cell.classList.add('just-placed');
  } catch (error) {
    if (error.name !== 'AbortError') throw error;
  } finally {
    ghost.remove();
    flightNodes.delete(ghost);
    placementAnimations.delete(animation);
    cell.classList.remove('receiving');
  }
}
function pick(index, { holdInHand = false } = {}) {
  const button = ui.pool.children[index];
  if (!button || button.disabled || !['initial','bonus'].includes(phase)) return;
  const id = deck[index];
  selected = [...selected, id];
  if (!holdInHand && (ui['auto-place'].checked || isRunning)) {
    revealed.add(id);
    placed.add(id);
    animatePlacement(id, button);
  }
  button.classList.add('picked');
  button.disabled = true;
  button.setAttribute('aria-label', `第 ${index + 1} 張牌已選`);
  checkRound();
  if (holdInHand || (!ui['auto-place'].checked && !isRunning)) animateToHand(id, button);
}
function placeTile(id, position, source = null) {
  if (!selected.includes(id) || placed.has(id) || !revealed.has(id)) return;
  if (board[position] !== id) { say('放到相同的牌面，才算完成擺牌。'); return; }
  placed.add(id);
  activeTile = null;
  animatePlacement(id, source);
  checkRound();
}
function placeAll() {
  for (const id of selected) { revealed.add(id); placed.add(id); }
  activeTile = null;
  checkRound();
}
function animateToHand(id, source) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = [...ui.tray.children].find(node => Number(node.dataset.id) === id);
  if (!target) return;
  const from = source.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'hand-tile back-tile drag-ghost';
  ghost.style.left = `${from.left}px`;
  ghost.style.top = `${from.top}px`;
  document.body.append(ghost);
  flightNodes.add(ghost);
  const animation = ghost.animate([{transform:'translate(0,0)',opacity:1},{transform:`translate(${to.left-from.left}px,${to.top-from.top}px)`,opacity:.4}], {duration:320,easing:'cubic-bezier(.2,.7,.3,1)'});
  animation.finished.then(() => { ghost.remove(); flightNodes.delete(ghost); }).catch(() => ghost.remove());
}

function cancelShuffle() {
  cancelAnimationFrame(shuffleFrame);
  finishShuffle?.();
  finishShuffle = null;
}

async function animateShuffle(duration) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  cancelShuffle();
  const phaseOffset = secureRandom() * 20;
  await new Promise(resolve => {
    finishShuffle = resolve;
    let start;
    let previous;
    let elapsedSimulation = 0;
    const frame = now => {
      start ??= now;
      previous ??= now;
      const elapsed = now - start;
      const dt = Math.min((now - previous) / 1000, .035);
      previous = now;
      const steps = Math.max(1, Math.ceil(dt * 120));
      for (let i = 0; i < steps; i += 1) {
        elapsedSimulation += dt / steps;
        stepBodies(poolBodies,{width:poolWidth,height:poolHeight,dt:dt/steps,time:phaseOffset+elapsedSimulation,driving:elapsed < duration * .66});
      }
      paintPool();
      if (elapsed < duration) { shuffleFrame = requestAnimationFrame(frame); return; }
      for (const body of poolBodies) { body.vx=0; body.vy=0; body.spin=0; }
      finishShuffle = null;
      resolve();
    };
    shuffleFrame = requestAnimationFrame(frame);
  });
}

function updateRunSummary(note = '') {
  if (!runResult) return;
  const cost = runResult.paid * runResult.unitCost;
  const net = runResult.wins * runResult.prize - cost;
  $('run-summary').textContent = `${note ? `${note}\n` : ''}付費 ${runResult.paid} 局 · 重來 ${runResult.replays} 次\n中獎 ${runResult.wins} 次 · 共摸 ${runResult.rounds} 局\n花費 ${money(cost)}\n損益 ${net < 0 ? '−' : '+'}${money(Math.abs(net))}`;
}
function stopRun(note = '已停止') {
  isRunning = false;
  runGeneration += 1;
  $('run-start').disabled = false;
  $('run-stop').hidden = true;
  $('run-stop-table').hidden = true;
  $('table-area').classList.remove('is-running');
  for (const animation of placementAnimations) animation.cancel();
  updateRunSummary(note);
  updateControls();
}

function runTiming() {
  if ($('run-speed').value === 'fast') return { select: 25, flip: 60, move: 110, settle: 40, round: 350 };
  return { select: 90, flip: 180, move: 340, settle: 160, round: 1100 };
}

async function dealAndPlace(indices, token) {
  const isCurrent = () => isRunning && token === runGeneration;
  const hand = [];
  for (const index of indices) {
    if (!isCurrent()) return;
    pick(index, { holdInHand: true });
    hand.push(deck[index]);
    await pause(runTiming().select);
  }
  for (const [index, id] of hand.entries()) {
    if (!isCurrent()) return;
    revealed.add(id);
    activeTile = id;
    renderTray();
    const source = [...ui.tray.children].find(tile => Number(tile.dataset.id) === id);
    const timing = runTiming();
    status(`逐張擺牌 ${index + 1} / ${hand.length}`, tileName(id));
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      source.animate([{ transform: 'rotateY(90deg)' }, { transform: 'rotateY(0deg)' }], { duration: timing.flip });
    }
    await pause(timing.flip);
    if (!isCurrent()) return;
    await animatePlacement(id, source, { duration: timing.move });
    if (!isCurrent()) return;
    placed.add(id);
    activeTile = null;
    checkRound();
    if (index < hand.length - 1) await pause(timing.settle);
  }
}

async function startRun() {
  if (isRunning) return;
  if (!validSettings() || !$('run-count').checkValidity()) { $('settings-form').reportValidity(); return; }
  const mode = $('run-mode').value;
  const limit = Number($('run-count').value);
  if (mode === 'win' && settings().draws < 6) { say('少於 6 張無法連線，請增加摸牌張數。'); return; }
  if (ui['lock-seed'].checked) say('自動跑牌每局使用新種子；固定種子暫不套用。');
  isRunning = true;
  runGeneration += 1;
  const token = runGeneration;
  runResult = { paid:0,rounds:0,wins:0,replays:0,unitCost:settings().price/settings().games,prize:settings().prize };
  $('run-start').disabled = true;
  $('run-stop').hidden = false;
  $('run-stop-table').hidden = false;
  $('table-area').classList.add('is-running');
  $('table-area').scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  let free = false;
  try {
    while (isRunning && token === runGeneration && (mode === 'win' || runResult.paid < limit || free)) {
      await newRound({runner:true});
      if (!isRunning || token !== runGeneration) break;
      const config = settings();
      const order = await deckForSeed(randomSeed());
      if (!isRunning || token !== runGeneration) break;
      if (!free) runResult.paid += 1;
      updateRunSummary('執行中');
      await dealAndPlace(order.slice(0, config.draws), token);
      if (!isRunning || token !== runGeneration) break;
      if (phase === 'bonus') {
        await pause(runTiming().round);
        await dealAndPlace(order.slice(config.draws, config.draws + bonusCount), token);
      }
      if (!isRunning || token !== runGeneration) break;
      runResult.rounds += 1;
      free = phase === 'replay';
      if (free) runResult.replays += 1;
      if (phase === 'won') runResult.wins += 1;
      updateRunSummary('執行中');
      if (mode === 'win' && phase === 'won') break;
      await pause(runTiming().round);
    }
    if (token === runGeneration) stopRun(mode === 'win' && runResult.wins ? '已中獎，停止' : '完成');
  } catch (error) {
    stopRun('執行中斷');
    say(error.message);
  }
}

async function newRound({ reproduce = false, runner = false, replayRecord = null } = {}) {
  if (!runner && isRunning) stopRun();
  if (!validSettings()) { $('settings-form').reportValidity(); return; }
  recordCurrentRound();
  const previousBoard = [...board];
  generation += 1;
  for (const animation of placementAnimations) animation.cancel();
  cancelShuffle();
  const current = generation;
  phase = 'loading';
  isDrawing = false;
  ui['auto-draw'].disabled = true;
  for (const node of flightNodes) node.remove();
  flightNodes = new Set();
  const fixed = !runner && ui['lock-seed'].checked;
  const requestedSeed = ui.seed.value.trim();
  roundSeed = replayRecord ? replayRecord.seed : (reproduce && roundSeed ? roundSeed : (fixed && requestedSeed ? requestedSeed : randomSeed()));
  ui.seed.value = roundSeed;
  try {
    const [nextDeck, nextBoard] = await Promise.all([
      deckForSeed(roundSeed),
      deckForSeed(`${roundSeed}:board`),
    ]);
    if (current !== generation) return;
    deck = nextDeck;
    if (replayRecord && validBoard(replayRecord.board)) board = [...replayRecord.board];
    else if (reproduce && validBoard(previousBoard)) board = previousBoard;
    else board = $('no-shuffle').checked ? [...ids] : nextBoard;
    currentRecordId = crypto.randomUUID();
    roundStartedAt = new Date().toISOString();
    roundPreferences = readPreferences();
    selected = [];
    placed = new Set();
    revealed = new Set();
    baseTargets = [];
    bonusCount = 0;
    activeTile = null;
    phase = 'shuffling';
    roundNumber += 1;
    ui['round-label'].textContent = `第 ${roundNumber} 局${reproduce || fixed || replayRecord ? ' · 重現模式' : ''}`;
    ui['seed-label'].textContent = `種子 ${roundSeed.length > 18 ? `${roundSeed.slice(0, 12)}…` : roundSeed}`;
    ui['seed-label'].title = roundSeed;
    ui['new-round'].textContent = '↻ 洗牌';
    renderBoard();
    renderPool();
    renderTray();
    updateControls();
    status('洗牌中', '');
    await animateShuffle(runner && $('run-speed').value === 'fast' ? 550 : 2300);
    if (current !== generation) return;
    phase = 'initial';
    status(`選 ${settings().draws} 張牌`, reproduce || fixed ? '重現同一副牌' : '點選或拖到下方手牌區');
    updateControls();
  } catch (error) { status('無法洗牌', error.message); }
}

async function autoDraw() {
  if (isDrawing) return;
  isDrawing = true;
  const current = generation;
  const startPhase = phase;
  updateControls();
  while (current === generation && phase === startPhase) {
    const available = [...ui.pool.children].filter(button => !button.disabled);
    if (!available.length) break;
    const random = crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
    const next = available[Math.floor(random * available.length)];
    pick(Number(next.dataset.index));
    await pause(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 95);
  }
  if (current === generation) { isDrawing = false; updateControls(); }
}

function updateAnalysis() {
  if (!validSettings()) {
    ui['config-error'].textContent = '請輸入有效的局數與金額；局數需為 1～10,000 的整數。';
    return;
  }
  ui['config-error'].textContent = '';
  const config = settings();
  ui.direct.textContent = percent(exactWinProbability(config.draws));
  ui['ev-label'].textContent = `${config.games} 局的淨期望值`;
  if (!stats) return;
  const row = stats.find(item => item.draws === config.draws);
  const result = economics({ ...config, ...row });
  ui.eventual.replaceChildren(document.createTextNode((result.eventual * 100).toFixed(2)), Object.assign(document.createElement('small'), { textContent: '%' }));
  ui['replay-prob'].textContent = percent(row.replay);
  ui['package-win'].textContent = percent(result.packageWin);
  ui['fair-prize'].textContent = Number.isFinite(result.fairPrize) ? money(result.fairPrize) : '無法中獎';
  ui.net.textContent = `${result.net > 0 ? '+' : result.net < 0 ? '−' : ''}${money(Math.abs(result.net))}`;
  ui.net.parentElement.classList.toggle('negative', result.net < 0);
  ui['net-note'].textContent = `預期 ${result.expectedPrizes.toFixed(3)} 份獎品 × ${money(config.prize)} − ${money(config.price)}`;
  ui['bar-win'].style.width = `${row.win * 100}%`;
  ui['bar-replay'].style.width = `${row.replay * 100}%`;
  const low = economics({ ...config, win: row.win, replay: Math.max(0, row.replay - 1.96 * row.standardError) }).eventual;
  const high = economics({ ...config, win: row.win, replay: Math.min(.999, row.replay + 1.96 * row.standardError) }).eventual;
  ui['estimate-note'].textContent = `已模擬 ${new Intl.NumberFormat('zh-TW').format(row.samples)} 次。最終中獎率約 95% 信賴區間：${percent(low)}～${percent(high)}；含重來數字為估計。每組預期進行 ${result.expectedRounds.toFixed(2)} 局（含重來）。`;
  const fragment = document.createDocumentFragment();
  for (const item of stats.filter(item => item.draws >= 10 && item.draws <= 15)) {
    const values = economics({ ...config, ...item });
    const tr = document.createElement('tr');
    tr.classList.toggle('selected', item.draws === config.draws);
    tr.dataset.draws = String(item.draws);
    const first = document.createElement('td');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = `${item.draws} 張${item.draws === config.draws ? ' ✓' : ''}`;
    button.setAttribute('aria-label', `改成每局摸 ${item.draws} 張`);
    first.append(button);
    tr.append(first);
    for (const value of [percent(item.win), percent(item.replay), percent(values.eventual), `${values.net > 0 ? '+' : '−'}${money(Math.abs(values.net))}`]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    if (values.net < 0) tr.lastElementChild.classList.add('negative-text');
    fragment.append(tr);
  }
  ui['comparison-body'].replaceChildren(fragment);
}
function runSimulation() {
  worker?.terminate();
  stats = null;
  ui['compute-state'].textContent = '計算中 0%';
  ui['run-simulation'].disabled = true;
  ui['estimate-note'].textContent = '正在瀏覽器背景模擬 300,000 次。牌桌可照常操作。';
  for (const id of ['eventual','replay-prob','package-win','fair-prize','net']) ui[id].textContent = '—';
  ui['comparison-body'].replaceChildren();
  worker = new Worker(new URL('./worker.mjs', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    if (data.rows) {
      stats = data.rows;
      ui['compute-state'].textContent = '30 萬次完成';
      ui['run-simulation'].disabled = false;
      worker.terminate();
      worker = null;
      updateAnalysis();
    } else ui['compute-state'].textContent = `計算中 ${Math.round(data.progress * 100)}%`;
  };
  worker.onerror = () => {
    ui['compute-state'].textContent = '模擬未完成';
    ui['estimate-note'].textContent = '背景運算無法啟動，請重新整理或按驗證重試。直接連線率仍為精確值。';
    ui['run-simulation'].disabled = false;
  };
  simulationNumber += 1;
  worker.postMessage({ samples: 300000, doubleReplay: settings().doubleReplay, bonus: settings().bonus, seed: `chance-lab-${simulationNumber}` });
}

ui.pool.addEventListener('click', event => {
  if (isRunning || Date.now() < suppressClickUntil) return;
  const button = event.target.closest('[data-index]');
  if (button && !isDrawing) pick(Number(button.dataset.index));
});
ui.board.addEventListener('click', event => {
  if (isRunning) return;
  const cell = event.target.closest('[data-position]');
  if (!cell) return;
  if (activeTile !== null) placeTile(activeTile, Number(cell.dataset.position));
  else if (!ui['auto-place'].checked && selected.some(id => !placed.has(id))) say('先在手上的牌選一張，再點底盤相同牌面。');
});
ui.tray.addEventListener('click', event => {
  if (isRunning) return;
  if (Date.now() < suppressClickUntil) return;
  const tile = event.target.closest('[data-id]');
  if (!tile) return;
  const id = Number(tile.dataset.id);
  if (!revealed.has(id)) {
    revealed.add(id);
    activeTile = id;
    renderTray();
    const flipped = [...ui.tray.children].find(node => Number(node.dataset.id) === id);
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) flipped?.animate([{transform:'rotateY(90deg)'},{transform:'rotateY(0deg)'}],{duration:180});
    return;
  }
  activeTile = activeTile === id ? null : id;
  renderTray();
});
ui.tray.addEventListener('pointerdown', event => {
  const tile = event.target.closest('[data-id]');
  if (!tile || event.button !== 0 || isRunning || !revealed.has(Number(tile.dataset.id))) return;
  drag = { kind:'hand', id: Number(tile.dataset.id), x: event.clientX, y: event.clientY, ghost: null, pointerId: event.pointerId, source: tile };
  tile.setPointerCapture(event.pointerId);
});
ui.pool.addEventListener('pointerdown', event => {
  const tile = event.target.closest('[data-index]');
  if (!tile || tile.disabled || event.button !== 0 || isRunning) return;
  drag = {kind:'pool',index:Number(tile.dataset.index),x:event.clientX,y:event.clientY,ghost:null,pointerId:event.pointerId,source:tile};
  tile.setPointerCapture(event.pointerId);
});
window.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
  if (!drag.ghost) {
    drag.ghost = drag.source.cloneNode(true);
    drag.ghost.className = drag.kind === 'pool' ? 'hand-tile back-tile drag-ghost' : 'hand-tile drag-ghost';
    drag.ghost.removeAttribute('data-id');
    drag.ghost.setAttribute('aria-hidden','true');
    document.body.append(drag.ghost);
  }
  drag.ghost.style.left = `${event.clientX - 24}px`;
  drag.ghost.style.top = `${event.clientY - 32}px`;
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('.cell');
  for (const node of ui.board.children) node.classList.toggle('drop-target', drag.kind === 'hand' && node === cell);
  ui.tray.classList.toggle('drop-target',drag.kind === 'pool' && Boolean(document.elementFromPoint(event.clientX,event.clientY)?.closest('#tray-section')));
});
function endDrag(event) {
  if (!drag) return;
  const finished = drag;
  drag = null;
  for (const node of ui.board.children) node.classList.remove('drop-target');
  ui.tray.classList.remove('drop-target');
  if (!finished.ghost) return;
  finished.ghost.remove();
  suppressClickUntil = Date.now() + 400;
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest('.cell');
  if (event.type === 'pointercancel') return;
  if (finished.kind === 'pool') {
    if (document.elementFromPoint(event.clientX,event.clientY)?.closest('#tray-section')) pick(finished.index);
  } else if (cell) placeTile(finished.id, Number(cell.dataset.position));
}
window.addEventListener('pointerup', endDrag);
window.addEventListener('pointercancel', endDrag);
document.addEventListener('keydown', event => { if (event.key === 'Escape') { activeTile = null; renderTray(); } });
ui['auto-place'].addEventListener('change', () => { if (isRunning) return; if (ui['auto-place'].checked) placeAll(); else renderTray(); });
ui.appearance.addEventListener('change', () => { renderBoard(); renderTray(); });
ui['new-round'].addEventListener('click', () => newRound());
$('replay-hand').addEventListener('click', () => newRound({ reproduce: true }));
$('reset-board').addEventListener('click', async () => { $('no-shuffle').checked = false; localData.preferences = readPreferences(); persistLocalData(); await newRound(); });
$('no-shuffle').addEventListener('change', () => newRound());
ui['auto-draw'].addEventListener('click', autoDraw);
ui['place-all'].addEventListener('click', placeAll);
$('reveal-all').addEventListener('click', () => { for (const id of selected) revealed.add(id); renderTray(); });
$('run-start').addEventListener('click', startRun);
$('run-stop').addEventListener('click', () => stopRun());
$('run-stop-table').addEventListener('click', () => stopRun());
$('run-mode').addEventListener('change', () => { if(isRunning) stopRun(); $('run-count-field').hidden = $('run-mode').value === 'win'; $('run-count').disabled = $('run-mode').value === 'win'; });
ui['run-simulation'].addEventListener('click', runSimulation);
ui['comparison-body'].addEventListener('click', event => {
  const row = event.target.closest('tr[data-draws]');
  if (!row) return;
  ui.draws.value = row.dataset.draws;
  updateAnalysis();
  newRound();
  if (matchMedia('(max-width:700px)').matches) $('table-area').scrollIntoView({ behavior: 'smooth' });
});
for (const id of ['games','price','prize']) ui[id].addEventListener('input', () => { if(isRunning) stopRun(); updateAnalysis(); });
ui.draws.addEventListener('input', updateAnalysis);
ui.draws.addEventListener('input', () => { if(isRunning) stopRun(); });
ui.draws.addEventListener('change', () => newRound());
for (const id of ['bonus','double-replay']) ui[id].addEventListener('change', () => {
  clearTimeout(simulationTimer);
  simulationTimer = setTimeout(runSimulation, 120);
  newRound();
});
ui.seed.addEventListener('change', () => { if (ui['lock-seed'].checked) newRound(); });
ui['lock-seed'].addEventListener('change', () => { if (ui['lock-seed'].checked) say('已固定種子；下一局會重現同一副牌。'); });
const showHelp = () => { if (!$('help').open) $('help').showModal(); };
$('help-open').addEventListener('click', showHelp);
$('sources-open').addEventListener('click', showHelp);
$('help-close').addEventListener('click', () => $('help').close());
$('help').addEventListener('click', event => { if (event.target === $('help')) { const r = $('help').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('help').close(); } });
$('settings-form').addEventListener('change', () => {
  if (!validSettings()) return;
  localData.preferences = readPreferences();
  persistLocalData();
});
$('history-list').addEventListener('click', event => {
  const button = event.target.closest('[data-record-id]');
  if (!button) return;
  const record = localData.history.find(item => item.id === button.dataset.recordId);
  if (!record) return;
  if (isRunning) stopRun();
  recordCurrentRound();
  currentRecordId = null;
  restorePreferences(record.preferences || {'draws':String(record.draws)});
  localData.preferences = readPreferences();
  persistLocalData();
  updateAnalysis();
  runSimulation();
  newRound({reproduce:true,replayRecord:record});
});
$('clear-local').addEventListener('click', () => {
  clearTimeout(recordTimer);
  let cleared = false;
  try { cleared = clearLocalData(localStorage); } catch { /* Storage access may be disabled. */ }
  if (!cleared) { say('無法清除本機紀錄。'); return; }
  localData = {version:1,preferences:{},history:[]};
  currentRecordId = null;
  renderHistory();
  $('storage-status').textContent = '本機設定與紀錄已清除。';
  say('本機紀錄已清除');
});
try { localData = loadLocalData(localStorage); } catch { /* Use in-memory defaults. */ }
restorePreferences(localData.preferences);
renderHistory();
if (matchMedia('(max-width:700px)').matches) $('settings-details').open = false;
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $('theme-toggle').textContent = theme === 'black' ? '背景：黑色' : '背景：淺色';
  $('theme-toggle').setAttribute('aria-pressed',String(theme === 'black'));
  try { localStorage.setItem('bingo-theme', theme); } catch { /* Browser storage can be disabled. */ }
}
$('theme-toggle').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'black' ? 'light' : 'black'));
try { setTheme(localStorage.getItem('bingo-theme') || 'black'); } catch { setTheme('black'); }
window.addEventListener('pagehide', () => { recordCurrentRound(); isRunning=false; cancelShuffle(); poolObserver.disconnect(); worker?.terminate(); clearTimeout(toastTimer); clearTimeout(simulationTimer); clearTimeout(recordTimer); });
updateAnalysis();
newRound();
runSimulation();
