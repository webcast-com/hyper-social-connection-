const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const toast = (message) => { const el=$('#toast'); el.textContent=message; el.classList.add('show'); clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>el.classList.remove('show'),2400); };

// Keep ScoreHub's original markup and styling; populate its existing panels from
// the same-origin Sports endpoints (the browser never calls ESPN directly).
const matchTemplate = $('.match-card').cloneNode(true);
const tickerTemplate = $('.ticker-card').cloneNode(true);
let events = [], selectedSport = 'all', selectedLeague = '', selectedFilter = 'all', search = '', featureIndex = 0;
let scoreBusy = false, standingsRequest = 0, detailRequest = 0;
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
const setTeam = (node, team) => { const crest = node.querySelector('i, .crest'); if (crest) { crest.className = crest.classList.contains('crest') ? 'crest' : 'mini-crest'; crest.textContent = (team.short || team.name).slice(0, 1).toUpperCase(); } const name = node.querySelector('b'); if (name) name.textContent = team.name; else { const text = document.createTextNode(' ' + team.name); node.replaceChildren(crest, text); } };
const detailHref = e => e.details && /^[a-z0-9-]+$/.test(e.details.league) && /^[1-9]\d{0,19}$/.test(e.details.eventId) ? `/sports/matches/${encodeURIComponent(e.details.league)}/${encodeURIComponent(e.details.eventId)}` : null;
const isToday = e => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date(e.startAt)) === new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
function selectedEvents() {
  return events.filter(e => (selectedSport === 'all' || e.sport === selectedSport) && (!selectedLeague || e.league === selectedLeague) &&
    (selectedFilter === 'all' || selectedFilter === 'live' && e.status === 'live' || selectedFilter === 'ht' && e.status === 'live' && /half\s*time|\bHT\b/i.test(e.detail || '') || selectedFilter === 'today' && isToday(e) || selectedFilter === 'favorites' && favorites.has(e.id)) &&
    (!search || `${e.away.name} ${e.home.name} ${e.leagueName}`.toLowerCase().includes(search)));
}
function renderMatches() {
  const list = $('#matchList'); list.replaceChildren();
  const filtered = selectedEvents();
  for (const e of filtered) {
    const card = matchTemplate.cloneNode(true);
    card.dataset.status = e.status; card.dataset.league = e.leagueName; card.dataset.eventId = e.id;
    $('.match-meta > span', card).textContent = e.leagueName;
    $('.match-meta > b', card).textContent = status(e);
    const names = $$('.team-name', card); setTeam(names[0], e.away); setTeam(names[1], e.home);
    $('.match-scoreline > strong', card).textContent = score(e);
    const star = $('.star', card); star.classList.toggle('favorited', favorites.has(e.id)); star.textContent = favorites.has(e.id) ? '★' : '☆'; star.setAttribute('aria-pressed', String(favorites.has(e.id)));
    const details = $('.match-actions button:not(.star)', card); details.disabled = !detailHref(e); details.title = detailHref(e) ? 'Open match details' : 'Match details unavailable';
    const stats = $('.match-stats', card); stats.replaceChildren();
    const line = document.createElement('span'); line.textContent = e.venue || 'ESPN-reported match'; stats.append(line);
    list.append(card);
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
  renderStatistics(e);
}
function renderTicker() {
  const ticker = $('.ticker'); ticker.replaceChildren();
  const live = events.filter(e => e.status === 'live' && (selectedSport === 'all' || e.sport === selectedSport));
  for (const e of live) {
    const card = tickerTemplate.cloneNode(true); const small = $('small', card); small.replaceChildren(document.createTextNode(e.leagueName + ' ')); const b = document.createElement('b'); b.textContent = status(e); small.append(b);
    const row = $('div', card); row.replaceChildren(document.createTextNode(shortName(e.away) + ' ')); const strong = document.createElement('strong'); strong.textContent = score(e); row.append(strong, document.createTextNode(' ' + shortName(e.home))); ticker.append(card);
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
  add(title, 'span', e?.away.name || '—'); add(title, 'b', e ? score(e) : '–'); add(title, 'span', e?.home.name || '—');
  const possession = $$('.possession > b', panel); possession.forEach(el => el.textContent = '—'); $('.donut', panel).style.background = '#344454';
  const bars = $('.stat-bars', panel); bars.replaceChildren();
  const note = text => { bars.replaceChildren(); add(bars, 'p', text); };
  const href = e && detailHref(e); $('.statistics .table-link').href = href || '#stats';
  if (!href) { note('Match statistics unavailable.'); return; }
  note('Loading match statistics…');
  try {
    const board = await getJson(`/api/sports/matches/${encodeURIComponent(e.details.league)}/${encodeURIComponent(e.details.eventId)}`); if (request !== detailRequest) return;
    const match = board.match;
    if (board.status !== 'ready' || !Array.isArray(match?.statistics) || !Array.isArray(match?.teams)) { note('Match statistics unavailable.'); return; }
    const away = match.teams.find(t => t.side === 'away'), home = match.teams.find(t => t.side === 'home');
    if (!away || !home) { note('Match statistics unavailable.'); return; }
    const val = (stat, team) => stat.values?.find(v => v.teamId === team.id)?.value ?? '—';
    const poss = match.statistics.find(s => /possession/i.test(`${s.name} ${s.label}`));
    if (poss) { possession[0].textContent = val(poss, away); possession[1].textContent = val(poss, home); }
    const list = match.statistics.filter(s => !/possession/i.test(`${s.name} ${s.label}`)).slice(0, 5); bars.replaceChildren();
    for (const stat of list) { const row = document.createElement('div'); add(row, 'span', stat.label); add(row, 'b', val(stat, away)); const bar = document.createElement('i'); bar.style.background = '#344454'; row.append(bar); add(row, 'b', val(stat, home)); bars.append(row); }
    if (!list.length) note('No additional statistics reported.');
  } catch { if (request === detailRequest) note('Match statistics unavailable.'); }
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
  else { const href = detailHref(event); if (href) window.location.assign(href); }
});
$$('.filter').forEach(btn=>{if(btn.id==='sortBtn')return;btn.addEventListener('click',()=>{ $$('.filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active'); selectedFilter=btn.dataset.filter; updateView(); });});
$('#sortBtn').addEventListener('click',()=>toast('Filter by live, halftime, today or favorites.'));
$('#searchInput').addEventListener('keydown',e=>{if(e.key==='Enter'){ search=e.target.value.trim().toLowerCase(); updateView(); toast(search ? `${selectedEvents().length} matching matches found` : 'Showing all matches'); }});
$$('.league-tabs button').forEach((btn,index)=>btn.addEventListener('click',()=>{$$('.league-tabs button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');loadStandings(standingMap[index]);}));
$$('.sport-nav a').forEach(a=>a.addEventListener('click',e=>{e.preventDefault(); $$('.sport-nav a').forEach(b=>b.classList.remove('selected'));a.classList.add('selected'); selectedSport=sportMap[a.getAttribute('href').slice(1)] || 'all'; selectedLeague=''; updateView();}));
$$('.sport-nav a').forEach(a => a.classList.toggle('selected', a.getAttribute('href') === '#sports'));
$$('.league-row').forEach((a,index)=>a.addEventListener('click',e=>{e.preventDefault();selectedSport='all';selectedLeague=leagueMap[index];$$('.sport-nav a').forEach(b=>b.classList.toggle('selected', b.getAttribute('href') === '#sports'));updateView();$('#fixtures').scrollIntoView?.();}));
$$('.hero-arrow').forEach((btn,index)=>btn.addEventListener('click',()=>{const n=selectedEvents().length; if(n){featureIndex=(featureIndex+(index ? 1 : n-1))%n;renderFeature();}}));
$$('.news-card').forEach(card=>card.addEventListener('click',()=>{card.classList.toggle('expanded');if(card.classList.contains('expanded'))toast(card.querySelector('h3').textContent);}));
loadStandings('epl'); loadScores();
setInterval(() => { if (document.visibilityState !== 'hidden') loadScores(); }, 45_000);
