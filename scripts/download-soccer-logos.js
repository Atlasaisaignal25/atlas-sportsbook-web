const fs = require("fs");
const path = require("path");
const https = require("https");

const OUTPUT_DIR = path.join(__dirname, "../public/team-logos/soccer");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const LEAGUES = [
  "English Premier League",
  "Spanish La Liga",
  "Italian Serie A",
  "German Bundesliga",
  "French Ligue 1",
  "UEFA Champions League",
  "UEFA Europa League",
  "UEFA Europa Conference League",
  "American Major League Soccer",
  "Mexican Primera League",
];

function sanitizeFileName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let rawData = "";

        res.on("data", (chunk) => {
          rawData += chunk;
        });

        res.on("end", () => {
          try {
            resolve(JSON.parse(rawData));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function downloadImage(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(
            new Error(`Failed to download ${url} - Status ${response.statusCode}`)
          );
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close(resolve);
        });
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => reject(err));
      });
  });
}

async function run() {
  try {
    const downloaded = new Set();

    for (const leagueName of LEAGUES) {
      console.log(`\nFetching league: ${leagueName}`);

      const searchUrl = `https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=${encodeURIComponent(
        leagueName
      )}`;

      const parsed = await fetchJson(searchUrl);
      const teams = parsed.teams || [];

      console.log(`Found ${teams.length} teams in ${leagueName}`);

      for (const team of teams) {
        const teamName = team.strTeam;
        const badgeUrl = team.strBadge || team.strTeamBadge;

        if (!teamName || !badgeUrl) {
          console.log(`Skipping ${teamName || "unknown"} - no badge`);
          continue;
        }

        const fileName = `${sanitizeFileName(teamName)}.png`;

        if (downloaded.has(fileName)) {
          continue;
        }

        downloaded.add(fileName);

        const filePath = path.join(OUTPUT_DIR, fileName);

        console.log(`Downloading ${teamName} -> ${fileName}`);
        await downloadImage(badgeUrl, filePath);
      }
    }

    console.log("✅ Done. Soccer logos downloaded into public/team-logos/soccer");
  } catch (error) {
    console.error("Script failed:", error);
  }
}

run();