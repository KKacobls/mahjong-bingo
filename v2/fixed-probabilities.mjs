// Fixed reference probability table for a 6x6 / 36-tile Mahjong Bingo board.
// Direct-win values are exact inclusion-exclusion probabilities.
// Waiting-target frequencies were PRECOMPUTED OFFLINE from 2,000,000
// deterministic full 36-tile shuffles (mt19937 seed 20261028).
// They are frozen: no Web Worker, simulation or randomness is run on page load.
// Each tuple: [initialDraws, exactDirectWinRate, {distinctMissingTargetCount: frequency,...}].
export const FIXED_SAMPLE_COUNT = 2000000;
const HISTOGRAM = [
  [6, 0.000007187626, {1:2525}],
  [7, 0.000050313380, {1:8553}],
  [8, 0.000201253522, {1:22442}],
  [9, 0.000603760566, {1:48685,2:38}],
  [10, 0.001509401415, {1:93408,2:327}],
  [11, 0.003320583246, {1:162267,2:1660}],
  [12, 0.006640143066, {1:260523,2:6124,3:4}],
  [13, 0.012325854331, {1:386790,2:18288,3:96}],
  [14, 0.021545835242, {1:532851,2:46386,3:684}],
  [15, 0.035826491906, {1:678208,2:101822,3:3548,4:11}],
  [16, 0.057077425784, {1:789971,2:194195,3:13733,4:201}],
  [17, 0.087566938497, {1:828810,2:322258,3:41633,4:1609,5:14}],
  [18, 0.129807505349, {1:770032,2:461761,3:102491,4:8003,5:162}],
  [19, 0.186295472568, {1:615773,2:561886,3:203181,4:29551,5:1495,6:17,7:1}],
  [20, 0.259041289380, {1:408994,2:564242,3:323352,4:81076,5:8380,6:277,7:1}],
  [21, 0.348843420852, {1:214135,2:452015,3:403536,4:166682,5:31512,6:2474,7:64}],
  [22, 0.454331090306, {1:82304,2:273657,3:381570,4:251765,5:81470,6:12328,7:825,8:15}],
  [23, 0.570966002270, {1:20392,2:115917,3:262056,4:273201,5:142695,6:37978,7:4711,8:242,9:7}],
  [24, 0.690465655815, {1:2490,2:29786,3:119027,4:205755,5:171605,6:72930,7:15890,8:1716,9:81,10:1}],
  [25, 0.801403108803, {1:86,2:3448,3:30959,4:97788,5:136366,6:91755,7:31263,8:5396,9:466,10:17}],
  [26, 0.891742293709, {2:98,3:3374,4:25506,5:66344,6:73937,7:37670,8:9180,9:968,10:46}],
  [27, 0.953244118964, {3:70,4:2733,5:17576,6:36103,7:28379,8:8329,9:736}],
  [28, 0.985745302267, {4:84,5:1915,6:10176,7:13089,8:3406}],
  [29, 0.997536081881, {6:1846,7:3130}],
  [30, 0.999861381503, {6:292}],
];

function bonusHitProbability(remaining, targets, count) {
  if (targets === 0 || count === 0) return 0;
  let miss = 1;
  for (let n=0;n<Math.min(count,remaining);n++) {
    miss *= Math.max(0,remaining-targets-n)/(remaining-n);
  }
  return 1-miss;
}

// Generate all parameter combinations ONCE when this module is imported.
// The underlying reference frequencies never change; displaying the modal
// is just a direct lookup, with no per-open simulation or Monte Carlo.
const LOOKUP = [false,true].map(doubleReplay =>
  Array.from({length:36}, (_,bonus) =>
    HISTOGRAM.map(([draws,win,targets]) => {
      const remaining = 36-draws;
      let replay = 0;
      for(const [targetString,frequency] of Object.entries(targets)) {
        const targetCount=Number(targetString);
        const probability = doubleReplay && targetCount >= 2
          ? 1 : bonusHitProbability(remaining,targetCount,bonus);
        replay += (frequency / FIXED_SAMPLE_COUNT) * probability;
      }
      return Object.freeze({
        draws,win,replay,
        eventual:Math.min(1,win/(1-replay))
      });
    })
  )
);

export function fixedProbabilityRows({bonus=5,doubleReplay=true}={}) {
  const b=Number.isFinite(bonus)?Math.max(0,Math.min(35,Math.trunc(bonus))):5;
  return LOOKUP[doubleReplay?1:0][b];
}
