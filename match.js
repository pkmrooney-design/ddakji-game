// =====================================================
// 딱지치기 매치 상태머신
// 의존: engine.js (TYPES, calcFlipChance, validateDeck, createRNG)
// =====================================================

// ─── 매치 생성 ────────────────────────────────────────
// playerDeck, oppDeck: Card[] (engine.js CARD_ROSTER 원소 3장)
// rngSeed: number | undefined (undefined면 Date.now())
function createMatch(playerDeck, oppDeck, rngSeed) {
  const rng = createRNG(rngSeed);

  // TODO: 카드 공개 타이밍 — 현재 동시 공개
  // 대안: 선공이 먼저 카드 선택 공개, 후공이 보고 선택 후 동시 진행
  const REVEAL_MODE = 'simultaneous'; // config

  // TODO: 라운드 해결 방식 — 현재 "공격 1회 판정"
  // 실패 시 공수교대 대안:
  //   while (true) { if (rng.next()*100 < chance) { winner = attacker; break; }
  //                  swap(attacker, defender); chance = calcFlipChance(...); }
  const ROUND_MODE = 'single-attack'; // config

  const state = {
    phase: 'rps',       // 'rps' | 'card-select' | 'throw' | 'round-end' | 'match-end'
    round: 0,           // 현재 라운드 (1~3)
    scores: { player: 0, opp: 0 },
    firstAttacker: null, // 'player' | 'opp' — RPS 후 결정
    rpsResult: null,     // { playerChoice, oppChoice, winner }
    currentRound: null,  // RoundState
    history: [],         // RoundState[]
    winner: null,        // 'player' | 'opp' | null
  };

  // ─── RPS ──────────────────────────────────────────
  // playerChoice: 'rock' | 'scissors' | 'paper'
  // 반환: { playerChoice, oppChoice, winner: 'player'|'opp'|'draw' }
  function resolveRPS(playerChoice) {
    if (state.phase !== 'rps') throw new Error('RPS 단계가 아닙니다.');
    const choices = ['rock', 'scissors', 'paper'];
    const oppChoice = rng.pick(choices);
    const winner = rpsWinner(playerChoice, oppChoice);

    state.rpsResult = { playerChoice, oppChoice, winner };

    if (winner === 'draw') {
      // 비김 — phase 유지, 다시 resolveRPS 호출
      return state.rpsResult;
    }

    state.firstAttacker = winner;
    state.phase = 'card-select';
    return state.rpsResult;
  }

  // ─── 카드 선택 ────────────────────────────────────
  // TODO: REVEAL_MODE가 'sequential'이면 선공 카드 먼저 공개 후 후공 선택
  // playerCardId, oppCardId: string (CARD_ROSTER의 id)
  // 반환: { playerCard, oppCard } — 동시 공개
  function selectCards(playerCardId, oppCardId) {
    if (state.phase !== 'card-select') throw new Error('카드 선택 단계가 아닙니다.');

    const playerCard = playerDeck.find(c => c.id === playerCardId);
    const oppCard    = oppDeck.find(c => c.id === oppCardId);
    if (!playerCard) throw new Error(`플레이어 카드를 찾을 수 없습니다: ${playerCardId}`);
    if (!oppCard)    throw new Error(`상대 카드를 찾을 수 없습니다: ${oppCardId}`);

    state.round++;
    state.currentRound = {
      num: state.round,
      playerCard,
      oppCard,
      attacker: state.firstAttacker,
      flipChance: null,
      roll: null,
      success: null,
      roundWinner: null,
    };

    // 확률 미리 계산 (UI에서 표시용)
    const r = state.currentRound;
    const atk = r.attacker === 'player' ? playerCard : oppCard;
    const def = r.attacker === 'player' ? oppCard    : playerCard;
    r.flipChance = calcFlipChance(atk, def);

    state.phase = 'throw';
    return { playerCard, oppCard, flipChance: r.flipChance };
  }

  // ─── 던지기 판정 ──────────────────────────────────
  // 반환: { success, roll, flipChance, roundWinner }
  function resolveThrow() {
    if (state.phase !== 'throw') throw new Error('던지기 단계가 아닙니다.');
    const r = state.currentRound;

    const roll = rng.next() * 100;
    const success = roll < r.flipChance;

    // ROUND_MODE === 'single-attack':
    //   성공 → 공격자 승 / 실패 → 수비자 승
    r.roll = Math.round(roll * 10) / 10;
    r.success = success;
    r.roundWinner = success
      ? r.attacker
      : (r.attacker === 'player' ? 'opp' : 'player');

    state.phase = 'round-end';
    return { success, roll: r.roll, flipChance: r.flipChance, roundWinner: r.roundWinner };
  }

  // ─── 라운드 종료 처리 ─────────────────────────────
  // 반환: { scores, matchDone, matchWinner, nextPhase }
  function endRound() {
    if (state.phase !== 'round-end') throw new Error('라운드 종료 단계가 아닙니다.');
    const r = state.currentRound;

    if (r.roundWinner === 'player') state.scores.player++;
    else                            state.scores.opp++;

    state.history.push({ ...r });

    // 2선승 판정
    const WINS_NEEDED = 2;
    if (state.scores.player >= WINS_NEEDED) {
      state.winner = 'player';
      state.phase  = 'match-end';
      return { scores: { ...state.scores }, matchDone: true, matchWinner: 'player' };
    }
    if (state.scores.opp >= WINS_NEEDED) {
      state.winner = 'opp';
      state.phase  = 'match-end';
      return { scores: { ...state.scores }, matchDone: true, matchWinner: 'opp' };
    }
    if (state.round >= 3) {
      // 3라운드 후 동점 (이론상 2선승에서는 불가능하나 방어코드)
      state.winner = state.scores.player > state.scores.opp ? 'player' : 'opp';
      state.phase  = 'match-end';
      return { scores: { ...state.scores }, matchDone: true, matchWinner: state.winner };
    }

    // 다음 라운드 — 선공 교대
    state.firstAttacker = state.firstAttacker === 'player' ? 'opp' : 'player';
    state.phase = 'card-select';
    return { scores: { ...state.scores }, matchDone: false, nextPhase: 'card-select' };
  }

  // ─── 공개 API ─────────────────────────────────────
  return {
    get state() { return state; },
    resolveRPS,
    selectCards,
    resolveThrow,
    endRound,
    // 디버그/시뮬레이션용
    snapshot() { return JSON.parse(JSON.stringify(state)); },
  };
}

// ─── RPS 승자 판정 (순수 함수) ────────────────────────
function rpsWinner(a, b) {
  if (a === b) return 'draw';
  if ((a==='rock'&&b==='scissors') || (a==='scissors'&&b==='paper') || (a==='paper'&&b==='rock'))
    return 'player';
  return 'opp';
}

// ─── exports ──────────────────────────────────────────
if (typeof module !== 'undefined') {
  module.exports = { createMatch, rpsWinner };
}
