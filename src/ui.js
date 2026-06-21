import {
  OUTCOMES,
  OUTCOME_CATALOG,
  DEFAULT_TABLE_IDS,
  buildTable,
  outcomeForSum,
  runnerMovements,
  newGame,
  applyRoll,
  rollWith,
  teamName,
} from './game.js';
import { createSoundPlayer, pickSound } from './sound.js';

const sound = createSoundPlayer();

// Pip coordinates (1..9 grid cells) for each die face.
const PIPS = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
const WAYS = { 2:1,3:2,4:3,5:4,6:5,7:6,8:5,9:4,10:3,11:2,12:1 };

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Re-trigger a CSS animation class even if it's already present.
function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

const FAN_COLORS = ['#d94f4f', '#4f7fd9', '#e0b341', '#5bbf6a', '#c45fb0', '#e8e8e8', '#e08a3c'];
const SVGNS = 'http://www.w3.org/2000/svg';
const HOME = [200, 340];

// Base coordinates in the field's user space. SCORE shares home plate.
const BASES = { H: [200, 340], 1: [280, 260], 2: [200, 180], 3: [120, 260], SCORE: [200, 340] };
const RING = ['H', 1, 2, 3]; // running order around the diamond

const elNS = (tag, attrs) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
const polar = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];

// --- scenery: mowing stripes, tiered crowd, light towers --------------------

function buildScenery() {
  buildStripes();
  buildCrowd();
  buildLights();
}

function buildStripes() {
  const g = $('#stripes');
  g.innerHTML = '';
  const N = 9, R = 256;
  for (let i = 0; i < N; i++) {
    const a0 = -135 + (90 * i) / N;
    const a1 = -135 + (90 * (i + 1)) / N;
    const [x0, y0] = polar(HOME[0], HOME[1], R, a0);
    const [x1, y1] = polar(HOME[0], HOME[1], R, a1);
    g.appendChild(elNS('path', {
      class: 'stripe',
      d: `M${HOME[0]},${HOME[1]} L${x0.toFixed(1)},${y0.toFixed(1)} A${R},${R} 0 0,1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`,
      'fill-opacity': i % 2 ? 0.08 : 0,
    }));
  }
}

function buildCrowd() {
  const crowd = $('#crowd');
  crowd.innerHTML = '';
  const tiers = [256, 263, 270, 277, 284];
  tiers.forEach((R, t) => {
    const count = 34 + t * 3;
    for (let i = 0; i <= count; i++) {
      const deg = -142 + (104 * i) / count;
      const [x, y] = polar(HOME[0], HOME[1], R, deg);
      if (y < 6) continue; // keep inside the frame
      const dot = elNS('circle', {
        class: 'fan', cx: x.toFixed(1), cy: y.toFixed(1), r: 2.4,
        fill: FAN_COLORS[(i + t) % FAN_COLORS.length],
      });
      dot.style.animationDelay = `${((i + t) % 12) * 0.16}s`;
      crowd.appendChild(dot);
    }
  });
}

function buildLights() {
  const g = $('#lights');
  g.innerHTML = '';
  for (const [bx, by] of [[78, 70], [322, 70]]) {
    g.appendChild(elNS('line', { class: 'light-pole', x1: bx, y1: by + 60, x2: bx, y2: by + 14 }));
    g.appendChild(elNS('rect', { class: 'light-bank', x: bx - 16, y: by - 6, width: 32, height: 20, rx: 3 }));
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) {
      g.appendChild(elNS('circle', { class: 'bulb', cx: bx - 11 + c * 7, cy: by - 1 + r * 9, r: 2 }));
    }
  }
}

// --- runners: figures that travel along the basepaths -----------------------

const TEAM_COLORS = {
  away: { jersey: '#e9ebef', dark: '#c3c7cf', cap: '#1f2d4d' },
  home: { jersey: '#e0564f', dark: '#b53d37', cap: '#7c211c' },
};

let runners = []; // [{ el, base }]  base in 1|2|3 (or 'H' while batting)

function runnerSVG({ jersey, dark, cap }) {
  return `
    <g transform="scale(1.35)">
      <ellipse class="r-shadow" cx="0" cy="0" rx="7" ry="2.4"/>
      <g class="r-body">
        <rect x="-4" y="-9" width="3.2" height="9" rx="1.3" fill="${dark}"/>
        <rect x="0.8" y="-9" width="3.2" height="9" rx="1.3" fill="${dark}"/>
        <rect x="-7.5" y="-18" width="3" height="8" rx="1.4" fill="${jersey}"/>
        <rect x="4.5" y="-18" width="3" height="8" rx="1.4" fill="${jersey}"/>
        <rect x="-5" y="-19" width="10" height="11" rx="3.5" fill="${jersey}"/>
      </g>
      <circle class="r-head" cx="0" cy="-22.5" r="3.8" fill="#e3b78d"/>
      <path d="M-4,-23.5 a4,4 0 0,1 8,0 z" fill="${cap}"/>
      <rect x="0" y="-24.5" width="6" height="1.8" rx="0.9" fill="${cap}"/>
    </g>`;
}

function createRunner(team) {
  const g = elNS('g', { class: `runner ${team}` });
  g.innerHTML = runnerSVG(TEAM_COLORS[team]);
  $('#runners').appendChild(g);
  return { el: g, base: 'H' };
}

function placeAt(el, key) {
  const [x, y] = BASES[key];
  el.style.transform = `translate(${x}px, ${y}px)`;
}

// Waypoint keys travelled from `from` to `to`, running the bases in order.
function pathKeys(from, to) {
  const start = RING.indexOf(from);
  const steps = [];
  const end = to === 'SCORE' ? 4 : RING.indexOf(to); // SCORE = past 3rd, back home
  for (let i = start + 1; i <= end; i++) steps.push(i === 4 ? 'SCORE' : RING[i]);
  return steps;
}

async function animateToken(token, from, to) {
  const keys = pathKeys(from, to);
  if (!keys.length) return;
  const coords = [from, ...keys].map((k) => BASES[k]);
  const frames = coords.map(([x, y]) => ({ transform: `translate(${x}px, ${y}px)` }));
  const dur = Math.max(340, keys.length * 280);
  token.el.classList.add('running');
  let anim;
  try { anim = token.el.animate(frames, { duration: dur, easing: 'ease-in-out', fill: 'forwards' }); } catch { /* no WAAPI */ }
  // resolve on finish OR a hard timeout, so a throttled/paused tab never hangs the roll
  await (anim ? Promise.race([anim.finished.catch(() => {}), sleep(dur + 250)]) : sleep(dur));
  token.el.classList.remove('running');
  placeAt(token.el, keys[keys.length - 1]);
  try { anim && anim.cancel(); } catch { /* ignore */ }
  if (to === 'SCORE') token.el.remove();
}

// Animate a whole play. `team` is who's batting (owns the batter + any runners).
function animateMovements(moves, team) {
  if (!moves.length) return Promise.resolve();
  const plans = moves.map((m) => {
    let token;
    if (m.from === 'H') { token = createRunner(team); placeAt(token.el, 'H'); runners.push(token); }
    else token = runners.find((t) => t.base === m.from);
    return { token, from: m.from, to: m.to };
  });
  // commit base bookkeeping up front so concurrent lookups stay correct
  plans.forEach((p) => { if (p.token && p.to !== 'SCORE') p.token.base = p.to; });
  return Promise.all(plans.map((p) => (p.token ? animateToken(p.token, p.from, p.to) : null)));
}

// Drop runners that no longer belong (half ended) and backfill any missing.
function reconcileRunners(team) {
  runners = runners.filter((t) => {
    const occupied = [1, 2, 3].includes(t.base) && game.bases[t.base - 1];
    if (!occupied) { t.el.remove(); return false; }
    return true;
  });
  game.bases.forEach((on, i) => {
    const base = i + 1;
    if (on && !runners.find((t) => t.base === base)) {
      const tk = createRunner(team);
      tk.base = base;
      placeAt(tk.el, base);
      runners.push(tk);
    }
  });
}

function clearRunners() {
  $('#runners').innerHTML = '';
  runners = [];
}

let mode = 'solo';
let tableIds = { ...DEFAULT_TABLE_IDS };
let game = newGame(mode, buildTable(tableIds));
let busy = false;       // mid-roll animation
let cpuTimer = null;

// ---- rendering -------------------------------------------------------------

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function renderDie(el, face) {
  el.dataset.face = face;
  el.innerHTML = '';
  for (let cell = 1; cell <= 9; cell++) {
    const span = document.createElement('span');
    if (PIPS[face].includes(cell)) span.className = 'pip'; // else: empty grid cell
    el.appendChild(span);
  }
}

function renderLineScore() {
  const cols = Math.max(9, game.inning);
  const head = ['<thead><tr><th class="team-name"></th>'];
  for (let i = 1; i <= cols; i++) {
    const cur = i === game.inning && game.status === 'playing' ? ' col-current' : '';
    head.push(`<th class="${cur.trim()}">${i}</th>`);
  }
  head.push('<th class="total">R</th></tr></thead>');

  const rows = [];
  for (const team of ['away', 'home']) {
    const batting = game.status === 'playing' && game.battingTeam === team ? ' batting' : '';
    const cells = [`<td class="team-name">${teamName(team)}</td>`];
    for (let i = 0; i < cols; i++) {
      const v = game.lineScore[team][i];
      const cur = i + 1 === game.inning && game.status === 'playing' ? ' col-current' : '';
      cells.push(`<td class="num${cur}">${v == null ? '' : v}</td>`);
    }
    cells.push(`<td class="total">${game.score[team]}</td>`);
    rows.push(`<tr class="${batting.trim()}">${cells.join('')}</tr>`);
  }
  $('#linescore').innerHTML = head.join('') + '<tbody>' + rows.join('') + '</tbody>';
}

function renderSituation() {
  game.bases.forEach((on, i) => $(`#base-${i + 1}`).classList.toggle('on', on));
  document.querySelectorAll('.out-dot').forEach((dot) => {
    dot.classList.toggle('on', Number(dot.dataset.out) <= game.outs);
  });
  $('#inning-arrow').textContent = game.half === 'top' ? '▲' : '▼';
  $('#inning-label').textContent =
    `${game.half === 'top' ? 'Top' : 'Bot'} ${ordinal(game.inning)}`;
}

function turnText() {
  const team = game.battingTeam;
  if (mode === 'vs-cpu') {
    return team === 'away' ? "You're up — Away" : 'CPU is batting…';
  }
  if (mode === '2p') {
    return team === 'away' ? 'Player 1 — Away' : 'Player 2 — Home';
  }
  return `${teamName(team)} is batting`;
}

function renderTurn() {
  $('#turn').textContent = game.status === 'final' ? 'Final' : turnText();
  const cpuUp = mode === 'vs-cpu' && game.battingTeam === 'home';
  $('#roll').disabled = busy || game.status === 'final' || cpuUp;
  $('#roll').textContent = cpuUp ? 'CPU rolling…' : 'Roll the dice';
}

function renderLog() {
  const ul = $('#log');
  ul.innerHTML = game.log
    .slice(0, 40)
    .map((entry) => `<li class="${logClass(entry)}">${entry}</li>`)
    .join('');
}

function logClass(entry) {
  if (/run.* score/i.test(entry)) return 'is-event';
  if (/Strikeout|Groundout|Flyout|Pop Fly/.test(entry)) return 'is-out';
  if (/Walk/.test(entry)) return 'is-walk';
  return 'is-hit';
}

function renderResult(runsScored) {
  const el = $('#result');
  const r = game.lastRoll;
  if (!r) return;
  const type = r.outcome.type;
  let text = r.outcome.label.toUpperCase();
  if (runsScored > 0) text += ` — ${runsScored} run${runsScored === 1 ? '' : 's'} score!`;
  el.textContent = text;
  el.className = 'result pop ' + (type === 'hit' ? 'hit' : type === 'out' ? 'out' : 'walk');
  // restart pop animation
  void el.offsetWidth;
}

function renderBanner() {
  const banner = $('#banner');
  if (game.status !== 'final') { banner.classList.add('hidden'); banner.innerHTML = ''; return; }
  const winner = teamName(game.winner);
  const loser = teamName(game.winner === 'home' ? 'away' : 'home');
  const ws = game.score[game.winner];
  const ls = game.score[game.winner === 'home' ? 'away' : 'home'];
  banner.classList.remove('hidden');
  banner.innerHTML = `
    <div class="card">
      <h2>${winner} win!</h2>
      <p>${winner} ${ws}, ${loser} ${ls} &middot; ${ordinal(game.inning)} inning</p>
      <button id="play-again" class="btn-roll">Play again</button>
    </div>`;
  $('#play-again').addEventListener('click', () => startGame(mode));
}

function renderRules() {
  const rows = [];
  for (let sum = 2; sum <= 12; sum++) {
    const opts = Object.values(OUTCOME_CATALOG)
      .map((o) => `<option value="${o.id}" ${o.id === tableIds[sum] ? 'selected' : ''}>${o.label}</option>`)
      .join('');
    rows.push(
      `<tr><td class="sum">${sum}</td><td class="ways">${WAYS[sum]}/36</td>` +
      `<td><select data-sum="${sum}">${opts}</select></td></tr>`
    );
  }
  $('#rules-table').innerHTML = rows.join('');
}

function render() {
  renderLineScore();
  renderSituation();
  renderTurn();
  renderLog();
  renderBanner();
  document.querySelectorAll('.mode-btn').forEach((b) =>
    b.classList.toggle('active', b.dataset.mode === mode));
  maybeCpuRoll();
}

// ---- actions ---------------------------------------------------------------

function startGame(nextMode) {
  clearTimeout(cpuTimer);
  mode = nextMode;
  game = newGame(mode, buildTable(tableIds));
  busy = false;
  clearRunners();
  $('#result').textContent = 'Roll to start the game';
  $('#result').className = 'result';
  renderDie($('#die1'), 1);
  renderDie($('#die2'), 1);
  render();
}

async function doRoll() {
  if (busy || game.status === 'final') return;
  busy = true;
  $('#roll').disabled = true;
  const d1 = $('#die1'), d2 = $('#die2');
  d1.classList.add('rolling');
  d2.classList.add('rolling');
  sound.unlock();
  sound.play('roll');

  // tumble the dice, then settle on the real roll
  for (let i = 0; i < 6; i++) {
    renderDie(d1, 1 + Math.floor(Math.random() * 6));
    renderDie(d2, 1 + Math.floor(Math.random() * 6));
    await sleep(70);
  }
  const roll = rollWith();
  renderDie(d1, roll.d1);
  renderDie(d2, roll.d2);
  d1.classList.remove('rolling');
  d2.classList.remove('rolling');

  // capture pre-roll state so we can animate who runs where
  const table = game.outcomes || OUTCOMES;
  const outcome = outcomeForSum(roll.sum, table);
  const preBases = game.bases.slice();
  const team = game.battingTeam;
  const before = game.score.away + game.score.home;

  game = applyRoll(game, roll);
  const runsScored = game.score.away + game.score.home - before; // only batting team can score
  renderResult(runsScored);
  sound.play(pickSound({ outcome, runsScored, isFinal: game.status === 'final' }));
  renderSituation();         // light up the destination bases as runners head there

  await animateMovements(runnerMovements(preBases, outcome), team);
  reconcileRunners(game.battingTeam);
  if (runsScored > 0) cheer();

  busy = false;
  render();
}

function cheer() {
  const svg = $('.field');
  restartAnim(svg, 'cheering');
  setTimeout(() => svg.classList.remove('cheering'), 2000);
}

function maybeCpuRoll() {
  clearTimeout(cpuTimer);
  if (mode === 'vs-cpu' && game.status === 'playing' && game.battingTeam === 'home' && !busy) {
    cpuTimer = setTimeout(doRoll, 850);
  }
}

// ---- wiring ----------------------------------------------------------------

document.querySelectorAll('.mode-btn').forEach((btn) =>
  btn.addEventListener('click', () => startGame(btn.dataset.mode)));

$('#new-game').addEventListener('click', () => startGame(mode));

$('#sound-toggle').addEventListener('click', () => {
  const muted = sound.toggle();
  $('#sound-toggle').textContent = muted ? '🔇' : '🔊';
  if (!muted) { sound.unlock(); sound.play('walk'); } // quick blip to confirm
});
$('#roll').addEventListener('click', doRoll);

$('#rules-table').addEventListener('change', (e) => {
  const sel = e.target.closest('select');
  if (!sel) return;
  tableIds[sel.dataset.sum] = sel.value;
  const table = buildTable(tableIds);
  game.outcomes = table; // applies to the rest of this game
});

document.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !$('#roll').disabled) { e.preventDefault(); doRoll(); }
});

// init
buildScenery();
renderDie($('#die1'), 1);
renderDie($('#die2'), 1);
renderRules();
render();
