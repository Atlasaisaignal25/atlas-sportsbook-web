const fs = require("fs");
const path = require("path");
const https = require("https");

const OUTPUT_DIR = path.join(__dirname, "../public/team-logos/nhl");

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const API_URL =
  "https://www.thesportsdb.com/api/v1/json/3/search_all_teams.php?l=NHL";

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

https
  .get(API_URL, (res) => {
    let rawData = "";

    res.on("data", (chunk) => {
      rawData += chunk;
    });

    res.on("end", async () => {
      try {
        const parsed = JSON.parse(rawData);
        const teams = parsed.teams || [];

        console.log(`Found ${teams.length} NHL teams`);

        for (const team of teams) {
          const teamName = team.strTeam;
          const badgeUrl = team.strBadge || team.strTeamBadge;

          if (!teamName || !badgeUrl) {
            console.log(`Skipping ${teamName || "unknown"} - no badge`);
            continue;
          }

          const fileName = `${sanitizeFileName(teamName)}.png`;
          const filePath = path.join(OUTPUT_DIR, fileName);

          console.log(`Downloading ${teamName} -> ${fileName}`);
          await downloadImage(badgeUrl, filePath);
        }

        console.log("✅ Done. NHL logos downloaded into public/team-logos/nhl");
      } catch (error) {
        console.error("Error parsing API response:", error);
      }
    });
  })
  .on("error", (error) => {
    console.error("Request failed:", error);
  });