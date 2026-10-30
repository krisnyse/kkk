import { PERIODS } from './periods.js';

const SERIES = ['--series-1', '--series-2', '--series-3', '--series-4'];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)} %`);
const date = (t) => new Date(t * 1000).toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' });
// Aksetekst: klokkeslett når grafen dekker under to døgn (f.eks. «I dag»), ellers dato
const axisLabel = (chart, v) => (chart.max - chart.min < 2 * 86400
  ? new Date(v * 1000).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })
  : date(v));
const time = (t) => new Date(t * 1000).toLocaleString('no-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const timeWithYear = (t) => new Date(t * 1000).toLocaleString('no-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

// Ukas MVP: den som har vunnet mest lag-Elo de siste 7 dagene (samme som «Ukens spiller»), men bare med minst én seier
let mvp = null;
const weeklyMvp = (w) => (w?.topPlayer?.wins ? w.topPlayer : null);
const mvpReason = (p) => `Ukas MVP: ${signed(p.ratingChange)} lag-Elo og ${p.wins} av ${p.games} seire de siste 7 dagene`;

// Krone på figuren i logoen. Figurene står med 120 enheters mellomrom, i samme rekkefølge som spillerne.
function crownLogo(profileId) {
  document.querySelectorAll('.logo .mvp-crown').forEach((el) => el.remove());
  const figures = [...document.querySelectorAll('.logo .logo-player')];
  const i = figures.findIndex((a) => a.dataset.playerLink === String(profileId));
  if (i < 0) return;
  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('class', 'mvp-crown');
  g.setAttribute('transform', `translate(${60 + 120 * i + 20} 4) rotate(18)`);
  g.innerHTML = `<title>${esc(mvpReason(mvp))}</title><path d="M1 14L0 3l5 4.5 4.5-7.5 4.5 7.5 5-4.5-1 11z" fill="#f2c200" stroke="#a87b00" stroke-width="1.2" stroke-linejoin="round"/><circle cx="9.5" cy="10" r="1.6" fill="#c0392b"/>`;
  figures[i].querySelector('g').append(g);
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

// Motstandere med navn (lenke til aoe2insights), seire–tap og siste kamp mot dem
function rivalTable(el, rows) {
  if (!rows.length) {
    el.innerHTML = '<tbody><tr><td class="muted">Ingen i perioden.</td></tr></tbody>';
    return;
  }
  el.classList.add('rivals');
  el.innerHTML = `
    <thead><tr><th>Motstander</th><th class="num">S–T</th><th class="num">Sist</th></tr></thead>
    <tbody>${rows.map((o) => `
      <tr>
        <td><a href="https://www.aoe2insights.com/user/${o.profileId}/" target="_blank" rel="noopener">${esc(o.name ?? `Spiller ${o.profileId}`)}</a>${o.country ? ` <span class="muted">${esc(o.country.toUpperCase())}</span>` : ''}</td>
        <td class="num"><span class="up">${o.wins}</span>–<span class="down">${o.losses}</span></td>
        <td class="num"><a href="#kamp=${o.last.id}" data-match="${o.last.id}" class="${o.last.won ? 'up' : 'down'}" title="${o.last.won ? 'Seier' : 'Tap'} · ${esc(o.last.map)}">${date(o.last.start)}</a></td>
      </tr>`).join('')}
    </tbody>`;
}

// «Data hentet» under logoen, med hvor lenge siden. Oppdateres hvert minutt uten å laste data på nytt.
function ago(ms) {
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'akkurat nå';
  if (min < 60) return `for ${min} min siden`;
  const h = Math.floor(min / 60);
  if (h < 24) return `for ${h} t ${min % 60} min siden`;
  const d = Math.floor(h / 24);
  return `for ${d} ${d === 1 ? 'dag' : 'dager'} siden`;
}
function renderFetched() {
  const el = document.getElementById('fetched');
  const at = current?.fetchedAt;
  el.hidden = !at;
  if (!at) return;
  const when = new Date(at);
  const today = when.toDateString() === new Date().toDateString();
  const clock = when.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' });
  const day = today ? 'i dag' : when.toLocaleDateString('no-NO', { day: 'numeric', month: 'short' });
  const last = current.lastMatch ? ` · siste kamp ${time(current.lastMatch.start)}` : '';
  el.innerHTML = `<span class="fetched-dot" aria-hidden="true"></span>Data hentet ${day} kl. ${clock} <span class="muted">(${ago(Date.now() - when)})${last}</span>`;
}
setInterval(renderFetched, 60_000);

function render(stats) {
  current = stats;
  // Fargen følger spilleren, uansett periode
  colorOf = new Map(stats.players.map((p, i) => [p.profileId, SERIES[i]]));

  renderFetched();
  document.getElementById('updated').textContent = stats.updatedAt
    ? `${stats.totalMatches} kamper i perioden`
    : 'Ingen data hentet ennå. Serveren henter ved oppstart og deretter jevnlig.';


  // Spillerkort. Ukas MVP får krone, og den som spiller nå får et «I kamp»-merke (se renderLive).
  mvp = weeklyMvp(stats.weekly);
  document.getElementById('players').innerHTML = stats.players.map((p) => {
    const team = p.ratings.rmTeam;
    const solo = p.ratings.rm1v1;
    const isMvp = mvp?.profileId === p.profileId;
    return `
      <article class="card${isMvp ? ' is-mvp' : ''}" style="--c: var(${colorOf.get(p.profileId)})" data-player-link="${p.profileId}" tabindex="0" role="link" aria-label="Statistikk for ${esc(p.name)}${isMvp ? ', ukas MVP' : ''}">
        <div class="card-badges">${isMvp ? `<span class="mvp" title="${esc(mvpReason(mvp))}">👑 Ukas MVP</span>` : ''}<span class="playing-badge">I kamp nå</span></div>
        <h3>${esc(p.name)}${p.nick && p.nick !== p.name ? ` <span class="nick">«${esc(p.nick)}»</span>` : ''}</h3>
        <div class="stat">Lag-RM <b>${team?.rating ?? '–'}</b></div>
        <div class="stat">Lag W/L <b>${team ? `${team.wins}/${team.losses}` : '–'}</b></div>
        <div class="stat">1v1-RM <b>${solo?.rating ?? '–'}</b></div>
        <div class="stat">Winrate i perioden <b>${pct(p.winRate)}</b></div>
        <div class="stat">Kamper i perioden <b>${p.games}</b></div>
      </article>`;
  }).join('');

  crownLogo(mvp?.profileId);
  markPlaying();

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

  // Beste prestasjon: seieren med lavest vinnersjanse i valgt periode
  const bp = stats.bestPerformance;
  const period = PERIODS.find((p) => p.key === (hashParams().get('periode') ?? 'all'))?.label.toLowerCase() ?? '';
  const bestBox = document.getElementById('best-match');
  bestBox.innerHTML = bp ? `
    <h2>Beste prestasjon i perioden</h2>
    <p class="muted small">Seieren i rangert lagkamp med lavest vinnersjanse før kampen, ut fra snittrating (${esc(period)}).</p>
    <a class="bm-body" href="#kamp=${bp.id}" data-match="${bp.id}">
      <div class="bm-chance"><span class="bm-pct">${Math.round(bp.expected.winChance * 100)} %</span><span class="muted">vinnersjanse</span></div>
      <div class="bm-info">
        <div class="lm-head"><b>${esc(bp.map)}</b><span>${esc(bp.type)}</span><span class="muted">${timeWithYear(bp.start)}${bp.duration ? ` · ${minutes(bp.duration)}` : ''}</span>${expectedBadge(bp.expected)}</div>
        <div class="bm-rating">Snittrating <b>${bp.expected.ourRating}</b> mot <b>${bp.expected.theirRating}</b> <span class="up">(${bp.expected.theirRating - bp.expected.ourRating} lavere enn motstanderne)</span></div>
        <div class="lm-players">${bp.teams.flatMap((t) => t.players).filter((p) => p.clan).map((p) => `
          <div><b>${esc(p.name)}</b> ${esc(p.civ)}${p.ratingChange != null ? ` ${upDown(p.ratingChange)}` : ''}</div>`).join('')}</div>
        <span class="lm-link">Se hele kampen →</span>
      </div>
    </a>` : `
    <h2>Beste prestasjon i perioden</h2>
    <p class="muted small">Ingen seire i rangerte lagkamper i perioden (${esc(period)}).</p>`;

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
          x: { type: 'linear', min: elo.points[0].t, max: elo.points.at(-1).t, ticks: { callback(v) { return axisLabel(this, v); }, maxTicksLimit: 5 }, grid: { display: false } },
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
          pointStyle: 'rectRounded',
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0,
        })).concat(elo?.points.length ? [{
          // Klansnittet (samme som klan-Elo-panelet), stiplet og tegnet øverst
          label: 'Klansnitt',
          data: elo.points.map((pt) => ({ x: pt.t, y: pt.rating })),
          borderColor: css('--text'),
          backgroundColor: css('--text'),
          borderWidth: 3,
          borderDash: [6, 4],
          pointStyle: 'line',
          pointRadius: 0,
          pointHoverRadius: 5,
          tension: 0,
          order: -1,
        }] : []),
      },
      options: {
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        scales: {
          x: { type: 'linear', min: stats.since ?? undefined, max: Math.max(...withHistory.map((p) => p.ratingHistory.at(-1).t)), ticks: { callback(v) { return axisLabel(this, v); }, maxTicksLimit: 5 }, grid: { display: false } },
          y: { ticks: { maxTicksLimit: 6 } },
        },
        plugins: {
          legend: { position: 'top', align: 'start', labels: { boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyleWidth: 18 } },
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

  // Elo-banken
  const bank = stats.eloBank.filter((b) => b.games);
  document.getElementById('elo-bank').innerHTML = bank.length ? `
    <thead><tr><th>Spiller</th><th class="num narrow-hide">Kamper</th><th class="num">Vunnet</th><th class="num">Tapt</th><th class="num">Netto</th><th class="num narrow-hide">Per kamp</th></tr></thead>
    <tbody>${bank.map((b) => `
      <tr>
        <td><span class="dot inline" style="--c: var(${colorOf.get(b.profileId)})"></span>${esc(b.name)}</td>
        <td class="num narrow-hide">${b.games}</td>
        <td class="num up">${signed(b.gained)}</td>
        <td class="num down">${signed(b.lost)}</td>
        <td class="num"><b>${upDown(b.net)}</b></td>
        <td class="num narrow-hide">${upDown(b.perGame)}</td>
      </tr>`).join('')}
    </tbody>` : '<tbody><tr><td class="muted">Ingen rangerte lagkamper i perioden.</td></tr></tbody>';

  // Lagstørrelse
  const sizes = stats.teamSizes.filter((s) => s.games);
  document.getElementById('team-sizes').innerHTML = sizes.length ? `
    <thead><tr><th>Lag</th><th class="num">Kamper</th><th class="num">Winrate</th><th class="num">Elo per kamp</th></tr></thead>
    <tbody>${sizes.map((s) => `
      <tr>
        <td>${s.name}</td>
        <td class="num">${s.games}</td>
        <td class="num ${s.winRate >= 0.5 ? 'up' : 'down'}">${pct(s.winRate)}</td>
        <td class="num">${upDown(s.eloPerGame)}</td>
      </tr>`).join('')}
    </tbody>` : '<tbody><tr><td class="muted">Ingen rangerte lagkamper i perioden.</td></tr></tbody>';
  document.getElementById('team-sizes-players').innerHTML = sizes.length ? `
    <thead><tr><th>Spiller</th>${sizes.map((s) => `<th class="num">${s.name}</th>`).join('')}</tr></thead>
    <tbody>${stats.players.map((p) => `
      <tr>
        <td><span class="dot inline" style="--c: var(${colorOf.get(p.profileId)})"></span>${esc(p.name)}</td>
        ${sizes.map((s) => {
          const x = s.players.find((pp) => pp.profileId === p.profileId);
          return `<td class="num" title="${x.wins} av ${x.games} kamper">${x.games ? pct(x.winRate) : '–'}</td>`;
        }).join('')}
      </tr>`).join('')}
    </tbody>` : '';

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
    ...r.peaks.map((p) => tile(`Høyeste lag-RM, ${esc(p.name)}`, p.rating, `${date(p.start)}${p.start < stats.eloReset?.cutoff ? ' · omregnet' : ''}`, p.id)),
  ].filter(Boolean).join('') || '<p class="muted small">Ingen rangerte lagkamper ennå.</p>';

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

  // Erkefiender
  const rv = stats.rivals;
  document.getElementById('rivals-note').textContent =
    `Motstandere vi har møtt minst ${rv.minGames} ganger, alle kamptyper. Seire og tap er sett fra vår side. Trykk på et navn for å se spilleren på aoe2insights.`;
  rivalTable(document.getElementById('rivals-most'), rv.mostMet);
  rivalTable(document.getElementById('rivals-nemeses'), rv.nemeses);
  rivalTable(document.getElementById('rivals-victims'), rv.victims);

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
    ${m.eloAdjusted ? '<p class="muted small">Ratingene er regnet om til dagens skala fordi kampen er fra før lag-Elo ble senket 13. juli 2022.</p>' : ''}
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
          x: { type: 'linear', min: p.ratingHistory[0].t, max: p.ratingHistory.at(-1).t, ticks: { callback(v) { return axisLabel(this, v); }, maxTicksLimit: 5 }, grid: { display: false } },
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

// Changelog: kort forklaring på det som er nytt, fra changelog.json
const changelogDialog = document.getElementById('changelog-dialog');
const changelogList = document.getElementById('changelog-list');
let changelogLoaded = false;
document.getElementById('changelog-link').addEventListener('click', async (e) => {
  e.preventDefault();
  changelogDialog.showModal();
  if (changelogLoaded) return;
  const res = await fetch('changelog.json').catch(() => null);
  const entries = res?.ok ? await res.json() : null;
  if (!entries) {
    changelogList.innerHTML = '<li class="muted">Fant ikke changelogen.</li>';
    return;
  }
  changelogLoaded = true;
  changelogList.innerHTML = entries.map((c) => `
    <li>
      <h3>${esc(c.title)}<span class="date">${new Date(c.date).toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' })}</span></h3>
      <p>${esc(c.text)}</p>
    </li>`).join('');
});
changelogDialog.addEventListener('click', (e) => {
  if (e.target === changelogDialog || e.target.closest('[data-close]')) changelogDialog.close();
});

// Forslag / feil: sendes til /api/feedback, som lager en GitHub-issue
const feedbackDialog = document.getElementById('feedback-dialog');
const feedbackForm = document.getElementById('feedback-form');
const feedbackStatus = document.getElementById('feedback-status');
let feedbackOpenedAt = 0;
document.getElementById('feedback-link').addEventListener('click', (e) => {
  e.preventDefault();
  feedbackOpenedAt = Date.now();
  feedbackStatus.textContent = '';
  feedbackStatus.className = 'fb-status';
  feedbackDialog.showModal();
});
feedbackDialog.addEventListener('click', (e) => {
  if (e.target === feedbackDialog || e.target.closest('[data-close]')) feedbackDialog.close();
});
feedbackForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = feedbackForm.querySelector('button[type=submit]');
  const data = Object.fromEntries(new FormData(feedbackForm));
  button.disabled = true;
  feedbackStatus.className = 'fb-status';
  feedbackStatus.textContent = 'Sender …';
  const res = await fetch('api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, startedAt: feedbackOpenedAt, page: location.hash || '/' }),
  }).catch(() => null);
  const reply = await res?.json().catch(() => null);
  button.disabled = false;
  if (res?.ok) {
    feedbackForm.reset();
    feedbackStatus.className = 'fb-status ok';
    feedbackStatus.textContent = 'Takk! Det er sendt.';
  } else {
    feedbackStatus.className = 'fb-status err';
    feedbackStatus.textContent = reply?.error ?? 'Klarte ikke å sende. Prøv igjen senere.';
  }
});

// «Spiller nå»: sjekker /api/live hvert andre minutt mens siden er åpen og synlig
let playingNow = new Set();
function markPlaying() {
  for (const card of document.querySelectorAll('#players .card')) card.classList.toggle('playing', playingNow.has(Number(card.dataset.playerLink)));
}
function renderLive(live) {
  const el = document.getElementById('live');
  const matches = live?.matches ?? [];
  playingNow = new Set(matches.flatMap((m) => m.ours.filter((p) => p.clan).map((p) => p.profileId)));
  markPlaying();
  el.hidden = !matches.length;
  el.innerHTML = matches.map((m) => {
    const mins = Math.max(0, Math.round((Date.now() / 1000 - m.started) / 60));
    const ours = m.ours.map((p) => `<b>${esc(p.name)}</b>${p.civ ? ` <span class="muted-inline">(${esc(p.civ)})</span>` : ''}`).join(', ');
    const ratings = m.theirs.map((p) => p.rating).filter((r) => r != null);
    const theirs = m.theirs.length
      ? ` mot ${m.theirs.length === 1 ? esc(m.theirs[0].name) : `${m.theirs.length} motstandere`}${ratings.length ? ` (snitt ${Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length)})` : ''}`
      : '';
    const what = [m.type, m.map].filter(Boolean).map(esc).join(' på ');
    return `<div class="live-match"><span class="live-dot" aria-hidden="true"></span><span><span class="live-label">Spiller nå</span> ${ours}${theirs}<span class="live-meta">${what ? `${what} · ` : ''}startet ${time(m.started)} (${mins} min siden)</span></span></div>`;
  }).join('');
}
async function loadLive() {
  if (document.hidden) return;
  const res = await fetch('api/live').catch(() => null);
  if (!res?.ok) return; // da lar vi forrige visning stå
  renderLive(await res.json().catch(() => null));
}
loadLive();
setInterval(loadLive, 2 * 60_000);
document.addEventListener('visibilitychange', loadLive);
// Servervedlikehold og nyeste patch: hentes fra /api/server-news (forumet og Steam, mellomlagret)
const OSLO = { timeZone: 'Europe/Oslo' };
const newsTime = (iso) => new Date(iso).toLocaleString('nb-NO', { ...OSLO, weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const newsClock = (iso) => new Date(iso).toLocaleTimeString('nb-NO', { ...OSLO, hour: '2-digit', minute: '2-digit' });
const newsDay = (iso) => new Date(iso).toLocaleDateString('nb-NO', { ...OSLO, day: 'numeric', month: 'long', year: 'numeric' });
const agoDays = (iso) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400_000);
  return d <= 0 ? 'i dag' : d === 1 ? 'i går' : `for ${d} dager siden`;
};

function maintenanceHtml(m, source) {
  const head = '<div class="label">Servervedlikehold</div>';
  if (!m || m.error) return `${head}<div class="value small">Klarte ikke å hente</div><div class="sub"><a href="${source}" target="_blank" rel="noopener">Sjekk forumet →</a></div>`;
  if (m.next) {
    const n = m.next;
    const when = n.start
      ? `${newsTime(n.start)}${n.end ? `–${newsClock(n.end)}` : ''}`
      : `${new Date(`${n.day}T12:00:00Z`).toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' })}, klokkeslett ikke oppgitt`;
    return `${head}
      <div class="value small">${n.ongoing ? 'Pågår nå' : esc(when)}</div>
      <div class="sub">${n.ongoing && n.end ? `Ferdig ca. ${newsClock(n.end)}. ` : ''}Matchmaking stenges en time før. <a href="${esc(n.url)}" target="_blank" rel="noopener">Kunngjøringen →</a></div>`;
  }
  const p = m.previous;
  return `${head}
    <div class="value small">Ingen planlagt</div>
    <div class="sub">${p ? `Forrige var <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(newsDay(p.start ?? `${p.day}T12:00:00Z`))}</a>.` : 'Ingen kunngjøringer på forumet.'}</div>`;
}

function patchHtml(p, source) {
  const head = '<div class="label">Nyeste patch</div>';
  if (!p || p.error) return `${head}<div class="value small">Klarte ikke å hente</div><div class="sub"><a href="${source}" target="_blank" rel="noopener">Se Steam-nyhetene →</a></div>`;
  return `${head}
    <div class="value small"><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a></div>
    <div class="sub">${esc(newsDay(p.date))} (${agoDays(p.date)})</div>
    ${p.highlights?.length ? `<ul class="sn-highlights">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` : ''}
    <p class="sn-summary">${esc(p.summary)}</p>`;
}

async function loadServerNews() {
  const el = document.getElementById('server-news');
  const res = await fetch('api/server-news').catch(() => null);
  const news = res?.ok ? await res.json().catch(() => null) : null;
  if (!news) return; // f.eks. lokalt uten nett: kortet forblir skjult
  const soon = news.maintenance?.next && (news.maintenance.next.ongoing || Date.parse(news.maintenance.next.start ?? news.maintenance.next.day) - Date.now() < 3 * 86400_000);
  el.classList.toggle('soon', Boolean(soon));
  el.innerHTML = `
    <div class="sn-grid">
      <div class="sn-item">${maintenanceHtml(news.maintenance, news.sources?.maintenance)}</div>
      <div class="sn-item">${patchHtml(news.patch, news.sources?.patch)}</div>
    </div>`;
  el.hidden = false;
}
loadServerNews();

const startMatch = hashParams().get('kamp');
const startPlayer = hashParams().get('spiller');
await show(hashParams().get('periode') ?? 'all');
if (startMatch) openMatch(startMatch);
else if (startPlayer) openPlayer(startPlayer);
