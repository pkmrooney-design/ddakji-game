// =====================================================
// 딱지치기 규칙 엔진 — UI 없이 단독 동작
// =====================================================

// ─── 타입 (상성) ──────────────────────────────────────
// TODO: 타입 이름 미확정 — TYPE_LABELS만 바꾸면 전체 반영됨
const TYPES = Object.freeze({
  ALPHA: 'alpha',
  BETA:  'beta',
  GAMMA: 'gamma',
  NONE:  'none',  // 무상성
});

const TYPE_LABELS = {
  [TYPES.ALPHA]: '알파',  // TODO: 확정 전 임시 이름
  [TYPES.BETA]:  '베타',
  [TYPES.GAMMA]: '감마',
  [TYPES.NONE]:  '무',
};

// 순환 상성: ALPHA > BETA > GAMMA > ALPHA
// NONE은 어떤 타입과도 상성 없음
const BEATS = Object.freeze({
  [TYPES.ALPHA]: TYPES.BETA,
  [TYPES.BETA]:  TYPES.GAMMA,
  [TYPES.GAMMA]: TYPES.ALPHA,
  [TYPES.NONE]:  null,
});

// ─── CONFIG ───────────────────────────────────────────
const CONFIG = Object.freeze({
  BASE_FLIP:          40,   // 기본 뒤집기 확률 %p
  TYPE_BONUS:         20,   // 유리 상성 보정 +%p
  TYPE_PENALTY:      -20,   // 불리 상성 보정 -%p
  STAT_MULT:           2,   // 스탯 1당 확률 변화 %p (공격력/방어력 동일 계수)
  TIMING_BONUS:        0,   // TODO: 타이밍 정밀도 보정 — 현재 0, config로 추후 조정
  STAT_TOTAL_NORMAL:  10,   // 순환 상성 타입: 공격력 + 무게 합계
  STAT_TOTAL_NONE:     9,   // 무상성: 안전값을 스탯 1점으로 지불
});

// ─── 상성 보정값 계산 ─────────────────────────────────
function getTypeAdj(attackerType, defenderType) {
  // 무상성이 포함되거나 거울 매치면 보정 없음
  if (attackerType === TYPES.NONE || defenderType === TYPES.NONE) return 0;
  if (attackerType === defenderType) return 0;
  if (BEATS[attackerType] === defenderType) return CONFIG.TYPE_BONUS;
  return CONFIG.TYPE_PENALTY;
}

// ─── 뒤집기 확률 (순수 함수) ──────────────────────────
// attacker, defender: { type, atk, def }
// 반환값: 0~100 정수 %
function calcFlipChance(attacker, defender, timingBonus = CONFIG.TIMING_BONUS) {
  const typeAdj = getTypeAdj(attacker.type, defender.type);
  const statAdj = (attacker.atk * CONFIG.STAT_MULT) - (defender.def * CONFIG.STAT_MULT);
  const raw = CONFIG.BASE_FLIP + typeAdj + statAdj + timingBonus;
  return Math.max(0, Math.min(100, raw));
}

// ─── 카드 로스터 ──────────────────────────────────────
// TODO: 타입별 시그니처 스탯 — 현재 완전 직교 (4타입 × 3아키타입 = 12장)
// 나중에 타입별 고유 스탯 분포로 바꿀 수 있게 데이터 구동으로 관리
const CARD_ROSTER = Object.freeze([
  { id: 'alpha_cannon',  type: TYPES.ALPHA, atk: 8, def: 2, label: '알파 대포'   },
  { id: 'alpha_balance', type: TYPES.ALPHA, atk: 5, def: 5, label: '알파 밸런스' },
  { id: 'alpha_tank',    type: TYPES.ALPHA, atk: 2, def: 8, label: '알파 탱커'   },
  { id: 'beta_cannon',   type: TYPES.BETA,  atk: 8, def: 2, label: '베타 대포'   },
  { id: 'beta_balance',  type: TYPES.BETA,  atk: 5, def: 5, label: '베타 밸런스' },
  { id: 'beta_tank',     type: TYPES.BETA,  atk: 2, def: 8, label: '베타 탱커'   },
  { id: 'gamma_cannon',  type: TYPES.GAMMA, atk: 8, def: 2, label: '감마 대포'   },
  { id: 'gamma_balance', type: TYPES.GAMMA, atk: 5, def: 5, label: '감마 밸런스' },
  { id: 'gamma_tank',    type: TYPES.GAMMA, atk: 2, def: 8, label: '감마 탱커'   },
  { id: 'none_cannon',   type: TYPES.NONE,  atk: 7, def: 2, label: '무 대포'     },
  { id: 'none_balance',  type: TYPES.NONE,  atk: 5, def: 4, label: '무 밸런스'   },
  { id: 'none_tank',     type: TYPES.NONE,  atk: 2, def: 7, label: '무 탱커'     },
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
    getTypeAdj, calcFlipChance,
    CARD_ROSTER, validateDeck, createRNG,
  };
}
