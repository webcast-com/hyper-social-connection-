/** Team and player identities shared by the hub and the detail pages. */

export function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function teamKeyFor(name) {
  return slugify(name);
}

const SIDES = [
  ["home", "homeCode", "homeLogo"],
  ["away", "awayCode", "awayLogo"],
];

/**
 * Name-keyed team directory built from the games + standings a page already
 * has, so team links work from the first paint (before ESPN answers).
 */
export function buildTeamIndex({ games = [], standings = [], competitionId } = {}) {
  const teams = new Map();

  const merge = (key, patch) => {
    const clean = {};
    Object.entries(patch).forEach(([field, value]) => {
      if (value !== undefined && value !== null && value !== "") clean[field] = value;
    });
    teams.set(key, { key, ...(teams.get(key) ?? {}), ...clean });
  };

  games.forEach((game) => {
    SIDES.forEach(([nameField, codeField, logoField]) => {
      const name = game[nameField];
      if (!name) return;
      merge(teamKeyFor(name), {
        name,
        code: game[codeField],
        logo: game[logoField],
        competitionId: game.competitionId ?? competitionId,
        competition: game.competition,
        country: game.country,
        league: game.league,
      });
    });
  });

  standings.forEach((group) => {
    (group.rows ?? []).forEach((row) => {
      if (!row?.team) return;
      merge(teamKeyFor(row.team), {
        name: row.team,
        code: row.code,
        logo: row.logo,
        group: group.group,
        espnId: row.espnId,
        competitionId: row.competitionId ?? competitionId,
        record: {
          p: row.p,
          w: row.w,
          l: row.l,
          t: row.t,
          pct: row.pct,
          gb: row.gb,
          streak: row.streak,
        },
      });
    });
  });

  return teams;
}

export function findTeam(index, key) {
  if (!index?.size || !key) return null;
  const wanted = String(key).toLowerCase();
  if (index.has(wanted)) return index.get(wanted);
  for (const team of index.values()) {
    if (String(team.code ?? "").toLowerCase() === wanted) return team;
    if (team.espnId && String(team.espnId) === wanted) return team;
    if (slugify(team.name) === wanted) return team;
  }
  return null;
}

/** Games that involve this team, newest first is left to the caller. */
export function gamesForTeam(games = [], team) {
  if (!team?.name) return [];
  const name = String(team.name).toLowerCase();
  const code = String(team.code ?? "").toUpperCase();
  return games.filter((game) => {
    const names = [game.home, game.away].map((value) => String(value ?? "").toLowerCase());
    const codes = [game.homeCode, game.awayCode].map((value) => String(value ?? "").toUpperCase());
    return names.includes(name) || (code && codes.includes(code));
  });
}

/** Which side of a game the team is on: "home" | "away" | null. */
export function teamSide(game, team) {
  if (!team) return null;
  const name = String(team.name ?? "").toLowerCase();
  const code = String(team.code ?? "").toUpperCase();
  if (String(game.home ?? "").toLowerCase() === name || (code && String(game.homeCode ?? "").toUpperCase() === code)) {
    return "home";
  }
  if (String(game.away ?? "").toLowerCase() === name || (code && String(game.awayCode ?? "").toUpperCase() === code)) {
    return "away";
  }
  return null;
}

export function gameOpponent(game, team) {
  const side = teamSide(game, team) ?? (String(game.away ?? "").toLowerCase() === String(team?.name ?? "").toLowerCase() ? "home" : "away");
  return side === "home"
    ? { name: game.away, code: game.awayCode, logo: game.awayLogo, score: game.awayScore }
    : { name: game.home, code: game.homeCode, logo: game.homeLogo, score: game.homeScore };
}

export function gameScoreFor(game, team) {
  const side = teamSide(game, team);
  if (side === "home") return game.homeScore;
  if (side === "away") return game.awayScore;
  return null;
}

export function buildPlayerIndex(leaders = []) {
  const players = new Map();
  leaders.forEach((player) => {
    if (!player?.name) return;
    const key = slugify(player.name);
    players.set(key, { key, ...(players.get(key) ?? {}), ...player });
  });
  return players;
}

export function findPlayer(index, key) {
  if (!index?.size || !key) return null;
  const wanted = String(key).toLowerCase();
  if (index.has(wanted)) return index.get(wanted);
  for (const player of index.values()) {
    if (player.espnId && String(player.espnId) === wanted) return player;
    if (player.key === wanted) return player;
  }
  return null;
}

/** Other leaders wearing the same shirt, for the "more from this team" rail. */
export function teamMates(index, player) {
  if (!player?.team) return [];
  return [...index.values()].filter(
    (candidate) => candidate.key !== player.key && candidate.team === player.team
  );
}
