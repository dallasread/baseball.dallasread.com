# Dice Baseball

A single-page baseball game played by rolling two dice. Pure vanilla HTML/CSS/JS,
no build step — open `index.html` in a browser.

## How to play

Each plate appearance is **one roll of two dice (2d6)**. The **sum** (2–12) decides
what happens. Low and high sums are exciting (hits); the common middle sums are outs.

| Sum | Ways | Outcome           | Type |
|-----|------|-------------------|------|
| 2   | 1    | Home Run          | hit  |
| 3   | 2    | Triple            | hit  |
| 4   | 3    | Double            | hit  |
| 5   | 4    | Pop Fly           | out  |
| 6   | 5    | Groundout         | out  |
| 7   | 6    | Strikeout         | out  |
| 8   | 5    | Flyout            | out  |
| 9   | 4    | Groundout         | out  |
| 10  | 3    | Single            | hit  |
| 11  | 2    | Walk              | walk |
| 12  | 1    | Home Run          | hit  |

Outs total 24/36 (~67%), which keeps games to a believable score (~6–7 runs per
team) instead of a slugfest. The dice table is data (`DEFAULT_TABLE_IDS` in
`src/game.js`) and is editable in-app, so it can be tweaked without touching game
logic.

## Rules modeled

- **9 innings**, 3 outs per half-inning. Away team bats in the top, home in the bottom.
- **Hits** advance the batter and every runner by N bases: Single 1, Double 2, Triple 3,
  Home Run 4 (everyone scores). A runner reaching base 4 (home) scores a run.
- **Walks** are forced advances only: the batter takes first; runners advance only if
  the base behind them is forced. Bases loaded + walk scores a run.
- **Extra innings** when tied after 9.
- **Home team does not bat** in the bottom of the final inning if already leading.
- **Walk-off**: in the bottom of the final (or later) inning, the game ends the instant
  the home team takes the lead.

## Game modes

- **Solo** — one player rolls for both teams (quick play / practice).
- **Vs CPU** — you are the Away team; the CPU auto-rolls its half-innings.
- **Two players** — hotseat; Away is Player 1, Home is Player 2.

The game engine is identical across modes; the mode only decides who triggers a roll.

## Presentation

The field is a vector ballpark (striped outfield, dirt infield, mound, foul lines,
warning track + wall, light towers, and a tiered animated crowd). Runners are drawn
figures in the batting team's colours that **travel base-to-base** along the
basepaths when they advance — the paths come from `runnerMovements` in
`src/game.js` (pure + unit tested), and the UI animates them with the Web
Animations API.

## Sound

Effects are synthesized live with the Web Audio API (no audio files): a dice rattle
on every roll, a bat crack on a hit, a descending tone on an out, a blip on a walk,
a rising arpeggio + crowd swell when runs score, and a fanfare on the final out.
Toggle with the 🔊 button. The event→sound mapping (`pickSound` in `src/sound.js`)
is pure and unit tested.

## Project layout

```
dice-baseball/
  index.html        # single page
  styles.css
  src/
    game.js         # pure game logic (no DOM) — the spec lives in test/
    ui.js           # DOM rendering + interaction, imports game.js
  test/
    game.test.js    # node:test specs for game.js
```

## Running tests

```
npm test
```

Tests use Node's built-in `node:test` runner (no dependencies).
