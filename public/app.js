const SERIES = ['--series-1', '--series-2', '--series-3', '--series-4'];
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const pct = (x) => (x == null ? '–' : `${Math.round(x * 100)} %`);
const date = (t) => new Date(t * 1000).toLocaleDateString('no-NO', { day: 'numeric', month: 'short', year: 'numeric' });
const time = (t) => new Date(t * 1000).toLocaleString('no-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const minutes = (s) => (s ? `${Math.round(s / 60)} min` : '');

const stats = await fetch('api/stats.json').then((r) => r.json());

document.getElementById('updated').textContent = stats.updatedAt
  ? `${stats.totalMatches} kamper lagret · sist oppdatert ${new Date(stats.updatedAt).toLocaleString('no-NO')}`
  : 'Ingen data hentet ennå. Serveren henter ved oppstart og deretter jevnlig.';

const colorOf = new Map(stats.players.map((p, i) => [p.profileId, SERIES[i]]));

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
      <div class="stat">Winrate (lagrede) <b>${pct(p.winRate)}</b></div>
      <div class="stat">Kamper lagret <b>${p.games}</b></div>
    </article>`;
}).join('');

// Ratinggraf
const withHistory = stats.players.filter((p) => p.ratingHistory.length);
if (!withHistory.length) {
  document.getElementById('rating-empty').hidden = false;
  document.querySelector('.chart-wrap').hidden = true;
} else {
  Chart.defaults.color = css('--text-2');
  Chart.defaults.borderColor = css('--border');
  new Chart(document.getElementById('rating-chart'), {
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
        tension: 0.2,
      })),
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      scales: {
        x: { type: 'linear', ticks: { callback: (v) => date(v), maxTicksLimit: 6 }, grid: { display: false } },
        y: { ticks: { maxTicksLimit: 6 } },
      },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { boxWidth: 12, boxHeight: 12 } },
        tooltip: { callbacks: { title: (items) => time(items[0].parsed.x) } },
      },
    },
  });
}

function table(el, rows, nameHeader) {
  if (!rows.length) {
    el.outerHTML = '<p class="muted small">Ingen kamper ennå.</p>';
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

table(document.getElementById('lineups'), stats.lineups, 'Lag');
table(document.getElementById('clan-maps'), stats.clanMaps, 'Kart');

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
  </div>`).join('') : '<p class="muted small">Ingen kamper ennå.</p>';
