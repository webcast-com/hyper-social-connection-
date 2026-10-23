export function historyEvent(id = '9001', date = '2026-10-20T18:00:00Z', ids = ['100', '200']) {
  return { id, date, competitions: [{ date, status: { type: { completed: true, name: 'STATUS_FINAL', detail: 'Final' } }, competitors: ids.map((id, index) => ({ team: { id, displayName: `Reported Team ${id}` }, homeAway: index ? 'away' : 'home', score: { value: index ? 0 : 2 }, winner: !index })) }] };
}
export function scheduleFixture(teamId: string, season: number, events = [historyEvent(String(season * 100), `${season}-10-20T18:00:00Z`)]) {
  return { team: { id: teamId }, season: { year: season }, events };
}
