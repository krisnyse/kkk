import { PERIODS } from './periods.js';

const SERIES = ['--series-1', '--series-2', '--series-3', '--series-4'];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)} %`);
const date = (t) => new Date(t * 1000).toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' });
const time = (t) => new Date(t * 1000).toLocaleString('no-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const month = (key) => new Date(`${key}-15`).toLocaleDateString('no-NO', { month: 'short', year: 'numeric' });
const minutes = (s) => (s ? `${Math.round(s / 60)} min` : '');
const signed = (n) => (n == null ? '–' : `${n >= 0 ? '+' : '−'}${Math.abs(n)}`);
const upDown = (n) => (n == null ? '' : `<span class="${n >= 0 ? 'up' : 'down'}">${signed(n)}</span>`);
const day = (d) => new Date(`${d}T12:00:00`).toLocaleDateString('no-NO', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });

// «Burde vunnet»-score 0–10 ut fra Elo, som et lite merke
const VERDICT_CLASS = { 'Sjokkseier': 'up', 'Seier som underdog': 'up', 'Burde vunnet': 'down', 'Tap som favoritt': 'down' };
function expectedBadge(e) {
  if (!e) return '';
  const title = `Vinnersjanse ${Math.round(e.winChance * 100)} % ut fra snittrating ${e.ourRating} mot ${e.theirRating}`;
  return `<span class="expected ${VERDICT_CLASS[e.verdict] ?? ''}" title="${title}"><b>${e.score}/10</b> ${e.verdict}</span>`;
}

// En flis med tall; med kamp-id blir den en lenke til kampsiden
function tile(label, value, sub = '', matchId = null) {
  const inner = `<div class="label">${label}</div><div class="value">${value}</div><div class="sub">${sub}</div>`;
  return matchId ? `<a class="tile" href="#kamp=${matchId}" data-match="${matchId}">${inner}</a>` : `<div class="tile">${inner}</div>`;
}

let chart = null;
let eloChart = null;
let monthChart = null;
let playerChart = null;
let current = null;
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
  current = stats;
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
      <article class="card" style="--c: var(${colorOf.get(p.profileId)})" data-player-link="${p.profileId}" tabindex="0" role="link" aria-label="Statistikk for ${esc(p.name)}">
        <h3>${esc(p.name)}${p.nick && p.nick !== p.name ? ` <span class="nick">«${esc(p.nick)}»</span>` : ''}</h3>
        <div class="stat">Lag-RM <b>${team?.rating ?? '–'}</b></div>
        <div class="stat">Lag W/L <b>${team ? `${team.wins}/${team.losses}` : '–'}</b></div>
        <div class="stat">1v1-RM <b>${solo?.rating ?? '–'}</b></div>
        <div class="stat">Winrate i perioden <b>${pct(p.winRate)}</b></div>
        <div class="stat">Kamper i perioden <b>${p.games}</b></div>
      </article>`;
  }).join('');

  // Form: pil opp, bortover eller ned ut fra de siste 5 kampene (uavhengig av periode)
  const f = stats.form;
  const formBox = document.getElementById('form');
  formBox.hidden = !f;
  if (f) {
    const label = { up: 'I form', flat: 'Middels form', down: 'Ute av form' }[f.trend];
    formBox.className = `form-box ${f.trend}`;
    formBox.innerHTML = `
      <div class="form-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12h14M12 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
      <div>
        <h2 id="form-title">${label}</h2>
        <div class="form-sub">${f.wins} av ${f.games.length} siste kamper vunnet${f.eloChange ? ` · ${upDown(f.eloChange)} Elo` : ''}</div>
        <div class="form-dots">${f.games.map((g) => `<a href="#kamp=${g.id}" data-match="${g.id}" class="${g.won ? 'won' : 'lost'}" title="${g.won ? 'Seier' : 'Tap'} · ${esc(g.map)} · ${time(g.start)}">${g.won ? 'S' : 'T'}</a>`).join('')}</div>
      </div>`;
  }

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
        <span>${esc(lm.map)} · ${esc(lm.type)}</span><span class="muted">${time(lm.start)}${lm.duration ? ` · ${minutes(lm.duration)}` : ''}</span>${expectedBadge(lm.expected)}</div>
      <div class="lm-players">${lm.clanPlayers.map((p) => `
        <div><b>${esc(p.name)}</b> ${esc(p.civ)}${p.ratingChange != null ? ` <span class="${p.ratingChange >= 0 ? 'up' : 'down'}">${p.ratingChange >= 0 ? '+' : '−'}${Math.abs(p.ratingChange)}</span>` : ''}</div>`).join('')}</div>
      <div class="lm-stats">
        <div class="stat">Snittrating oss <b>${lm.ourRating ?? '–'}</b></div>
        <div class="stat">Snittrating motstander <b>${lm.theirRating ?? '–'}</b></div>
        <div class="stat">Forskjell <b>${diff == null ? '–' : `${diff >= 0 ? '+' : '−'}${Math.abs(diff)}`}</b></div>
        <div class="stat">Vi på ${esc(lm.map)} <b>${lm.mapWins} av ${lm.mapGames} seire</b></div>
      </div>
      <a class="lm-link" href="#kamp=${lm.id}" data-match="${lm.id}">Se hele kampen →</a>`;
  }

  // Uka som gikk (uavhengig av periode)
  const w = stats.weekly;
  document.getElementById('weekly-range').textContent =
    `${date(w.from)} – ${date(w.to)}, alle kamptyper. Følger ikke periodevalget.`;
  document.getElementById('weekly').innerHTML = w.games ? [
    tile('Kamper', w.games, `${w.wins} seire · ${pct(w.winRate)}`),
    tile('Klan-Elo', w.clanElo ?? '–', `${upDown(w.clanEloChange)} denne uka`),
    w.topPlayer ? tile('Ukens spiller', esc(w.topPlayer.name), `${upDown(w.topPlayer.ratingChange)} lag-RM · ${w.topPlayer.wins} av ${w.topPlayer.games} seire`) : '',
    w.topMap ? tile('Ukens kart', esc(w.topMap.name), `${w.topMap.wins} av ${w.topMap.games} seire`) : '',
    w.bestWin ? tile('Ukens beste seier', esc(w.bestWin.map), `mot ${w.bestWin.diff} høyere snittrating`, w.bestWin.id) : '',
  ].join('') : '<p class="muted small">Ingen kamper de siste 7 dagene.</p>';

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

  // Civ-par i 4v4
  const pairs = stats.civPairs4v4;
  document.getElementById('pairs-note').textContent = pairs.games
    ? `${pairs.games} rangerte 4v4 der alle fire spilte på samme lag. Bare par dere har spilt minst ${pairs.minGames} ganger.`
    : 'Ingen rangerte 4v4 med alle fire i perioden.';
  table(document.getElementById('pairs-best'), pairs.best, 'Civer');
  table(document.getElementById('pairs-worst'), pairs.worst, 'Civer');

  // Rekordtavle
  const r = stats.records;
  document.getElementById('records').innerHTML = [
    r.upset && tile('Største sjokkseier', `+${r.upset.diff}`, `${esc(r.upset.map)} · ${r.upset.ourRating} mot ${r.upset.theirRating} · ${date(r.upset.start)}`, r.upset.id),
    r.favLoss && tile('Største tap som favoritt', `−${r.favLoss.diff}`, `${esc(r.favLoss.map)} · ${r.favLoss.ourRating} mot ${r.favLoss.theirRating} · ${date(r.favLoss.start)}`, r.favLoss.id),
    r.longest && tile('Lengste kamp', minutes(r.longest.duration), `${esc(r.longest.map)} · ${r.longest.won ? 'seier' : 'tap'} · ${date(r.longest.start)}`, r.longest.id),
    r.shortestWin && tile('Raskeste seier', minutes(r.shortestWin.duration), `${esc(r.shortestWin.map)} · ${date(r.shortestWin.start)}`, r.shortestWin.id),
    r.bestGain && tile('Største ratinghopp', upDown(r.bestGain.change), `${esc(r.bestGain.name)} · ${esc(r.bestGain.map)} · ${date(r.bestGain.start)}`, r.bestGain.id),
    r.worstDrop && tile('Største ratingfall', upDown(r.worstDrop.change), `${esc(r.worstDrop.name)} · ${esc(r.worstDrop.map)} · ${date(r.worstDrop.start)}`, r.worstDrop.id),
    r.busiestDay && tile('Flest kamper på én dag', r.busiestDay.games, `${day(r.busiestDay.day)} · ${r.busiestDay.wins} seire`),
    ...r.peaks.map((p) => tile(`Høyeste lag-RM, ${esc(p.name)}`, p.rating, date(p.start), p.id)),
  ].filter(Boolean).join('') || '<p class="muted small">Ingen rangerte lagkamper i perioden.</p>';

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
  table(document.getElementById('rating-diff'), t.byRatingDiff, 'Vi var');
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
    <a class="match" href="#kamp=${m.id}" data-match="${m.id}">
      <div class="match-head"><b>${esc(m.map)}</b><span>${esc(m.type)}</span><span>${time(m.start)}</span><span>${minutes(m.duration)}</span>${expectedBadge(m.expected)}</div>
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
    </a>`).join('') : '<p class="muted small">Ingen kamper i perioden.</p>';
}

// Periodevelger: husker valget i adressen (#periode=1y), så lenken kan deles
const picker = document.getElementById('period');
picker.innerHTML = PERIODS.map((p) => `<button type="button" data-key="${p.key}">${p.label}</button>`).join('');

// Adressen holder både periode og åpen kamp, f.eks. #periode=1y&kamp=514148551
const hashParams = () => new URLSearchParams(location.hash.slice(1));
function setHash(changes) {
  const params = hashParams();
  for (const [k, v] of Object.entries(changes)) {
    if (v == null) params.delete(k);
    else params.set(k, v);
  }
  const str = params.toString();
  history.replaceState(null, '', str ? `#${str}` : location.pathname);
}

async function show(key) {
  if (!PERIODS.some((p) => p.key === key)) key = 'all';
  for (const b of picker.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.key === key));
  setHash({ periode: key === 'all' ? null : key });
  render(await fetch(`api/stats-${key}.json`).then((r) => r.json()));
  if (playerDialog?.open) renderPlayer(hashParams().get('spiller'));
}

// Kampside: åpnes som et vindu over siden
const dialog = document.getElementById('match-dialog');
const matchBody = document.getElementById('match-body');

function renderMatch(m) {
  const rating = (p) => (p.oldRating != null && p.newRating != null
    ? `${p.oldRating} → ${p.newRating} ${upDown(p.change)}`
    : (p.newRating ?? p.oldRating ?? '–'));
  matchBody.innerHTML = `
    <div class="md-top">
      <div>
        <h2 id="match-title">${esc(m.map)}${m.won == null ? '' : ` · <span class="${m.won ? 'up' : 'down'}">${m.won ? 'Seier' : 'Tap'}</span>`}</h2>
        <p class="muted">${esc(m.type)} · ${time(m.start)}${m.duration ? ` · ${minutes(m.duration)}` : ''}</p>
        ${m.expected ? `<p class="md-expected">${expectedBadge(m.expected)} Vinnersjanse før kampen: ${Math.round(m.expected.winChance * 100)} % (snitt ${m.expected.ourRating} mot ${m.expected.theirRating})</p>` : ''}
      </div>
      <button type="button" class="md-close" data-close>Lukk</button>
    </div>
    <div class="md-teams">${m.teams.map((t, i) => `
      <div class="md-team ${t.won ? 'won' : 'lost'}">
        <h3><span>Lag ${i + 1} · ${t.won ? 'Seier' : 'Tap'}</span><span class="muted">snitt ${t.avgRating ?? '–'}</span></h3>
        <table><tbody>${t.players.map((p) => `
          <tr class="${p.clan ? 'clan' : ''}">
            <td>${p.clan ? esc(p.name) : p.profileId ? `<a href="https://www.aoe2insights.com/user/${p.profileId}/" target="_blank" rel="noopener">Motstander</a>` : 'AI'}</td>
            <td>${esc(p.civ)}</td>
            <td class="num">${rating(p)}</td>
          </tr>`).join('')}
        </tbody></table>
      </div>`).join('')}
    </div>
    ${m.mapGames ? `<p class="muted small">Vi på ${esc(m.map)}: ${m.mapWins} av ${m.mapGames} seire. Motstandere lenker til aoe2insights.</p>` : ''}`;
}

async function openMatch(id) {
  setHash({ kamp: id });
  matchBody.innerHTML = '<p class="muted">Laster kamp …</p>';
  if (!dialog.open) dialog.showModal();
  const res = await fetch(`api/match/${id}.json`);
  const m = res.ok ? await res.json() : null;
  if (m) renderMatch(m);
  else matchBody.innerHTML = '<p class="muted">Fant ikke kampen.</p><button type="button" class="md-close" data-close>Lukk</button>';
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-match]');
  if (!link || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  openMatch(link.dataset.match);
});
dialog.addEventListener('click', (e) => {
  // Klikk på bakgrunnen eller Lukk-knappen lukker
  if (e.target === dialog || e.target.closest('[data-close]')) dialog.close();
});
dialog.addEventListener('close', () => setHash({ kamp: null }));

picker.addEventListener('click', (e) => {
  const key = e.target.closest('button')?.dataset.key;
  if (key) show(key);
});

// Spillerside: åpnes fra figurene i logoen eller spillerkortene, og følger valgt periode
const playerDialog = document.getElementById('player-dialog');

function renderPlayer(id) {
  const p = current?.players.find((x) => x.profileId === Number(id));
  if (!p) return false;
  const color = colorOf.get(p.profileId);
  playerDialog.style.setProperty('--c', `var(${color})`);
  const team = p.ratings.rmTeam;
  const solo = p.ratings.rm1v1;
  const period = PERIODS.find((x) => x.key === (hashParams().get('periode') ?? 'all'))?.label ?? '';
  const streak = p.streaks.current > 0 ? `${p.streaks.current} seire` : p.streaks.current < 0 ? `${-p.streaks.current} tap` : '–';
  document.getElementById('player-body').innerHTML = `
    <div class="md-top">
      <div>
        <h2 id="player-title">${esc(p.nick ?? p.name)}${p.nick && p.nick !== p.name ? ` <span class="nick">${esc(p.name)}</span>` : ''}</h2>
        <p class="muted">Periode: ${esc(period)} · <a href="https://www.aoe2insights.com/user/${p.profileId}/" target="_blank" rel="noopener">aoe2insights</a></p>
      </div>
      <button type="button" class="md-close" data-close>Lukk</button>
    </div>
    <div class="pl-stats">
      ${tile('Lag-RM nå', team?.rating ?? '–', team ? `${team.wins} seire / ${team.losses} tap` : '')}
      ${tile('1v1-RM nå', solo?.rating ?? '–', solo ? `${solo.wins} seire / ${solo.losses} tap` : '')}
      ${tile('Kamper i perioden', p.games, `${p.wins} seire · ${pct(p.winRate)}`)}
      ${tile('På rad nå', streak, `rekord ${p.streaks.bestWin} seire / ${p.streaks.bestLoss} tap`)}
    </div>`;

  playerChart?.destroy();
  playerChart = null;
  document.getElementById('player-chart-wrap').hidden = !p.ratingHistory.length;
  if (p.ratingHistory.length) {
    playerChart = new Chart(document.getElementById('player-chart'), {
      type: 'line',
      data: { datasets: [{
        label: 'Lag-RM',
        data: p.ratingHistory.map((h) => ({ x: h.t, y: h.rating })),
        borderColor: css(color), backgroundColor: css(color), borderWidth: 2, pointRadius: 0, pointHoverRadius: 5, tension: 0,
      }] },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { type: 'linear', min: p.ratingHistory[0].t, max: p.ratingHistory.at(-1).t, ticks: { callback: (v) => date(v), maxTicksLimit: 5 }, grid: { display: false } },
          y: { ticks: { maxTicksLimit: 5 } },
        },
        plugins: { legend: { display: false }, tooltip: { callbacks: { title: (items) => time(items[0].parsed.x) } } },
      },
    });
  }

  // Lagkamerater: kamper der denne spilleren og én til av oss var på samme lag
  const mates = current.lineups
    .filter((l) => l.size === 2 && l.key.split(',').map(Number).includes(p.profileId))
    .map((l) => ({ ...l, name: current.players.find((x) => x.profileId === Number(l.key.split(',').find((k) => Number(k) !== p.profileId)))?.name ?? l.name }));
  const tables = document.getElementById('player-tables');
  tables.innerHTML = `
    <div class="grid">
      <div><h4>Civer</h4><table data-pl="civs"></table></div>
      <div><h4>Kart</h4><table data-pl="maps"></table></div>
    </div>
    <h4>Med hver lagkamerat (bare dere to av klanen på laget)</h4><table data-pl="mates"></table>`;
  table(tables.querySelector('[data-pl="civs"]'), p.civs, 'Civ');
  table(tables.querySelector('[data-pl="maps"]'), p.maps, 'Kart');
  table(tables.querySelector('[data-pl="mates"]'), mates, 'Sammen med');
  return true;
}

function openPlayer(id) {
  if (!renderPlayer(id)) return;
  setHash({ spiller: id });
  if (dialog.open) dialog.close();
  if (!playerDialog.open) playerDialog.showModal();
}

document.addEventListener('click', (e) => {
  const link = e.target.closest('[data-player-link]');
  if (!link || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  openPlayer(link.dataset.playerLink);
});
document.addEventListener('keydown', (e) => {
  const card = e.target.closest?.('.card[data-player-link]');
  if (card && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    openPlayer(card.dataset.playerLink);
  }
});
playerDialog.addEventListener('click', (e) => {
  if (e.target === playerDialog || e.target.closest('[data-close]')) playerDialog.close();
});
playerDialog.addEventListener('close', () => setHash({ spiller: null }));

const startMatch = hashParams().get('kamp');
const startPlayer = hashParams().get('spiller');
await show(hashParams().get('periode') ?? 'all');
if (startMatch) openMatch(startMatch);
else if (startPlayer) openPlayer(startPlayer);
