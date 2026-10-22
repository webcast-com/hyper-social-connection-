export function oddsEvent(id = 'game', hours = 1) {
  return {
    id, date: new Date(Date.now() + hours * 3_600_000).toISOString(),
    competitions: [{
      status: { type: { state: 'pre', completed: false } }, venue: { fullName: 'Review Stadium' },
      competitors: [
        { homeAway: 'away', team: { displayName: 'Away Club', logo: 'https://example.test/away.png' } },
        { homeAway: 'home', team: { displayName: 'Home Club', logo: 'https://example.test/home.png' } },
      ],
      odds: [{ provider: { name: 'Review bookmaker' }, homeTeamOdds: { moneyLine: -125 }, awayTeamOdds: { moneyLine: 120 }, overUnder: 2.5 }],
    }],
  };
}
