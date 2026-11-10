const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const toast = (message) => { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>el.classList.remove('show'),2400); };

// Keep ScoreHub's original markup and styling; populate its existing panels from
// the same-origin Sports endpoints (the browser never calls ESPN directly).
const matchTemplate = $('.match-card').cloneNode(true);
const tickerTemplate = $('.ticker-card').cloneNode(true);
let events = [], selectedSport = 'all', selectedLeague = '', selectedFilter = 'all', search = '', featureIndex = 0;
let scoreBusy = false, standingsRequest = 0, detailRequest = 0, selectedDetailId = null;
let cardObserver = null;
const favorites = new Set();
async function getJson(url) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 20000);
  try { const response = await fetch(url, {cache:'no-store', signal: controller.signal}); if (!response.ok) throw Error('Unavailable'); return await response.json(); }
  finally { clearTimeout(timer); }
}
const sportMap = { sports: 'all', football: 'football', basketball: 'basketball', tennis: 'tennis', baseball: 'baseball', hockey: 'ice-hockey', rugby: 'rugby', esports: 'esports' };
const leagueMap = ['epl', 'ucl', 'laliga', 'seriea', 'bundesliga', 'ligue1', 'mls'];
const standingMap = ['epl', 'laliga', 'seriea'];
const score = e => e.status === 'upcoming' ? 'VS' : `${e.away.score ?? '–'} - ${e.home.score ?? '–'}`;
const status = e => e.status === 'live' ? `LIVE ${e.detail || ''}`.trim() : e.status === 'final' ? (e.detail || 'Final') : new Date(e.startAt).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' EAT';
const shortName = team => team.short || team.name;
// Only use provider-supplied HTTPS images; keep an initial if the crest is absent or fails.
function setCrest(crest, team) {
  crest.className = crest.classList.contains('crest') ? 'crest' : 'mini-crest';
  const fallback = (team.short || team.name || '—').slice(0, 1).toUpperCase();
  crest.textContent = fallback;
  try {
    const url = new URL(team.logo);
    if (url.protocol !== 'https:' || url.username || url.password) return;
    const img = document.createElement('img'); img.alt = ''; img.width = 18; img.height = 18;
    img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'contain';
    img.referrerPolicy = 'no-referrer'; img.loading = 'lazy';
    img.addEventListener('error', () => { crest.textContent = fallback; }, { once: true });
    img.src = url.href; crest.replaceChildren(img);
  } catch { /* Missing or unsafe provider crest: retain the initial. */ }
}
const setTeam = (node, team) => {
  const crest = node.querySelector('i, .crest'); if (crest) setCrest(crest, team);
  const name = node.querySelector('b'); if (name) name.textContent = team.name;
  else node.replaceChildren(crest, document.createTextNode(' ' + team.name));
};
const detailHref = e => e.details && /^[a-z0-9-]+$/.test(e.details.league) && /^[1-9]\d{0,19}$/.test(e.details.eventId) ? `/sports/matches/${encodeURIComponent(e.details.league)}/${encodeURIComponent(e.details.eventId)}` : null;
const isToday = e => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date(e.startAt)) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
// Sharing, short TTLs and a bounded queue avoid one unbounded fan-out of
// summaries when a scoreboard has hundreds of cards. The server also caches.
const summaryCache = new Map(), summaryPending = new Map(), summaryQueue = [];
let activeSummaries = 0;
function pumpSummaries() {
  while (activeSummaries < 4 && summaryQueue.length) {
    const job = summaryQueue.shift(); activeSummaries++;
    getJson(job.url).then(board => {
      const valid = board?.status === 'ready' && Array.isArray(board.match?.teams) && Array.isArray(board.match?.statistics);
      const result = valid ? board.match : null;
      if (summaryCache.size >= 500) summaryCache.delete(summaryCache.keys().next().value);
      summaryCache.set(job.key, { match: result, expires: Date.now() + (result ? 30000 : 10000) });
      job.resolve(result);
    }).catch(() => {
      if (summaryCache.size >= 500) summaryCache.delete(summaryCache.keys().next().value);
      summaryCache.set(job.key, { match: null, expires: Date.now() + 10000 }); job.resolve(null);
    }).finally(() => { summaryPending.delete(job.key); activeSummaries--; pumpSummaries(); });
  }
}
function getSummary(e) {
  if (!detailHref(e)) return Promise.resolve(null);
  const key = `${e.details.league}/${e.details.eventId}`;
  const cached = summaryCache.get(key); if (cached && cached.expires > Date.now()) return Promise.resolve(cached.match);
  if (summaryPending.has(key)) return summaryPending.get(key);
  const promise = new Promise(resolve => {
    summaryQueue.push({ key, url: `/api/sports/matches/${encodeURIComponent(e.details.league)}/${encodeURIComponent(e.details.eventId)}`, resolve });
  });
  summaryPending.set(key, promise); pumpSummaries(); return promise;
}
const statKinds = [
  { id: 'possession', label: 'Possession', icon: '◉', match: s => /possession/i.test(`${s.name} ${s.label}`) },
  { id: 'shots', label: 'Shots', icon: '♧', match: s => /^(total )?shots$/i.test(s.label || '') || /^(totalshots|shots total)$/i.test(s.name || '') },
  { id: 'target', label: 'Shots on Target', icon: '▤', match: s => /shots?\s*on\s*(target|goal)/i.test(`${s.name} ${s.label}`) },
  { id: 'corners', label: 'Corners', icon: '', match: s => /corner/i.test(`${s.name} ${s.label}`) },
  { id: 'fouls', label: 'Fouls', icon: '', match: s => /^fouls( committed)?$/i.test(s.label || '') || /^(total)?fouls(Committed)?$/i.test(s.name || '') },
  { id: 'yellow', label: 'Yellow Cards', icon: '▣', match: s => /yellow\s*cards?/i.test(`${s.name} ${s.label}`) },
];
function statPair(match, kind) {
  const away = match?.teams?.find(t => t.side === 'away'), home = match?.teams?.find(t => t.side === 'home');
  const stat = match?.statistics?.find(kind.match);
  const value = team => team && stat?.values?.find(v => v.teamId === team.id)?.value;
  return [value(away) ?? '—', value(home) ?? '—'];
}
function renderCardStats(card, match) {
  const spans = $$('.match-stats > span', card);
  const kinds = statKinds.filter(kind => ['possession', 'shots', 'target', 'yellow'].includes(kind.id));
  spans.forEach((span, side) => {
    span.replaceChildren();
    kinds.forEach((kind, index) => {
      if (index) span.append(document.createTextNode('  '));
      const item = document.createElement('span'); const value = statPair(match, kind)[side];
      item.textContent = `${kind.icon} ${value}`; item.title = `${kind.label}: ${value}`; item.setAttribute('aria-label', `${kind.label}: ${value}`); span.append(item);
    });
  });
}
function loadCardStats(card, event) {
  if (!detailHref(event)) return;
  getSummary(event).then(match => { if (card.isConnected && card.dataset.eventId === event.id) renderCardStats(card, match); });
}
function selectedEvents() {
  return events.filter(e => (selectedSport === 'all' || e.sport === selectedSport) && (!selectedLeague || e.league === selectedLeague) &&
    (selectedFilter === 'all' || selectedFilter === 'live' && e.status === 'live' || selectedFilter === 'ht' && e.status === 'live' && /half\s*time|\bHT\b/i.test(e.detail || '') || selectedFilter === 'today' && isToday(e) || selectedFilter === 'favorites' && favorites.has(e.id)) &&
    (!search || `${e.away.name} ${e.home.name} ${e.leagueName}`.toLowerCase().includes(search)));
}
function renderMatches() {
  if (cardObserver) { cardObserver.disconnect(); cardObserver = null; }
  const list = $('#matchList'); list.replaceChildren();
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (cardObserver !== observer) return;
      for (const entry of entries) if (entry.isIntersecting && entry.target.isConnected) { observer.unobserve(entry.target); const event = events.find(item => item.id === entry.target.dataset.eventId); if (event) loadCardStats(entry.target, event); }
    }, { rootMargin: '200px' });
    cardObserver = observer;
  }
  const filtered = selectedEvents();
  for (const e of filtered) {
    const card = matchTemplate.cloneNode(true);
    card.dataset.status = e.status; card.dataset.league = e.leagueName; card.dataset.eventId = e.id;
    $('.match-meta > span', card).textContent = e.leagueName;
    $('.match-meta > b', card).textContent = status(e);
    const names = $$('.team-name', card); setTeam(names[0], e.away); setTeam(names[1], e.home);
    $('.match-scoreline > strong', card).textContent = score(e);
    const star = $('.star', card); star.classList.toggle('favorited', favorites.has(e.id)); star.textContent = favorites.has(e.id) ? '★' : '☆'; star.setAttribute('aria-pressed', String(favorites.has(e.id)));
    const details = $('.match-actions button:not(.star)', card); details.disabled = !detailHref(e); details.title = detailHref(e) ? 'Show match statistics' : 'Match details unavailable';
    renderCardStats(card, null);
    list.append(card);
    if (cardObserver) cardObserver.observe(card); else loadCardStats(card, e);
  }
  if (!filtered.length) { const empty = document.createElement('p'); empty.textContent = events.length ? 'No matches match these filters.' : 'No ESPN matches available.'; list.append(empty); }
}
function renderFeature() {
  const candidates = selectedEvents();
  const e = candidates[featureIndex % Math.max(candidates.length, 1)];
  const head = $$('.feature-head > span'); const teams = $$('.team-large');
  if (!e) {
    head[0].textContent = 'ESPN matches'; head[1].textContent = 'No match available';
    teams.forEach(t => setTeam(t, {name:'—'})); $('.feature-score strong').textContent = '–'; $('.feature-score small').textContent = '';
  } else {
    head[0].textContent = e.leagueName; head[1].textContent = status(e);
    setTeam(teams[0], e.away); setTeam(teams[1], e.home); $('.feature-score strong').textContent = score(e); $('.feature-score small').textContent = e.venue || '';
  }
  $('.event-list').replaceChildren();
  const note = document.createElement('span'); note.textContent = e ? 'Scores provided by ESPN' : 'Try another filter or check again later.'; $('.event-list').append(note);
  const selected = candidates.find(item => item.id === selectedDetailId);
  renderStatistics(selected || e);
}
function renderTicker() {
  const ticker = $('.ticker'); ticker.replaceChildren();
  const live = events.filter(e => e.status === 'live' && (selectedSport === 'all' || e.sport === selectedSport));
  for (const e of live) {
    const card = tickerTemplate.cloneNode(true); const small = $('small', card); small.replaceChildren(document.createTextNode(e.leagueName + ' ')); const b = document.createElement('b'); b.textContent = status(e); small.append(b);
    const row = $('div', card); const away = document.createElement('span'), home = document.createElement('span'); away.className = home.className = 'mini-crest'; setCrest(away, e.away); setCrest(home, e.home); const strong = document.createElement('strong'); strong.textContent = score(e); row.replaceChildren(away, document.createTextNode(shortName(e.away)), strong, document.createTextNode(shortName(e.home)), home); ticker.append(card);
  }
  if (!live.length) { const empty = document.createElement('span'); empty.textContent = 'No live matches reported.'; ticker.append(empty); }
}
function updateView() { featureIndex = 0; renderMatches(); renderTicker(); renderFeature(); }
function setScoreState(message) { $('.matches-panel .panel-title h2').textContent = message; }
async function loadScores() {
  if (scoreBusy) return; scoreBusy = true;
  try {
    const board = await getJson('/api/sports'); if (!Array.isArray(board.events) || !['live', 'partial', 'demo'].includes(board.mode)) throw Error('Invalid');
    // Hyper intentionally includes illustrative fixtures when all providers fail.
    // Never display those as real scores on ScoreHub.
    events = board.events.filter(e => e.source === 'espn' && !e.race && e.home && e.away && e.home.name && e.away.name && Number.isFinite(Date.parse(e.startAt)) && ['live','upcoming','final'].includes(e.status));
    setScoreState(board.mode === 'demo' ? 'ESPN scores unavailable' : board.mode === 'partial' ? 'Scores · ESPN (partial)' : 'Scores · ESPN');
    const liveCount = events.filter(e => e.status === 'live').length;
    $('.live-pill b').textContent = String(liveCount);
    const values = $$('.quick-stats > div > b'); values[0].textContent = String(liveCount); values[1].textContent = String(new Set(events.map(e => e.sport)).size); values[2].textContent = String(new Set(events.map(e => e.league)).size); values[3].textContent = '—';
    updateView();
  } catch {
    if (!events.length) { setScoreState('ESPN scores unavailable'); updateView(); }
    else { setScoreState('ESPN scores · update failed'); }
  } finally { scoreBusy = false; }
}
async function loadStandings(league) {
  const request = ++standingsRequest, body = $('.standings tbody'); body.replaceChildren();
  const message = text => { const row = document.createElement('tr'), cell = document.createElement('td'); cell.colSpan = 5; cell.textContent = text; row.append(cell); body.replaceChildren(row); };
  message('Loading ESPN standings…');
  try {
    const board = await getJson(`/api/sports/standings/${encodeURIComponent(league)}`); if (request !== standingsRequest) return;
    if (board.status !== 'ready' || !Array.isArray(board.groups) || !board.groups[0] || !Array.isArray(board.groups[0].rows)) { message(board.status === 'empty' ? 'No standings reported.' : 'Standings unavailable.'); return; }
    body.replaceChildren();
    for (const row of board.groups[0].rows.slice(0, 5)) {
      const tr = document.createElement('tr');
      for (const value of [row.rank, row.team, row.values?.gamesPlayed, row.values?.pointDifferential ?? row.values?.goalDifference, row.values?.points]) { const cell = document.createElement('td'); cell.textContent = value ?? '—'; tr.append(cell); }
      body.append(tr);
    }
    if (!body.children.length) message('No standings reported.');
  } catch { if (request === standingsRequest) message('Standings unavailable.'); }
}
async function renderStatistics(e) {
  const request = ++detailRequest; const panel = $('.statistics');
  const title = $('.stats-score', panel); title.replaceChildren();
  const add = (parent, tag, text) => { const node = document.createElement(tag); node.textContent = text; parent.append(node); return node; };
  function titleTeam(team) { const span = document.createElement('span'), crest = document.createElement('i'); crest.className = 'mini-crest'; setCrest(crest, team); span.append(crest, document.createTextNode(shortName(team))); title.append(span); }
  titleTeam(e?.away || {name:'—'}); add(title, 'b', e ? score(e) : '–'); titleTeam(e?.home || {name:'—'});
  const possession = $$('.possession > b', panel), donut = $('.donut', panel);
  const bars = $('.stat-bars', panel), link = $('.statistics .table-link'); link.href = e && detailHref(e) || '#stats';
  function fill(match) {
    const pair = statPair(match, statKinds[0]); possession[0].textContent = pair[0]; possession[1].textContent = pair[1];
    const percent = pair.map(value => /^\d+(?:\.\d+)?%?$/.test(String(value).trim()) ? Number.parseFloat(value) : NaN);
    if (percent.every(n => Number.isFinite(n) && n >= 0 && n <= 100) && percent[0] + percent[1] > 0) {
      const split = percent[0] / (percent[0] + percent[1]) * 100;
      donut.style.background = `conic-gradient(#ff425a 0 ${split}%,#247cf4 ${split}% 100%)`;
    } else donut.style.background = '#344454';
    bars.replaceChildren();
    for (const kind of statKinds.filter(item => ['shots','target','corners','fouls','yellow'].includes(item.id))) {
      const values = statPair(match, kind), row = document.createElement('div'); add(row, 'span', kind.label); add(row, 'b', values[0]);
      const bar = document.createElement('i');
      const numbers = values.map(value => /^\d+(?:\.\d+)?$/.test(String(value).trim()) ? Number(value) : NaN);
      if (numbers.every(n => Number.isFinite(n) && n >= 0) && numbers[0] + numbers[1] > 0) bar.style.setProperty('--left', `${numbers[0] / (numbers[0] + numbers[1]) * 100}%`);
      else bar.style.background = '#344454';
      row.append(bar); add(row, 'b', values[1]); bars.append(row);
    }
  }
  fill(null);
  const caption = $('.donut span', panel);
  panel.setAttribute('aria-label', !e || !detailHref(e) ? 'Match statistics unavailable' : 'Loading match statistics');
  caption.textContent = !e || !detailHref(e) ? 'Unavailable' : 'Loading…';
  if (!e || !detailHref(e)) return;
  const match = await getSummary(e); if (request !== detailRequest) return;
  fill(match); caption.textContent = match ? 'Possession' : 'Unavailable';
  panel.setAttribute('aria-label', match ? 'Match statistics reported by ESPN; dashes mean unavailable' : 'Match statistics unavailable');
}

// Remove the original illustrative score values immediately while loading.
$('#matchList').replaceChildren(); $('.ticker').replaceChildren(); $('.standings tbody').replaceChildren();
$('.live-pill b').textContent = '—'; $$('.quick-stats > div > b').forEach(el => el.textContent = '—');
$('.scorers h2').textContent = 'Top Scorers (sample)'; $('.news-section h2').textContent = 'Latest News (sample)';
$$('.league-row small').forEach(el => el.textContent = 'ESPN competition');
setScoreState('Loading ESPN scores…'); renderFeature();
$('#menuToggle').addEventListener('click',()=>$('#mainNav').classList.toggle('open'));
$$('.main-nav a').forEach(a=>a.addEventListener('click',()=>$('#mainNav').classList.remove('open')));
$('#themeToggle').addEventListener('click',()=>{document.body.classList.toggle('light-mode');$('#themeToggle').textContent=document.body.classList.contains('light-mode')?'☀':'☾';});
$('#watchLive').addEventListener('click',()=>toast('Live streaming links will appear here when connected to a broadcaster.'));
$('#matchList').addEventListener('click', e => {
  const button = e.target.closest('button'), card = e.target.closest('.match-card'); if (!button || !card) return;
  const event = events.find(item => item.id === card.dataset.eventId); if (!event) return;
  if (button.classList.contains('star')) { favorites.has(event.id) ? favorites.delete(event.id) : favorites.add(event.id); renderMatches(); toast(favorites.has(event.id) ? 'Match added to favorites' : 'Match removed from favorites'); }
  else if (detailHref(event)) { selectedDetailId = event.id; renderStatistics(event); $('.statistics').scrollIntoView?.({ behavior: 'smooth', block: 'nearest' }); }
});
$$('.filter').forEach(btn=>{if(btn.id==='sortBtn')return;btn.addEventListener('click',()=>{ $$('.filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active'); selectedFilter=btn.dataset.filter; updateView(); });});
$('#sortBtn').addEventListener('click',()=>toast('Filter by live, halftime, today or favorites.'));
$('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter'){ search=e.target.value.trim().toLowerCase(); updateView(); toast(search ? `${selectedEvents().length} matching matches found` : 'Showing all matches'); }});
$$('.league-tabs button').forEach((btn,index)=>btn.addEventListener('click',()=>{$$('.league-tabs button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');loadStandings(standingMap[index]);}));
$$('.sport-nav a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault(); $$('.sport-nav a').forEach(b=>b.classList.remove('selected'));a.classList.add('selected'); selectedSport=sportMap[a.getAttribute('href').slice(1)] || 'all'; selectedLeague=''; updateView();}));
$$('.sport-nav a').forEach(a => a.classList.toggle('selected', a.getAttribute('href') === '#sports'));
$$('.league-row').forEach((a,index)=>a.addEventListener('click',e=>{e.preventDefault();selectedSport='all';selectedLeague=leagueMap[index];$$('.sport-nav a').forEach(b=>b.classList.toggle('selected', b.getAttribute('href') === '#sports'));updateView();$('#fixtures').scrollIntoView?.();}));
$$('.hero-arrow').forEach((btn,index)=>btn.addEventListener('click',()=>{const n=selectedEvents().length; if(n){selectedDetailId=null;featureIndex=(featureIndex+(index ? 1 : n-1))%n;renderFeature();}}));
$$('.news-card').forEach(card=>card.addEventListener('click',()=>{card.classList.toggle('expanded');if(card.classList.contains('expanded'))toast(card.querySelector('h3').textContent);}));
loadStandings('epl'); loadScores();
setInterval(() => { if (document.visibilityState !== 'hidden') loadScores(); }, 45_000);
