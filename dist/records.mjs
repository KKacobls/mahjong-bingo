export const STORAGE_KEY = 'mahjong-bingo:local:v1';
export const HISTORY_LIMIT = 100;

export function validBoard(value) {
  return Array.isArray(value) && value.length === 36 && new Set(value).size === 36 && value.every(id => Number.isInteger(id) && id >= 0 && id < 36);
}

function validRecord(record) {
  return record && typeof record.id === 'string' && typeof record.seed === 'string' && record.seed.length <= 64 && typeof record.startedAt === 'string' && Number.isFinite(Date.parse(record.startedAt)) && validBoard(record.board) && Number.isInteger(record.draws) && record.draws >= 1 && record.draws <= 36;
}

export function loadLocalData(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
    if (!parsed || parsed.version !== 1) return {version:1,preferences:{},history:[]};
    return {
      version:1,
      preferences: parsed.preferences && typeof parsed.preferences === 'object' && !Array.isArray(parsed.preferences) ? parsed.preferences : {},
      history: Array.isArray(parsed.history) ? parsed.history.filter(validRecord).slice(-HISTORY_LIMIT) : [],
      ...(parsed.live && typeof parsed.live==='object' ? {live:parsed.live} : {}),
    };
  } catch { return {version:1,preferences:{},history:[]}; }
}

export function upsertRecord(history, record) {
  if (!validRecord(record)) return history;
  return [...history.filter(item => item.id !== record.id), structuredClone(record)].slice(-HISTORY_LIMIT);
}

export function saveLocalData(storage, data) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); return true; } catch { return false; }
}

export function clearLocalData(storage) {
  try {
    storage.removeItem(STORAGE_KEY);
    storage.removeItem('bingo-theme');
    return true;
  } catch { return false; }
}
