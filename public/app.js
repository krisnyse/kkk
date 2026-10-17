import { PERIODS } from './periods.js';

const SERIES = ['--series-1', '--series-2', '--series-3', '--series-4'];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)} %`);
const date = (t) => new Date(t * 1000).toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' });
const time = (t) => new Date(t * 1000).toLocaleString('no-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const month = (key) => new Date(`${key}-15`).toLocaleDateString('no-NO', { month: 'short', year: 'numeric' });
const minutes = (s) => (s ? `${Math.round(s / 60)} min` : '');

let chart = null;
let eloChart = null;
let monthChart = null;
let colorOf = new Map();

function table(el, rows, nameHeader) {
  if (!rows.length) {
    el.innerHTML = '<tbody><tr><td class="muted">Ingen kamper i perioden.</td></tr></tbody>';
    return;
  }
  const max = Math.max(...rows.map((r) => r.games));
  el.innerHTML = `
    <thead><tr><th>${nameHeader}</th><th class="num">Kamper</th><th class="num">Seire</th><th class="num">Winrate</th></tr></thead>
    <tbody>${rows.map((r) => `
      <tr>
        <td>${esc(r.name)}</td>
        <td class="num"><span class="bar" style="width:${Math.round((r.games / max) * 40)}px"></span>${r.games}</td>
        <td class="num">${r.wins}</td>
        <td class="num">${pct(r.winRate)}</td>
      </tr>`).join('')}
    </tbody>`;
}

function render(stats) {
  // Fargen følger spilleren, uansett periode
  colorOf = new Map(stats.players.map((p, i) => [p.profileId, SERIES[i]]));

  document.getElementById('updated').textContent = stats.updatedAt
    ? `${stats.totalMatches} kamper i perioden · sist oppdatert ${new Date(stats.updatedAt).toLocaleString('no-NO')}`
    : 'Ingen data hentet ennå. Serveren henter ved oppstart og deretter jevnlig.';


  // Spillerkort
  document.getElementById('players').innerHTML = stats.players.map((p) => {
    const team = p.ratings.rmTeam;
    const solo = p.ratings.rm1v1;
    return `
      <article class="card" style="--c: var(${colorOf.get(p.profileId)})">
        <h3>${esc(p.name)}</h3>
        <div class="stat">Lag-RM <b>${team?.rating ?? '–'}</b></div>
        <div class="stat">Lag W/L <b>${team ? `${team.wins}/${team.losses}` : '–'}</b></div>
        <div class="stat">1v1-RM <b>${solo?.rating ?? '–'}</b></div>
        <div class="stat">Winrate i perioden <b>${pct(p.winRate)}</b></div>
        <div class="stat">Kamper i perioden <b>${p.games}</b></div>
      </article>`;
  }).join('');

  // Siste kamp (uavhengig av periode)
  const lm = stats.lastMatch;
  const box = document.getElementById('last-match');
  box.hidden = !lm;
  if (lm) {
    const diff = lm.ourRating != null && lm.theirRating != null ? lm.ourRating - lm.theirRating : null;
    box.className = `panel last-match ${lm.won ? 'won' : 'lost'}`;
    box.innerHTML = `
      <h2>Siste kamp</h2>
      <div class="lm-head"><span class="lm-result">${lm.won ? 'Seier' : 'Tap'}</span>
        <span>${esc(lm.map)} · ${esc(lm.type)}</span><span class="muted">${time(lm.start)}${lm.duration ? ` · ${minutes(lm.duration)}` : ''}</span></div>
      <div class="lm-players">${lm.clanPlayers.map((p) => `
        <div><b>${esc(p.name)}</b> ${esc(p.civ)}${p.ratingChange != null ? ` <span class="${p.ratingChange >= 0 ? 'up' : 'down'}">${p.ratingChange >= 0 ? '+' : '−'}${Math.abs(p.ratingChange)}</span>` : ''}</div>`).join('')}</div>
      <div class="lm-stats">
        <div class="stat">Snittrating oss <b>${lm.ourRating ?? '–'}</b></div>
        <div class="stat">Snittrating motstander <b>${lm.theirRating ?? '–'}</b></div>
        <div class="stat">Forskjell <b>${diff == null ? '–' : `${diff >= 0 ? '+' : '−'}${Math.abs(diff)}`}</b></div>
        <div class="stat">Vi på ${esc(lm.map)} <b>${lm.mapWins} av ${lm.mapGames} seire</b></div>
      </div>`;
  }

  // Klan-Elo: følger valgt periode
  const elo = stats.clanElo;
  document.getElementById('clan-elo-now').textContent = elo?.current ?? '–';
  const change = document.getElementById('clan-elo-change');
  change.innerHTML = elo?.change != null
    ? `<span class="${elo.change >= 0 ? 'up' : 'down'}">${elo.change >= 0 ? '+' : '−'}${Math.abs(elo.change)}</span> i perioden`
    : '';
  eloChart?.destroy();
  eloChart = null;
  document.getElementById('clan-elo-wrap').hidden = !elo?.points.length;
  if (elo?.points.length) {
    Chart.defaults.color = css('--text-2');
    Chart.defaults.borderColor = css('--border');
    eloChart = new Chart(document.getElementById('clan-elo-chart'), {
      type: 'line',
      data: {
        datasets: [{
          label: 'Klan-Elo',
          data: elo.points.map((p) => ({ x: p.t, y: p.rating })),
          borderColor: css('--text'),
          backgroundColor: css('--text'),
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0,
        }],
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { type: 'linear', min: elo.points[0].t, max: elo.points.at(-1).t, ticks: { callback: (v) => date(v), maxTicksLimit: 5 }, grid: { display: false } },
          y: { ticks: { maxTicksLimit: 5 } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { title: (items) => date(items[0].parsed.x) } },
        },
      },
    });
  }

  // Ratinggraf
  const withHistory = stats.players.filter((p) => p.ratingHistory.length);
  chart?.destroy();
  chart = null;
  document.getElementById('rating-empty').hidden = withHistory.length > 0;
  document.getElementById('rating-wrap').hidden = !withHistory.length;
  if (withHistory.length) {
    Chart.defaults.color = css('--text-2');
    Chart.defaults.borderColor = css('--border');
    chart = new Chart(document.getElementById('rating-chart'), {
      type: 'line',
      data: {
        datasets: withHistory.map((p) => ({
          label: p.name,
          data: p.ratingHistory.map((h) => ({ x: h.t, y: h.rating })),
          borderColor: css(colorOf.get(p.profileId)),
          backgroundColor: css(colorOf.get(p.profileId)),
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0,
        })),
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { type: 'linear', min: stats.since ?? undefined, ticks: { callback: (v) => date(v), maxTicksLimit: 6 }, grid: { display: false } },
          y: { ticks: { maxTicksLimit: 6 } },
        },
        plugins: {
          legend: { position: 'top', align: 'start', labels: { boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: { title: (items) => time(items[0].parsed.x) } },
        },
      },
    });
  }

  table(document.getElementById('lineups'), stats.lineups, 'Lag');
  table(document.getElementById('clan-maps'), stats.clanMaps, 'Kart');

  // Trender
  const t = stats.trends;
  monthChart?.destroy();
  monthChart = null;
  document.getElementById('month-empty').hidden = t.byMonth.length > 0;
  document.getElementById('month-wrap').hidden = !t.byMonth.length;
  if (t.byMonth.length) {
    monthChart = new Chart(document.getElementById('month-chart'), {
      type: 'bar',
      data: {
        labels: t.byMonth.map((m) => month(m.key)),
        datasets: [{
          label: 'Winrate',
          data: t.byMonth.map((m) => m.winRate * 100),
          backgroundColor: t.byMonth.map((m) => css(m.winRate >= 0.5 ? '--win' : '--loss')),
          borderRadius: 2,
        }],
      },
      options: {
        maintainAspectRatio: false,
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 12, autoSkip: true } },
          y: { suggestedMin: 30, suggestedMax: 70, ticks: { callback: (v) => `${v} %`, maxTicksLimit: 5 } },
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (item) => `${Math.round(item.parsed.y)} % av ${t.byMonth[item.dataIndex].games} kamper` } },
        },
      },
    });
  }

  document.getElementById('enemy-note').textContent =
    `Hvor ofte vi vinner mot hver civ på motstanderlaget. Bare civer vi har møtt minst ${t.enemyCivs.minGames} ganger.`;
  table(document.getElementById('enemy-worst'), t.enemyCivs.worst, 'Civ');
  table(document.getElementById('enemy-best'), t.enemyCivs.best, 'Civ');
  table(document.getElementById('rating-diff'), t.byRatingDiff, 'Vår rating');
  table(document.getElementById('lengths'), t.byLength, 'Lengde');
  table(document.getElementById('weekdays'), t.byWeekday, 'Dag');
  table(document.getElementById('hours'), t.byHour, 'Tid');

  const streak = (n) => (n > 0 ? `<span class="up">${n} S</span>` : n < 0 ? `<span class="down">${-n} T</span>` : '–');
  document.getElementById('streaks').innerHTML = `
    <thead><tr><th>Spiller</th><th class="num">Flest seire</th><th class="num">Flest tap</th><th class="num">Nå</th></tr></thead>
    <tbody>${stats.players.map((p) => `
      <tr>
        <td><span class="dot inline" style="--c: var(${colorOf.get(p.profileId)})"></span>${esc(p.name)}</td>
        <td class="num">${p.streaks.bestWin}</td>
        <td class="num">${p.streaks.bestLoss}</td>
        <td class="num">${streak(p.streaks.current)}</td>
      </tr>`).join('')}
    </tbody>`;

  // Civer per spiller
  document.getElementById('player-civs').innerHTML = stats.players.map((p) => `
    <div>
      <h4><span class="dot" style="--c: var(${colorOf.get(p.profileId)})"></span>${esc(p.name)}</h4>
      <table data-player="${p.profileId}"></table>
    </div>`).join('');
  for (const p of stats.players) table(document.querySelector(`[data-player="${p.profileId}"]`), p.civs, 'Civ');

  // Siste kamper
  document.getElementById('recent').innerHTML = stats.recent.length ? stats.recent.map((m) => `
    <div class="match">
      <div class="match-head"><b>${esc(m.map)}</b><span>${esc(m.type)}</span><span>${time(m.start)}</span><span>${minutes(m.duration)}</span></div>
      <div class="teams">${m.teams.map((t) => `
        <div class="team ${t.won ? 'won' : 'lost'}">
          <div class="result">${t.won ? 'Seier' : 'Tap'}</div>
          ${t.players.map((p) => `
            <div class="p ${p.clan ? 'clan' : ''}">
              <span>${p.clan ? esc(p.name) : 'Annen spiller'}</span>
              <span>${esc(p.civ)}${p.clan && p.ratingChange != null ? ` <span class="${p.ratingChange >= 0 ? 'up' : 'down'}">${p.ratingChange >= 0 ? '+' : ''}${p.ratingChange}</span>` : ''}</span>
            </div>`).join('')}
        </div>`).join('')}
      </div>
    </div>`).join('') : '<p class="muted small">Ingen kamper i perioden.</p>';
}

// Periodevelger: husker valget i adressen (#periode=1y), så lenken kan deles
const picker = document.getElementById('period');
picker.innerHTML = PERIODS.map((p) => `<button type="button" data-key="${p.key}">${p.label}</button>`).join('');

async function show(key) {
  if (!PERIODS.some((p) => p.key === key)) key = 'all';
  for (const b of picker.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.key === key));
  history.replaceState(null, '', key === 'all' ? location.pathname : `#periode=${key}`);
  render(await fetch(`api/stats-${key}.json`).then((r) => r.json()));
}

picker.addEventListener('click', (e) => {
  const key = e.target.closest('button')?.dataset.key;
  if (key) show(key);
});

await show(new URLSearchParams(location.hash.slice(1)).get('periode') ?? 'all');
