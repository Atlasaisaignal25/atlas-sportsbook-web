export type MlbTeamIdentity = {
  officialTeamId: string;
  officialTeamName: string;
  normalizedName: string;
  oddsNames: string[];
  savantCode: string;
};

export const MLB_TEAM_IDENTITIES: MlbTeamIdentity[] = [
  { officialTeamId: "109", officialTeamName: "Arizona Diamondbacks", normalizedName: "arizona diamondbacks", oddsNames: ["Arizona Diamondbacks"], savantCode: "AZ" },
  { officialTeamId: "144", officialTeamName: "Atlanta Braves", normalizedName: "atlanta braves", oddsNames: ["Atlanta Braves"], savantCode: "ATL" },
  { officialTeamId: "110", officialTeamName: "Baltimore Orioles", normalizedName: "baltimore orioles", oddsNames: ["Baltimore Orioles"], savantCode: "BAL" },
  { officialTeamId: "111", officialTeamName: "Boston Red Sox", normalizedName: "boston red sox", oddsNames: ["Boston Red Sox"], savantCode: "BOS" },
  { officialTeamId: "112", officialTeamName: "Chicago Cubs", normalizedName: "chicago cubs", oddsNames: ["Chicago Cubs"], savantCode: "CHC" },
  { officialTeamId: "145", officialTeamName: "Chicago White Sox", normalizedName: "chicago white sox", oddsNames: ["Chicago White Sox"], savantCode: "CWS" },
  { officialTeamId: "113", officialTeamName: "Cincinnati Reds", normalizedName: "cincinnati reds", oddsNames: ["Cincinnati Reds"], savantCode: "CIN" },
  { officialTeamId: "114", officialTeamName: "Cleveland Guardians", normalizedName: "cleveland guardians", oddsNames: ["Cleveland Guardians"], savantCode: "CLE" },
  { officialTeamId: "115", officialTeamName: "Colorado Rockies", normalizedName: "colorado rockies", oddsNames: ["Colorado Rockies"], savantCode: "COL" },
  { officialTeamId: "116", officialTeamName: "Detroit Tigers", normalizedName: "detroit tigers", oddsNames: ["Detroit Tigers"], savantCode: "DET" },
  { officialTeamId: "117", officialTeamName: "Houston Astros", normalizedName: "houston astros", oddsNames: ["Houston Astros"], savantCode: "HOU" },
  { officialTeamId: "118", officialTeamName: "Kansas City Royals", normalizedName: "kansas city royals", oddsNames: ["Kansas City Royals"], savantCode: "KC" },
  { officialTeamId: "108", officialTeamName: "Los Angeles Angels", normalizedName: "los angeles angels", oddsNames: ["Los Angeles Angels", "LA Angels"], savantCode: "LAA" },
  { officialTeamId: "119", officialTeamName: "Los Angeles Dodgers", normalizedName: "los angeles dodgers", oddsNames: ["Los Angeles Dodgers", "LA Dodgers"], savantCode: "LAD" },
  { officialTeamId: "146", officialTeamName: "Miami Marlins", normalizedName: "miami marlins", oddsNames: ["Miami Marlins"], savantCode: "MIA" },
  { officialTeamId: "158", officialTeamName: "Milwaukee Brewers", normalizedName: "milwaukee brewers", oddsNames: ["Milwaukee Brewers"], savantCode: "MIL" },
  { officialTeamId: "142", officialTeamName: "Minnesota Twins", normalizedName: "minnesota twins", oddsNames: ["Minnesota Twins"], savantCode: "MIN" },
  { officialTeamId: "121", officialTeamName: "New York Mets", normalizedName: "new york mets", oddsNames: ["New York Mets", "NY Mets"], savantCode: "NYM" },
  { officialTeamId: "147", officialTeamName: "New York Yankees", normalizedName: "new york yankees", oddsNames: ["New York Yankees", "NY Yankees"], savantCode: "NYY" },
  { officialTeamId: "133", officialTeamName: "Athletics", normalizedName: "athletics", oddsNames: ["Athletics", "Oakland Athletics", "Sacramento Athletics", "A's"], savantCode: "ATH" },
  { officialTeamId: "143", officialTeamName: "Philadelphia Phillies", normalizedName: "philadelphia phillies", oddsNames: ["Philadelphia Phillies"], savantCode: "PHI" },
  { officialTeamId: "134", officialTeamName: "Pittsburgh Pirates", normalizedName: "pittsburgh pirates", oddsNames: ["Pittsburgh Pirates"], savantCode: "PIT" },
  { officialTeamId: "135", officialTeamName: "San Diego Padres", normalizedName: "san diego padres", oddsNames: ["San Diego Padres"], savantCode: "SD" },
  { officialTeamId: "137", officialTeamName: "San Francisco Giants", normalizedName: "san francisco giants", oddsNames: ["San Francisco Giants"], savantCode: "SF" },
  { officialTeamId: "136", officialTeamName: "Seattle Mariners", normalizedName: "seattle mariners", oddsNames: ["Seattle Mariners"], savantCode: "SEA" },
  { officialTeamId: "138", officialTeamName: "St. Louis Cardinals", normalizedName: "st louis cardinals", oddsNames: ["St. Louis Cardinals", "St Louis Cardinals"], savantCode: "STL" },
  { officialTeamId: "139", officialTeamName: "Tampa Bay Rays", normalizedName: "tampa bay rays", oddsNames: ["Tampa Bay Rays"], savantCode: "TB" },
  { officialTeamId: "140", officialTeamName: "Texas Rangers", normalizedName: "texas rangers", oddsNames: ["Texas Rangers"], savantCode: "TEX" },
  { officialTeamId: "141", officialTeamName: "Toronto Blue Jays", normalizedName: "toronto blue jays", oddsNames: ["Toronto Blue Jays"], savantCode: "TOR" },
  { officialTeamId: "120", officialTeamName: "Washington Nationals", normalizedName: "washington nationals", oddsNames: ["Washington Nationals"], savantCode: "WSH" },
];

const aliasMap = new Map<string, MlbTeamIdentity>();
const idMap = new Map<string, MlbTeamIdentity>();
const savantMap = new Map<string, MlbTeamIdentity>();

function basicNormalize(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[’]/g, "'")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

MLB_TEAM_IDENTITIES.forEach((team) => {
  idMap.set(team.officialTeamId, team);
  savantMap.set(team.savantCode, team);
  [team.officialTeamName, team.normalizedName, ...team.oddsNames].forEach((name) => {
    aliasMap.set(basicNormalize(name), team);
  });
});

export function normalizeMlbTeamName(value: string) {
  const normalized = basicNormalize(value);
  return aliasMap.get(normalized)?.normalizedName ?? normalized;
}

export function getMlbTeamIdentityByName(value: string) {
  return aliasMap.get(basicNormalize(value));
}

export function getMlbTeamIdentityById(value: string | number | undefined) {
  if (value === undefined || value === null) return undefined;
  return idMap.get(String(value));
}

export function getMlbTeamIdentityBySavantCode(value: string | undefined) {
  if (!value) return undefined;
  return savantMap.get(value.trim().toUpperCase());
}
