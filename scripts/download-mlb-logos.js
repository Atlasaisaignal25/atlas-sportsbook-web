const fs = require("fs");
const path = require("path");
const https = require("https");

const OUTPUT_DIR = path.join(__dirname, "../public/team-logos/mlb");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const API_URL =
  "https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=MLB";

function sanitizeFileName(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function downloadImage(url, filePath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filePath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(`Error downloading ${url}`);
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

https.get(API_URL, (res) => {
  let data = "";

  res.on("data", (chunk) => (data += chunk));

  res.on("end", async () => {
    const json = JSON.parse(data);
    const teams = json.teams || [];

    console.log(`Found ${teams.length} MLB teams`);

    for (const team of teams) {
      const name = team.strTeam;
      const logoUrl = team.strBadge || team.strTeamBadge;

      if (!name || !logoUrl) continue;

      const fileName = sanitizeFileName(name) + ".png";
      const filePath = path.join(OUTPUT_DIR, fileName);

      console.log(`Downloading ${name}`);
      await downloadImage(logoUrl, filePath);
    }

    console.log("✅ MLB logos descargados");
  });
});