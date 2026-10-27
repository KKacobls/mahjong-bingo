export function emptyLiveStats() {
  return {started:0,completed:0,wins:0,losses:0,replays:0,paid:0,credits:0,spent:0,purchases:0,freeAvailable:false,lastWin:null,points:[{round:0,spent:0,win:false}]};
}

export function normalizeLiveStats(value) {
  const fallback=emptyLiveStats();
  if (!value || typeof value!=='object') return fallback;
  for(const key of ['started','completed','wins','losses','replays','paid','credits','spent','purchases']) {
    if (!Number.isFinite(value[key]) || value[key]<0) return fallback;
    fallback[key]=value[key];
  }
  fallback.freeAvailable=value.freeAvailable===true;
  fallback.lastWin=value.lastWin && Number.isFinite(value.lastWin.round) && Number.isFinite(value.lastWin.spent) ? value.lastWin : null;
  fallback.points=Array.isArray(value.points) ? value.points.filter(p=>p && Number.isFinite(p.round) && Number.isFinite(p.spent) && p.round>=0 && p.spent>=0).slice(-300) : fallback.points;
  return fallback;
}

function addPoint(stats, win=false) {
  return {...stats,points:[...stats.points,{round:stats.completed,spent:stats.spent,win}].slice(-300)};
}

export function purchaseGames(stats, games, price) {
  if (!Number.isInteger(games) || games<1 || !Number.isFinite(price) || price<0) throw new Error('請輸入有效局數與價格');
  return addPoint({...stats,credits:stats.credits+games,spent:stats.spent+price,purchases:stats.purchases+1});
}

export function beginPlayedRound(stats) {
  if (stats.freeAvailable) return {...stats,started:stats.started+1,freeAvailable:false};
  if (stats.credits<1) return null;
  return {...stats,started:stats.started+1,paid:stats.paid+1,credits:stats.credits-1};
}

export function completePlayedRound(stats, result) {
  if (!['won','lost','replay'].includes(result)) return stats;
  const next={...stats,completed:stats.completed+1,wins:stats.wins+Number(result==='won'),losses:stats.losses+Number(result==='lost'),replays:stats.replays+Number(result==='replay'),freeAvailable:result==='replay'};
  if (result==='won') next.lastWin={round:next.completed,spent:next.spent};
  return addPoint(next,result==='won');
}
