// Pure game logic for Dice Baseball. No DOM access lives here so it can be unit
// tested under node:test and reused by the browser UI. Every function that
// changes game state returns a brand new state object (the input is untouched).

// The dice table IS the game. Each plate appearance is one roll of 2d6; the sum
// (2..12) selects an outcome. `type` drives flow: 'out' burns an out, 'walk'
// forces runners, 'hit' advances everyone by `bases`.
//
// The catalog is the set of distinct outcomes a cell can hold; the table maps a
// sum to one catalog entry. Keeping them separate lets the UI reassign any cell
// (sum -> outcome) without touching game logic.
export const OUTCOME_CATALOG = {
  HOME_RUN:  { id: 'HOME_RUN',  label: 'Home Run',  type: 'hit',  bases: 4 },
  TRIPLE:    { id: 'TRIPLE',    label: 'Triple',    type: 'hit',  bases: 3 },
  DOUBLE:    { id: 'DOUBLE',    label: 'Double',    type: 'hit',  bases: 2 },
  SINGLE:    { id: 'SINGLE',    label: 'Single',    type: 'hit',  bases: 1 },
  WALK:      { id: 'WALK',      label: 'Walk',      type: 'walk', bases: 0 },
  STRIKEOUT: { id: 'STRIKEOUT', label: 'Strikeout', type: 'out',  bases: 0 },
  GROUNDOUT: { id: 'GROUNDOUT', label: 'Groundout', type: 'out',  bases: 0 },
  FLYOUT:    { id: 'FLYOUT',    label: 'Flyout',    type: 'out',  bases: 0 },
  POPFLY:    { id: 'POPFLY',    label: 'Pop Fly',   type: 'out',  bases: 0 },
};

// Extremes are exciting (hits); the common middle sums 5-9 are outs (~67%),
// which keeps games to a believable score instead of a slugfest.
export const DEFAULT_TABLE_IDS = {
  2: 'HOME_RUN', 3: 'TRIPLE', 4: 'DOUBLE',
  5: 'POPFLY', 6: 'GROUNDOUT', 7: 'STRIKEOUT', 8: 'FLYOUT', 9: 'GROUNDOUT',
  10: 'SINGLE', 11: 'WALK', 12: 'HOME_RUN',
};

// Build a resolved table (sum -> catalog entry) from a sum -> outcome-id map.
export function buildTable(idsBySum = DEFAULT_TABLE_IDS) {
  const table = {};
  for (const sum of Object.keys(idsBySum)) {
    table[sum] = OUTCOME_CATALOG[idsBySum[sum]];
  }
  return table;
}

export const OUTCOMES = buildTable(DEFAULT_TABLE_IDS);

export const REGULATION_INNINGS = 9;

export function outcomeForSum(sum, table = OUTCOMES) {
  return table[sum];
}

// Roll two dice using an injectable rng (defaults to Math.random) so tests can
// be deterministic.
export function rollWith(rng = Math.random) {
  const d1 = Math.floor(rng() * 6) + 1;
  const d2 = Math.floor(rng() * 6) + 1;
  return { d1, d2, sum: d1 + d2 };
}

// Advance the batter and all runners by `n` bases (hits). bases is
// [first, second, third]. A runner reaching base 4 (home) scores.
export function advanceRunners(bases, n) {
  const next = [false, false, false];
  let runs = 0;
  for (let i = 0; i < 3; i++) {
    if (!bases[i]) continue;
    const dest = i + 1 + n; // base number 1..3 plus advance
    if (dest >= 4) runs += 1;
    else next[dest - 1] = true;
  }
  // batter
  if (n >= 4) runs += 1;
  else next[n - 1] = true;
  return { bases: next, runs };
}

// A walk only advances runners that are forced. Bases loaded forces in a run.
export function applyWalk(bases) {
  const next = bases.slice();
  let runs = 0;
  if (next[0]) {
    if (next[1]) {
      if (next[2]) runs += 1; // bases loaded: runner on 3rd is forced home
      next[2] = true;          // 2nd forced to 3rd
    }
    next[1] = true;            // 1st forced to 2nd
  }
  next[0] = true;              // batter to first
  return { bases: next, runs };
}

export function newGame(mode = 'solo', table = OUTCOMES) {
  return {
    mode,
    outcomes: table,
    inning: 1,
    half: 'top',            // 'top' (away bats) | 'bottom' (home bats)
    battingTeam: 'away',
    outs: 0,
    bases: [false, false, false],
    score: { away: 0, home: 0 },
    lineScore: { away: [], home: [] },
    lastRoll: null,
    log: [],
    status: 'playing',      // 'playing' | 'final'
    winner: null,
    regulationInnings: REGULATION_INNINGS,
  };
}

function clone(game) {
  return {
    ...game,
    bases: game.bases.slice(),
    score: { ...game.score },
    lineScore: { away: game.lineScore.away.slice(), home: game.lineScore.home.slice() },
    log: game.log.slice(),
  };
}

function addRuns(game, runs) {
  const team = game.battingTeam;
  game.score[team] += runs;
  const idx = game.inning - 1;
  game.lineScore[team][idx] = (game.lineScore[team][idx] ?? 0) + runs;
}

// Has the home team clinched a walk-off? Only in the bottom of an inning at or
// past regulation, the moment they lead.
function isWalkOff(game) {
  return (
    game.half === 'bottom' &&
    game.inning >= game.regulationInnings &&
    game.score.home > game.score.away
  );
}

// Is the game over at the end of a half-inning?
function isGameOver(game) {
  if (game.inning < game.regulationInnings) return false;
  if (game.half === 'top') {
    // Home need not bat if they already lead after the top of the 9th (or later).
    return game.score.home > game.score.away;
  }
  // end of a bottom half at/after regulation: over unless tied
  return game.score.home !== game.score.away;
}

function endHalfInning(game) {
  // The half just finished, so record a 0 if the batting team didn't score —
  // a played half always shows a number in the line score.
  const idx = game.inning - 1;
  if (game.lineScore[game.battingTeam][idx] == null) {
    game.lineScore[game.battingTeam][idx] = 0;
  }

  if (isGameOver(game)) {
    finalize(game);
    return;
  }
  if (game.half === 'top') {
    game.half = 'bottom';
    game.battingTeam = 'home';
  } else {
    game.half = 'top';
    game.battingTeam = 'away';
    game.inning += 1;
  }
  game.outs = 0;
  game.bases = [false, false, false];
}

function finalize(game) {
  game.status = 'final';
  game.winner = game.score.home > game.score.away ? 'home' : 'away';
}

// Apply one roll ({d1, d2}) to the game and return the new state.
export function applyRoll(game, { d1, d2 }) {
  if (game.status === 'final') return game;
  const g = clone(game);
  const sum = d1 + d2;
  const outcome = outcomeForSum(sum, g.outcomes ?? OUTCOMES);
  g.lastRoll = { d1, d2, sum, outcome };

  if (outcome.type === 'out') {
    g.outs += 1;
    g.log.unshift(`${teamName(g.battingTeam)}: ${outcome.label} (rolled ${sum}). ${g.outs} out${g.outs === 1 ? '' : 's'}.`);
    if (g.outs >= 3) endHalfInning(g);
    return g;
  }

  const { bases, runs } =
    outcome.type === 'walk' ? applyWalk(g.bases) : advanceRunners(g.bases, outcome.bases);
  g.bases = bases;
  if (runs > 0) addRuns(g, runs);
  g.log.unshift(
    `${teamName(g.battingTeam)}: ${outcome.label} (rolled ${sum})` +
      (runs > 0 ? ` — ${runs} run${runs === 1 ? '' : 's'} score!` : '.')
  );

  if (isWalkOff(g)) finalize(g);
  return g;
}

export function teamName(team) {
  return team === 'away' ? 'Away' : 'Home';
}
