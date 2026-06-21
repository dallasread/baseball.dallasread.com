import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  OUTCOMES,
  OUTCOME_CATALOG,
  buildTable,
  outcomeForSum,
  advanceRunners,
  applyWalk,
  runnerMovements,
  newGame,
  applyRoll,
  rollWith,
} from '../src/game.js';

test('the dice table covers every sum 2..12', () => {
  for (let sum = 2; sum <= 12; sum++) {
    assert.ok(OUTCOMES[sum], `missing outcome for sum ${sum}`);
  }
  assert.equal(Object.keys(OUTCOMES).length, 11);
});

test('outcomeForSum maps sums to the documented outcomes', () => {
  assert.equal(outcomeForSum(2).id, 'HOME_RUN');
  assert.equal(outcomeForSum(3).id, 'TRIPLE');
  assert.equal(outcomeForSum(4).id, 'DOUBLE');
  assert.equal(outcomeForSum(5).id, 'POPFLY');
  assert.equal(outcomeForSum(6).id, 'GROUNDOUT');
  assert.equal(outcomeForSum(7).id, 'STRIKEOUT');
  assert.equal(outcomeForSum(8).id, 'FLYOUT');
  assert.equal(outcomeForSum(9).id, 'GROUNDOUT');
  assert.equal(outcomeForSum(10).id, 'SINGLE');
  assert.equal(outcomeForSum(11).id, 'WALK');
  assert.equal(outcomeForSum(12).id, 'HOME_RUN');
});

test('the common middle sums 5-9 are outs (24/36 ways)', () => {
  const ways = { 2:1,3:2,4:3,5:4,6:5,7:6,8:5,9:4,10:3,11:2,12:1 };
  let outWays = 0;
  for (let sum = 2; sum <= 12; sum++) {
    if (outcomeForSum(sum).type === 'out') outWays += ways[sum];
  }
  assert.equal(outWays, 24);
});

test('a custom table changes what a sum does for that game', () => {
  // Reassign sum 7 from a strikeout to a home run.
  const table = buildTable({ ...defaultIds(), 7: 'HOME_RUN' });
  let g = newGame('solo', table);
  g = applyRoll(g, { d1: 3, d2: 4 }); // sum 7
  assert.equal(g.score.away, 1);
  assert.equal(g.outs, 0);
});

function defaultIds() {
  const ids = {};
  for (let sum = 2; sum <= 12; sum++) ids[sum] = OUTCOMES[sum].id;
  return ids;
}

test('the catalog exposes the outcomes a cell can be set to', () => {
  assert.ok(OUTCOME_CATALOG.HOME_RUN);
  assert.equal(OUTCOME_CATALOG.HOME_RUN.type, 'hit');
  assert.equal(OUTCOME_CATALOG.STRIKEOUT.type, 'out');
});

// --- baserunning ------------------------------------------------------------

test('a single with empty bases puts the batter on first, no runs', () => {
  const { bases, runs } = advanceRunners([false, false, false], 1);
  assert.deepEqual(bases, [true, false, false]);
  assert.equal(runs, 0);
});

test('a single advances every runner one base; runner on third scores', () => {
  const { bases, runs } = advanceRunners([true, false, true], 1); // 1st & 3rd
  assert.deepEqual(bases, [true, true, false]); // batter->1st, old-1st->2nd
  assert.equal(runs, 1); // old 3rd scored
});

test('a double scores a runner from second and puts batter on second', () => {
  const { bases, runs } = advanceRunners([false, true, false], 2);
  assert.deepEqual(bases, [false, true, false]); // batter on 2nd
  assert.equal(runs, 1);
});

test('a triple clears the bases and leaves the batter on third', () => {
  const { bases, runs } = advanceRunners([true, true, true], 3);
  assert.deepEqual(bases, [false, false, true]);
  assert.equal(runs, 3);
});

test('a grand slam home run scores four', () => {
  const { bases, runs } = advanceRunners([true, true, true], 4);
  assert.deepEqual(bases, [false, false, false]);
  assert.equal(runs, 4);
});

// --- walks (forced advance only) -------------------------------------------

test('a walk with empty bases only puts the batter on first', () => {
  const { bases, runs } = applyWalk([false, false, false]);
  assert.deepEqual(bases, [true, false, false]);
  assert.equal(runs, 0);
});

test('a walk does NOT advance an unforced runner on second', () => {
  const { bases, runs } = applyWalk([false, true, false]);
  assert.deepEqual(bases, [true, true, false]); // runner on 2nd stays
  assert.equal(runs, 0);
});

test('a walk with a runner on first forces him to second', () => {
  const { bases, runs } = applyWalk([true, false, false]);
  assert.deepEqual(bases, [true, true, false]);
  assert.equal(runs, 0);
});

test('a walk with the bases loaded forces in a run', () => {
  const { bases, runs } = applyWalk([true, true, true]);
  assert.deepEqual(bases, [true, true, true]);
  assert.equal(runs, 1);
});

// --- runner movements (for travel animation) --------------------------------

const C = OUTCOME_CATALOG;

test('an out moves nobody', () => {
  assert.deepEqual(runnerMovements([true, true, true], C.STRIKEOUT), []);
});

test('a single with empty bases just sends the batter home->first', () => {
  assert.deepEqual(runnerMovements([false, false, false], C.SINGLE), [
    { from: 'H', to: 1 },
  ]);
});

test('a single advances a runner on first and the batter', () => {
  assert.deepEqual(runnerMovements([true, false, false], C.SINGLE), [
    { from: 1, to: 2 },
    { from: 'H', to: 1 },
  ]);
});

test('a single scores the runner from third', () => {
  assert.deepEqual(runnerMovements([false, false, true], C.SINGLE), [
    { from: 3, to: 'SCORE' },
    { from: 'H', to: 1 },
  ]);
});

test('a grand slam sends all three runners and the batter across the plate', () => {
  const moves = runnerMovements([true, true, true], C.HOME_RUN);
  assert.equal(moves.filter((m) => m.to === 'SCORE').length, 4);
  assert.ok(moves.some((m) => m.from === 'H' && m.to === 'SCORE'));
});

test('a walk only advances forced runners', () => {
  // runner on second is NOT forced by a walk
  assert.deepEqual(runnerMovements([false, true, false], C.WALK), [
    { from: 'H', to: 1 },
  ]);
  // bases loaded: everyone behind the batter is forced up one
  assert.deepEqual(runnerMovements([true, true, true], C.WALK), [
    { from: 3, to: 'SCORE' },
    { from: 2, to: 3 },
    { from: 1, to: 2 },
    { from: 'H', to: 1 },
  ]);
});

test('the number of SCORE moves always equals the runs the engine awards', () => {
  const bases = [
    [false, false, false], [true, false, false], [false, true, false],
    [false, false, true], [true, true, true], [true, false, true],
  ];
  for (const b of bases) {
    for (const o of Object.values(C)) {
      const moves = runnerMovements(b, o);
      const scoreMoves = moves.filter((m) => m.to === 'SCORE').length;
      const runs = o.type === 'out' ? 0
        : o.type === 'walk' ? applyWalk(b).runs
        : advanceRunners(b, o.bases).runs;
      assert.equal(scoreMoves, runs, `mismatch for ${o.id} with ${b}`);
    }
  }
});

// --- game flow --------------------------------------------------------------

test('a new game starts in the top of the first with the away team batting', () => {
  const g = newGame();
  assert.equal(g.inning, 1);
  assert.equal(g.half, 'top');
  assert.equal(g.battingTeam, 'away');
  assert.equal(g.outs, 0);
  assert.deepEqual(g.bases, [false, false, false]);
  assert.deepEqual(g.score, { away: 0, home: 0 });
  assert.equal(g.status, 'playing');
});

test('three outs end the half-inning and clear the bases', () => {
  let g = newGame();
  g = applyRoll(g, { d1: 3, d2: 4 }); // sum 7 strikeout
  g = applyRoll(g, { d1: 3, d2: 4 });
  assert.equal(g.outs, 2);
  g = applyRoll(g, { d1: 3, d2: 4 }); // 3rd out
  assert.equal(g.half, 'bottom');
  assert.equal(g.inning, 1);
  assert.equal(g.outs, 0);
  assert.deepEqual(g.bases, [false, false, false]);
  assert.equal(g.battingTeam, 'home');
});

test('a home run with empty bases scores exactly one run for the batting team', () => {
  let g = newGame();
  g = applyRoll(g, { d1: 1, d2: 1 }); // sum 2 home run
  assert.equal(g.score.away, 1);
  assert.equal(g.outs, 0);
  assert.deepEqual(g.bases, [false, false, false]);
});

test('runs are recorded into the correct half-inning of the line score', () => {
  let g = newGame();
  g = applyRoll(g, { d1: 1, d2: 1 }); // away scores in top 1st
  assert.equal(g.lineScore.away[0], 1);
  assert.equal(g.lineScore.home[0] ?? 0, 0);
});

test('a scoreless half-inning records a 0 in the line score', () => {
  let g = newGame();
  g = applyRoll(g, { d1: 3, d2: 4 });
  g = applyRoll(g, { d1: 3, d2: 4 });
  g = applyRoll(g, { d1: 3, d2: 4 }); // three outs, no runs
  assert.equal(g.lineScore.away[0], 0);
});

test('rollWith uses the injected rng so games are deterministic in tests', () => {
  const roll = rollWith(() => 0); // floor(0*6)+1 = 1 on each die
  assert.deepEqual(roll, { d1: 1, d2: 1, sum: 2 });
});

// --- ending conditions ------------------------------------------------------

test('the home team does not bat in the bottom of the 9th when already ahead', () => {
  let g = newGame();
  g.inning = 9;
  g.half = 'top';
  g.score = { away: 0, home: 3 };
  // away makes three outs in the top of the 9th, still trailing
  g = applyRoll(g, { d1: 3, d2: 4 });
  g = applyRoll(g, { d1: 3, d2: 4 });
  g = applyRoll(g, { d1: 3, d2: 4 });
  assert.equal(g.status, 'final');
  assert.equal(g.winner, 'home');
});

test('a walk-off ends the game the instant the home team takes the lead', () => {
  let g = newGame();
  g.inning = 9;
  g.half = 'bottom';
  g.battingTeam = 'home';
  g.score = { away: 2, home: 2 };
  g = applyRoll(g, { d1: 1, d2: 1 }); // home run, home goes ahead 3-2
  assert.equal(g.status, 'final');
  assert.equal(g.winner, 'home');
  assert.equal(g.score.home, 3);
});

test('the game goes to extra innings when tied after nine', () => {
  let g = newGame();
  g.inning = 9;
  g.half = 'bottom';
  g.battingTeam = 'home';
  g.score = { away: 1, home: 1 };
  g = applyRoll(g, { d1: 3, d2: 4 });
  g = applyRoll(g, { d1: 3, d2: 4 });
  g = applyRoll(g, { d1: 3, d2: 4 }); // three outs, still tied
  assert.equal(g.status, 'playing');
  assert.equal(g.inning, 10);
  assert.equal(g.half, 'top');
});
