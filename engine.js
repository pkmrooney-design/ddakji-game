// =====================================================
// 딱지치기 규칙 엔진 — UI 없이 단독 동작
// =====================================================

// ─── 타입 (상성) ──────────────────────────────────────
const TYPES = Object.freeze({
  ALPHA: 'alpha',
  BETA:  'beta',
  GAMMA: 'gamma',
  NONE:  'none',  // 무상성
});

const TYPE_LABELS = {
  [TYPES.ALPHA]: '불',
  [TYPES.BETA]:  '물',
  [TYPES.GAMMA]: '풀',
  [TYPES.NONE]:  '무',
};

// 순환 상성: 불(ALPHA) > 풀(GAMMA) > 물(BETA) > 불(ALPHA)
// NONE(무)은 어떤 타입과도 상성 없음
// 불 > 풀, 물 > 불, 풀 > 물
const BEATS = Object.freeze({
  [TYPES.ALPHA]: TYPES.GAMMA, // 불 > 풀
  [TYPES.BETA]:  TYPES.ALPHA, // 물 > 불
  [TYPES.GAMMA]: TYPES.BETA,  // 풀 > 물
  [TYPES.NONE]:  null,
});

// ─── CONFIG ───────────────────────────────────────────
const CONFIG = Object.freeze({
  OVERLAP_MULT:       0.625, // 겹침 배율 (80% 겹침 × 중립 = 50%)
  TYPE_WIN_MULT:      1.2,   // 유리 상성 배율 → 100% 겹침 중립 기준 ≈ 75%
  TYPE_LOSE_MULT:     0.8,   // 불리 상성 배율 → 100% 겹침 중립 기준 ≈ 50%
  STAT_TOTAL_NORMAL:  10,    // 순환 상성 타입: 공격력 + 무게 합계
  STAT_TOTAL_NONE:     9,    // 무상성: 안전값을 스탯 1점으로 지불
});

// ─── 상성 배율 계산 ───────────────────────────────────
function getTypeMult(attackerType, defenderType) {
  if (attackerType === TYPES.NONE || defenderType === TYPES.NONE) return 1.0;
  if (attackerType === defenderType) return 1.0;
  if (BEATS[attackerType] === defenderType) return CONFIG.TYPE_WIN_MULT;
  return CONFIG.TYPE_LOSE_MULT;
}

// ─── 뒤집기 확률 (순수 함수) ──────────────────────────
// attacker, defender: { type, atk, def }
// overlapRatio: 0.0~1.0 (겹치는 면적 / 딱지 면적)
// 반환값: 0~100 정수 %
//
// 공식:
//   base    = overlapRatio × 0.625 × typeMult × 100
//   statAdj = attacker.atk - defender.def
//   final   = clamp(base + statAdj, 0, 100)
function calcFlipChance(attacker, defender, overlapRatio) {
  if (overlapRatio <= 0) return 0;
  const typeMult = getTypeMult(attacker.type, defender.type);
  const statAdj  = attacker.atk - defender.def;
  const raw = (overlapRatio * CONFIG.OVERLAP_MULT * typeMult * 100) + statAdj;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

// ─── 카드 로스터 ──────────────────────────────────────
const CARD_ROSTER = Object.freeze([
  { id: 'alpha_cannon',  type: TYPES.ALPHA, atk: 8,   def: 2,   label: '불 대포'   },
  { id: 'alpha_balance', type: TYPES.ALPHA, atk: 6,   def: 4,   label: '불 밸런스' },
  { id: 'alpha_tank',    type: TYPES.ALPHA, atk: 4,   def: 6,   label: '불 탱커'   },
  { id: 'beta_cannon',   type: TYPES.BETA,  atk: 7,   def: 3,   label: '물 대포'   },
  { id: 'beta_balance',  type: TYPES.BETA,  atk: 5,   def: 5,   label: '물 밸런스' },
  { id: 'beta_tank',     type: TYPES.BETA,  atk: 3,   def: 7,   label: '물 탱커'   },
  { id: 'gamma_cannon',  type: TYPES.GAMMA, atk: 6,   def: 4,   label: '풀 대포'   },
  { id: 'gamma_balance', type: TYPES.GAMMA, atk: 4,   def: 6,   label: '풀 밸런스' },
  { id: 'gamma_tank',    type: TYPES.GAMMA, atk: 2,   def: 8,   label: '풀 탱커'   },
  { id: 'none_cannon',   type: TYPES.NONE,  atk: 6,   def: 3,   label: '무 대포'   },
  { id: 'none_balance',  type: TYPES.NONE,  atk: 4.5, def: 4.5, label: '무 밸런스' },
  { id: 'none_tank',     type: TYPES.NONE,  atk: 3,   def: 6,   label: '무 탱커'   },
]);

// ─── 덱 유효성 검사 ───────────────────────────────────
// 규칙: 3슬롯, 완전 동일 카드(id 동일) 중복 금지
// 같은 타입 2장은 허용 — 단 id(=스탯 조합)가 달라야 함
function validateDeck(deck) {
  if (!Array.isArray(deck) || deck.length !== 3) {
    return { valid: false, reason: '덱은 정확히 3장이어야 합니다.' };
  }
  const ids = deck.map(c => c.id);
  if (new Set(ids).size !== ids.length) {
    return { valid: false, reason: '완전히 동일한 카드는 중복 사용할 수 없습니다.' };
  }
  return { valid: true };
}

// ─── RNG (시드 가능 LCG) ──────────────────────────────
function createRNG(seed) {
  let s = (seed === undefined ? Date.now() : seed) >>> 0;
  return {
    seed: s,
    next()       { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0x100000000; },
    nextInt(n)   { return Math.floor(this.next() * n); },
    pick(arr)    { return arr[this.nextInt(arr.length)]; },
  };
}

// ─── exports (Node.js 호환) ───────────────────────────
if (typeof module !== 'undefined') {
  module.exports = {
    TYPES, TYPE_LABELS, BEATS, CONFIG,
    getTypeMult, calcFlipChance,
    CARD_ROSTER, validateDeck, createRNG,
  };
}
