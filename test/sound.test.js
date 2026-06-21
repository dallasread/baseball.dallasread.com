import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pickSound } from '../src/sound.js';
import { OUTCOME_CATALOG } from '../src/game.js';

const ev = (outcome, runsScored = 0, isFinal = false) => ({ outcome, runsScored, isFinal });

test('an out plays the out sound', () => {
  assert.equal(pickSound(ev(OUTCOME_CATALOG.STRIKEOUT)), 'out');
  assert.equal(pickSound(ev(OUTCOME_CATALOG.FLYOUT)), 'out');
});

test('a walk plays the walk sound', () => {
  assert.equal(pickSound(ev(OUTCOME_CATALOG.WALK)), 'walk');
});

test('a base hit with no runs plays the bat-crack hit sound', () => {
  assert.equal(pickSound(ev(OUTCOME_CATALOG.SINGLE)), 'hit');
  assert.equal(pickSound(ev(OUTCOME_CATALOG.DOUBLE)), 'hit');
});

test('a home run always plays the home-run sound', () => {
  assert.equal(pickSound(ev(OUTCOME_CATALOG.HOME_RUN, 1)), 'homerun');
  assert.equal(pickSound(ev(OUTCOME_CATALOG.HOME_RUN, 4)), 'homerun');
});

test('a non-homer hit that drives in runs plays the cheer/score sound', () => {
  assert.equal(pickSound(ev(OUTCOME_CATALOG.DOUBLE, 2)), 'score');
  assert.equal(pickSound(ev(OUTCOME_CATALOG.SINGLE, 1)), 'score');
});

test('a walk that forces in a run still cheers', () => {
  assert.equal(pickSound(ev(OUTCOME_CATALOG.WALK, 1)), 'score');
});

test('the final out/play of the game plays the win fanfare', () => {
  assert.equal(pickSound(ev(OUTCOME_CATALOG.STRIKEOUT, 0, true)), 'win');
  assert.equal(pickSound(ev(OUTCOME_CATALOG.HOME_RUN, 1, true)), 'win');
});
