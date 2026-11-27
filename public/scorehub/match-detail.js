const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const params = new URLSearchParams(location.search);
const league = params.get('league') || '';
const eventId = params.get('eventId') || '';
let matchData = null;
let activeSection = 'overview';

function safeText(value, fallback = '—') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}
function validReference() {
  return /^[a-z0-9-]{1,40}$/.test(league) && /^[1-9]\d{0,19}$/.test(eventId);
}
function teamSides(match) {
  const teams = Array.isArray(match?.teams) ? match.teams : [];
  return {
    away: teams.find(team => team.side === 'away') || teams[0] || null,
    home: teams.find(team => team.side === 'home') || teams[1] || null,
  };
}
function kickoffLabel(value) {
  const date = Date.parse(value || '');
  return Number.isFinite(date)
    ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' }).format(date) + ' · EAT'
    : 'Kickoff time not reported';
}
function setMessage(message, state = 'unavailable') {
  $('#matchStatus').textContent = state === 'loading' ? 'Loading…' : state === 'unavailable' ? 'Unavailable' : state;
  $('#matchTitle').textContent = state === 'loading' ? 'Loading match details…' : 'Match details unavailable';
  $('#sectionTitle').textContent = 'Match overview';
  $('#sectionContent').replaceChildren();
  const note = document.createElement('p');
  note.className = 'detail-message';
  note.setAttribute('role', 'status');
  note.textContent = message;
  $('#sectionContent').append(note);
  $('#detailPanel').setAttribute('aria-busy', String(state === 'loading'));
}
function paintHeader(match) {
  const { away, home } = teamSides(match);
  $('#matchLeague').textContent = safeText(match.leagueName, 'ESPN match centre');
  $('#crumbLeague').textContent = safeText(match.leagueName, 'Match centre');
  $('#matchStatus').textContent = safeText(match.statusText || match.state, 'Status not reported');
  $('#matchTitle').textContent = safeText(match.title, `${safeText(away?.name)} vs ${safeText(home?.name)}`);
  $('#awayName').textContent = safeText(away?.name, 'Away team not reported');
  $('#homeName').textContent = safeText(home?.name, 'Home team not reported');
  $('#awayCrest').textContent = [...safeText(away?.name, '—')][0]?.toUpperCase() || '—';
  $('#homeCrest').textContent = [...safeText(home?.name, '—')][0]?.toUpperCase() || '—';
  $('#score').textContent = `${safeText(away?.score)} – ${safeText(home?.score)}`;
  $('#period').textContent = safeText(match.statusText || match.state, 'Score reported by ESPN');
  $('#matchKickoff').textContent = [kickoffLabel(match.kickoff), match.venue].filter(Boolean).join(' · ');
  document.title = `${safeText(match.title, 'Match details')} — ScoreHub`;
}
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined && text !== null) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
function empty(message) {
  const note = node('p', message, 'detail-message');
  $('#sectionContent').replaceChildren(note);
}
function fact(label, value) {
  const item = node('div', undefined, 'detail-fact');
  item.append(node('small', label), node('b', safeText(value)));
  return item;
}
function renderOverview(match) {
  const information = match.information || {};
  const content = $('#sectionContent');
  content.replaceChildren();
  const facts = node('div', undefined, 'detail-facts');
  facts.append(
    fact('Competition', match.leagueName),
    fact('Kickoff · East Africa', kickoffLabel(match.kickoff)),
    fact('Venue', match.venue),
    fact('Stage', information.stage),
    fact('Attendance', information.attendance),
    fact('Season', match.season?.label || match.season?.year),
  );
  content.append(facts);
  const officials = Array.isArray(information.officials) ? information.officials : [];
  if (officials.length) {
    const section = node('div', undefined, 'overview-officials');
    section.style.marginTop = '12px';
    section.append(node('h3', 'Officials', 'detail-subtitle'));
    const list = node('ul', undefined, 'detail-list');
    officials.forEach(official => {
      const item = node('li', undefined);
      item.append(node('strong', safeText(official.name)), node('small', safeText(official.role, 'Role not reported')));
      list.append(item);
    });
    section.append(list); content.append(section);
  }
  if (!officials.length && !match.kickoff && !match.venue && !information.stage && !information.attendance) {
    empty('ESPN has not reported additional match information yet.');
  }
}
function renderStatistics(match) {
  const statistics = Array.isArray(match.statistics) ? match.statistics : [];
  if (!statistics.length) return empty('ESPN has not provided team statistics for this match.');
  const { away, home } = teamSides(match);
  const table = node('table', undefined, 'detail-stats');
  const head = node('thead'); const headRow = node('tr');
  headRow.append(node('th', 'Statistic'), node('th', safeText(away?.name, 'Away')) , node('th', safeText(home?.name, 'Home')));
  head.append(headRow); table.append(head);
  const body = node('tbody');
  statistics.forEach(stat => {
    const row = node('tr'); row.append(node('th', safeText(stat.label || stat.name)));
    const values = Array.isArray(stat.values) ? stat.values : [];
    [away, home].forEach(team => {
      const reported = team && values.find(value => value.teamId === team.id);
      row.append(node('td', safeText(reported?.value)));
    });
    body.append(row);
  });
  table.append(body); $('#sectionContent').replaceChildren(table);
}
function renderLineups(match) {
  const lineups = Array.isArray(match.lineups) ? match.lineups : [];
  if (!lineups.length) return empty('ESPN has not published lineups for this match. Starting lineups may appear closer to kickoff.');
  const { away, home } = teamSides(match);
  const grid = node('div', undefined, 'lineup-grid');
  [away, home].forEach(team => {
    if (!team) return;
    const lineup = lineups.find(item => item.teamId === team.id);
    const card = node('article', undefined, 'lineup-card');
    card.append(node('h3', `${team.name}${lineup?.formation ? ` · ${lineup.formation}` : ''}`));
    const players = Array.isArray(lineup?.players) ? lineup.players : [];
    if (!players.length) {
      card.append(node('p', 'No lineup reported for this team.', 'detail-message'));
    } else {
      const list = node('ol');
      players.forEach(player => {
        const item = node('li');
        item.append(document.createTextNode(safeText(player.name)));
        const details = [player.position, player.jersey ? `#${player.jersey}` : null, player.starter === true ? 'Starting' : player.starter === false ? 'Substitute' : null, player.didNotPlay ? 'Did not play' : null].filter(Boolean);
        if (details.length) item.append(node('small', ` · ${details.join(' · ')}`));
        list.append(item);
      });
      card.append(list);
    }
    grid.append(card);
  });
  $('#sectionContent').replaceChildren(grid);
}
function renderPlayers(match) {
  const groups = Array.isArray(match.playerStats) ? match.playerStats : [];
  if (!groups.length) return empty('ESPN has not provided player statistics for this match.');
  const content = $('#sectionContent'); content.replaceChildren();
  groups.forEach(group => {
    const card = node('section', undefined, 'lineup-card');
    card.style.marginBottom = '10px';
    card.append(node('h3', `${teamSides(match).away?.id === group.teamId ? teamSides(match).away.name : teamSides(match).home?.name || 'Team'} · ${safeText(group.label, 'Player stats')}`));
    const table = node('table', undefined, 'detail-stats');
    const head = node('thead'); const row = node('tr'); row.append(node('th', 'Player'));
    (Array.isArray(group.columns) ? group.columns : []).forEach(label => row.append(node('th', safeText(label))));
    head.append(row); table.append(head);
    const body = node('tbody');
    (Array.isArray(group.players) ? group.players : []).forEach(player => {
      const playerRow = node('tr'); playerRow.append(node('th', safeText(player.name)));
      (Array.isArray(player.values) ? player.values : []).forEach(value => playerRow.append(node('td', safeText(value))));
      body.append(playerRow);
    });
    table.append(body); card.append(table); content.append(card);
  });
}
function renderEvents(match) {
  const updates = Array.isArray(match.updates) ? match.updates : [];
  if (!updates.length) return empty('ESPN has not provided match events or play-by-play updates.');
  const list = node('ol', undefined, 'detail-list');
  updates.forEach(update => {
    const item = node('li');
    const details = [update.period ? `Period ${update.period}` : null, update.clock, update.team].filter(Boolean).join(' · ');
    if (details) item.append(node('small', details));
    item.append(node('strong', safeText(update.text, 'Event description not reported')));
    const participants = Array.isArray(update.participants) ? update.participants : [];
    if (participants.length) item.append(node('small', `Players: ${participants.join(', ')}`));
    list.append(item);
  });
  $('#sectionContent').replaceChildren(list);
}
function renderSection(section = activeSection) {
  if (!matchData) return;
  activeSection = section;
  const labels = { overview: 'Match overview', statistics: 'Match statistics', lineups: 'Lineups', players: 'Player statistics', events: safeText(matchData.updatesLabel, 'Match events') };
  $('#sectionTitle').textContent = labels[section] || labels.overview;
  $('#detailPanel').setAttribute('aria-labelledby', `tab-${section}`);
  $$('.detail-tabs [role="tab"]').forEach(tab => {
    const selected = tab.dataset.section === section;
    tab.classList.toggle('active', selected);
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  if (section === 'statistics') renderStatistics(matchData);
  else if (section === 'lineups') renderLineups(matchData);
  else if (section === 'players') renderPlayers(matchData);
  else if (section === 'events') renderEvents(matchData);
  else renderOverview(matchData);
}
async function loadMatch() {
  if (!validReference()) {
    setMessage('This match link is missing a valid competition or event ID. Return to the scores list and choose a reported match.');
    return;
  }
  setMessage('Loading ESPN match details…', 'loading');
  try {
    const response = await fetch(`/api/sports/matches/${encodeURIComponent(league)}/${encodeURIComponent(eventId)}`, { cache: 'no-store' });
    const board = await response.json();
    if (!response.ok || !board || board.status !== 'ready' || !board.match || !Array.isArray(board.match.teams)) {
      setMessage(response.status === 403 ? 'ESPN access to this match was refused. No sample match data is substituted.' : 'ESPN match details are currently unavailable. No sample scores, statistics or lineups are substituted.');
      return;
    }
    matchData = board.match;
    paintHeader(matchData);
    $('#detailPanel').setAttribute('aria-busy', 'false');
    renderSection('overview');
  } catch {
    setMessage('Could not load ESPN match details. Check your connection and try again. No sample data is substituted.');
  }
}

$('#menuToggle').addEventListener('click', () => {
  const open = $('#mainNav').classList.toggle('open');
  $('#menuToggle').setAttribute('aria-expanded', String(open));
});
$$('.main-nav a').forEach(link => link.addEventListener('click', () => $('#mainNav').classList.remove('open')));
$('#themeToggle').addEventListener('click', () => {
  document.body.classList.toggle('light-mode');
  $('#themeToggle').textContent = document.body.classList.contains('light-mode') ? '☀' : '☾';
});
$('.detail-tabs').addEventListener('click', event => {
  const tab = event.target.closest('[role="tab"]');
  if (tab && matchData) renderSection(tab.dataset.section);
});
$('.detail-tabs').addEventListener('keydown', event => {
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  const tabs = $$('.detail-tabs [role="tab"]');
  const current = tabs.indexOf(document.activeElement);
  const next = (current + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
  event.preventDefault(); tabs[next].focus(); tabs[next].click();
});
$('#searchInput').addEventListener('keydown', event => {
  if (event.key === 'Enter' && event.currentTarget.value.trim()) location.href = `index.htm#fixtures`;
});
void loadMatch();
