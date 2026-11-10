export function summaryFixture(sport: 'football' | 'basketball' = 'football', id = '401234567', starterHeadshot = 'https://a.espncdn.com/i/headshots/soccer/players/full/10.png') {
  return {
    header: { id, competitions: [{ date: '2026-10-23T18:00:00Z', status: { type: { state: 'in', detail: 'In progress' } }, competitors: [
      { homeAway: 'away', team: { id: '200', displayName: 'Very Long International Away Club Name' }, score: '1' },
      { homeAway: 'home', team: { id: '100', displayName: 'Very Long International Home Club Name' }, score: { value: 0 } },
    ] }] },
    gameInfo: { venue: { fullName: 'Review Match Stadium' } },
    boxscore: {
      teams: [
        { team: { id: '100' }, statistics: [{ name: 'shots', label: 'Shots on target', displayValue: '0' }, { name: 'possession', label: 'Possession', displayValue: '51%' }] },
        { team: { id: '200' }, statistics: [{ name: 'shots', label: 'Shots on target', displayValue: '5' }] },
      ],
      players: [{ team: { id: '100' }, statistics: [{ name: 'game', labels: ['MIN', 'PTS', 'REB', 'AST', 'FG', '3PT', 'FT', 'STL', 'BLK'], athletes: [
        { athlete: { id: '10', displayName: 'Reported Starter', jersey: '9', position: { abbreviation: 'G' } }, starter: true, stats: ['30', '0', '7', '4', '0-5', '0-2', '0-0', '1', '0'] },
        { athlete: { id: '11', displayName: 'Reported Bench Player' }, starter: false, stats: ['5', '2'] },
        // No athlete ID: `id` becomes the name, which must never reach a CDN photo URL.
        { athlete: { displayName: 'Player Without A Reported Id' }, starter: false, stats: ['1'] },
      ] }] }],
    },
    rosters: sport === 'football' ? [{ team: { id: '100' }, formation: '4-3-3', roster: [
      // Any provider href is passed through untouched; the folder here is only a
      // stand-in proving pass-through, never a layout this app derives.
      { athlete: { id: '10', displayName: 'Reported Starter', jersey: '9', headshot: { href: starterHeadshot } }, starter: true, position: { abbreviation: 'FW' } },
      // Not https: rejected rather than rendered.
      { athlete: { id: '11', displayName: 'Reported Bench Player', headshot: { href: 'http://tracker.example/11.png' } }, starter: false, didNotPlay: true },
      // No photo reported, and this competition has no proven CDN layout.
      { athlete: { id: '12', displayName: 'Player With Unknown Starting Status' } },
    ] }] : [],
    keyEvents: sport === 'football' ? [
      { id: 'goal-1', text: 'Reported goal from Away Club', clock: { displayValue: "21'" }, period: { number: 1 }, team: { id: '200' } },
      { id: 'goal-1', text: 'Reported goal from Away Club', clock: { displayValue: "21'" } },
      { id: 'card-1', text: 'Reported yellow card', clock: { displayValue: "30'" } },
    ] : [],
    plays: [{ id: 'play-1', text: 'Reported basket by Starter', clock: { displayValue: '11:20' }, period: { number: 1 }, team: { id: '100' } }],
  };
}
