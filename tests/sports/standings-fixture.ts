export function standingsFixture(year = 2026) {
  return { season: { year, displayName: `${year - 1}/${year}` }, children: [
    { name: 'Group A', standings: { entries: [
      { team: { id: '300', displayName: 'Other Club' }, stats: [{ name: 'rank', displayValue: '7' }, { name: 'wins', shortDisplayName: 'W', displayName: 'Wins', displayValue: '8' }] },
    ] } },
    { name: 'Group B', standings: { entries: [
      { team: { id: '100', displayName: 'Very Long International Home Club Name', logo: 'https://a.espncdn.com/i/teamlogos/soccer/500/100.png' }, note: { description: 'Qualified for next stage' }, stats: [
        { name: 'rank', displayValue: '3' }, { name: 'gamesPlayed', shortDisplayName: 'P', displayName: 'Played', displayValue: '10' },
        { name: 'wins', shortDisplayName: 'W', displayName: 'Wins', value: 0 }, { name: 'losses', shortDisplayName: 'L', displayName: 'Losses', displayValue: '3' },
        { name: 'points', shortDisplayName: 'Pts', displayName: 'Points', displayValue: '21' },
      ] },
      { team: { id: '200', displayName: 'Very Long International Away Club Name', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/soccer/500/200.png' }] }, stats: [
        { name: 'points', shortDisplayName: 'Pts', displayName: 'Points', displayValue: '15' },
      ] },
    ] } },
  ] };
}
