import {
  OUTCOME_CATALOG,
  DEFAULT_TABLE_IDS,
  buildTable,
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

// Re-trigger a CSS animation class even if it's already present.
function restartAnim(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

const FAN_COLORS = ['#d94f4f', '#4f7fd9', '#e0b341', '#5bbf6a', '#c45fb0', '#e8e8e8', '#e08a3c'];
const SVGNS = 'http://www.w3.org/2000/svg';

// Fill the stands with rows of fans that follow the dome of the grandstand.
function buildCrowd() {
  const crowd = $('#crowd');
  crowd.innerHTML = '';
  const cols = 17;
  for (let c = 0; c < cols; c++) {
    const x = 14 + c * (172 / (cols - 1));
    const t = (x - 8) / 184;                 // 0..1 across the stands
    const top = -6 - Math.sin(t * Math.PI) * 42; // dome line
    for (let row = 0; row < 3; row++) {
      const dot = document.createElementNS(SVGNS, 'circle');
      dot.setAttribute('class', 'fan');
      dot.setAttribute('cx', x.toFixed(1));
      dot.setAttribute('cy', (top + 4 + row * 8.5).toFixed(1));
      dot.setAttribute('r', '2.6');
      dot.setAttribute('fill', FAN_COLORS[(c + row) % FAN_COLORS.length]);
      dot.style.animationDelay = `${((c * 3 + row) % 12) * 0.18}s`;
      crowd.appendChild(dot);
    }
  }
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

let prevBases = [false, false, false];

function renderSituation() {
  const runnerEls = ['#runner-1', '#runner-2', '#runner-3'];
  game.bases.forEach((on, i) => {
    $(`#base-${i + 1}`).classList.toggle('on', on);
    const runner = $(runnerEls[i]);
    runner.classList.toggle('on', on);
    if (on && !prevBases[i]) restartAnim(runner, 'dash'); // a runner just arrived
  });
  prevBases = game.bases.slice();
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
  prevBases = [false, false, false];
  $('#result').textContent = 'Roll to start the game';
  $('#result').className = 'result';
  renderDie($('#die1'), 1);
  renderDie($('#die2'), 1);
  render();
}

function doRoll() {
  if (busy || game.status === 'final') return;
  busy = true;
  $('#roll').disabled = true;
  const d1 = $('#die1'), d2 = $('#die2');
  d1.classList.add('rolling');
  d2.classList.add('rolling');
  restartAnim($('#batter'), 'swing');
  sound.unlock();
  sound.play('roll');

  // brief tumble, cycling faces, then settle on the real roll
  let ticks = 0;
  const tumble = setInterval(() => {
    renderDie(d1, 1 + Math.floor(Math.random() * 6));
    renderDie(d2, 1 + Math.floor(Math.random() * 6));
    if (++ticks >= 6) {
      clearInterval(tumble);
      const roll = rollWith();
      renderDie(d1, roll.d1);
      renderDie(d2, roll.d2);
      d1.classList.remove('rolling');
      d2.classList.remove('rolling');
      // only the batting team can score, so the change in total runs is the
      // runs scored on this roll (regardless of any half-inning change after).
      const before = game.score.away + game.score.home;
      game = applyRoll(game, roll);
      const runsScored = game.score.away + game.score.home - before;
      renderResult(runsScored);
      sound.play(pickSound({
        outcome: game.lastRoll.outcome,
        runsScored,
        isFinal: game.status === 'final',
      }));
      if (runsScored > 0) cheer();
      busy = false;
      render();
    }
  }, 70);
}

function cheer() {
  const svg = $('.diamond');
  restartAnim(svg, 'cheering');
  setTimeout(() => svg.classList.remove('cheering'), 1900);
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
buildCrowd();
renderDie($('#die1'), 1);
renderDie($('#die2'), 1);
renderRules();
render();
