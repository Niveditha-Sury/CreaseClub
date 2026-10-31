<div align="center">

# 🏏 Crease Club

**Cricket analytics for IPL, WPL, India internationals and Indian domestic cricket.**
Playing XIs, year-wise player stats, an Elo match predictor, and live and upcoming fixtures.

![Stack](https://img.shields.io/badge/stack-MERN-1F5D3A) ![License](https://img.shields.io/badge/license-MIT-F4B400)

</div>

## Features
- Animated intro with a cricket fact for each day.
- **IPL and WPL**: franchise cards with a men's/women's filter and trophy badges.
- **India internationals**: Test, ODI and T20I records for men and women, with a per-format team page.
- **Domestic**: pick a tournament and season (Syed Mushtaq Ali, Vijay Hazare, Ranji, Duleep) to see its matches.
- **Live and upcoming**: matches in play now and fixtures in the next 5 days, with a one-click predictor.
- **Team page**: season filter, record, venue form, squad built from the actual lineups, match lookback with runs, wickets and impact.
- **Player card**: role-aware stats (batting, bowling or both), position tags, and a year dropdown for year-wise stats.
- **Crystal Ball**: win probability from Elo, form, toss and venue.

## Architecture
```
client/  React + Vite + Tailwind + SCSS  ->  GitHub Pages
server/  Express API + importers + live sync  ->  Node host (Render, Railway, Fly)
MongoDB Atlas
```

## Local development
```bash
cd server && cp .env.example .env     # set MONGO_URI (+ optional CRICKETDATA_KEY)
npm install
npm run update:data                   # downloads Cricsheet data and imports it (Windows)
npm run dev                           # http://localhost:5000

cd ../client && npm install && npm run dev   # http://localhost:5173
```
On macOS or Linux, download the Cricsheet zips into `data/` manually and run `npm run import:all`.

## Deploy
1. **Database**: create a free MongoDB Atlas cluster. Under Network Access, allow `0.0.0.0/0` (needed for the host and for GitHub Actions). Copy the connection string.
2. **API**: create a Web Service on [Render](https://render.com) from this repo. Root directory `server`, build command `npm install`, start command `npm start`. Add environment variables `MONGO_URI`, `CRICKETDATA_KEY` and optionally `ELITESPORT_BASE_URL` and `ELITESPORT_KEY`. Note the service URL.
3. **Site**: in the repo go to Settings, Pages, Source, and choose **GitHub Actions**. Then under Settings, Secrets and variables, Actions:
   - Variables: add `API_URL` set to your API's URL (no trailing slash).
   - Secrets: add `MONGO_URI`.
4. Push to `main`. The **Deploy site** workflow publishes the site at `https://<you>.github.io/<repo>/`. The **Refresh data** workflow re-imports Cricsheet data every day at 03:00 UTC (you can also run it manually from the Actions tab).

Free hosting tiers usually put the API to sleep when idle, so the first request after a pause is slow and live-score polling stops while it sleeps. Use an always-on plan if you need continuous live data.

## Data
Match data comes from [Cricsheet](https://cricsheet.org) (IPL, WPL, India men's and women's Test, ODI and T20I, and Syed Mushtaq Ali Trophy). Live fixtures and results come from [CricketData.org](https://cricketdata.org) and cover whichever tournaments that API carries. Please check each provider's licence and credit them. API-sourced matches have results and scores but no lineups.

`server/roles.json` (captains and keepers) and `server/champions.json` (tournament winners) are small files you maintain.

## Useful commands
| Command (in `server/`) | Purpose |
|---|---|
| `npm run import:all` | Rebuild matches, players and teams from `data/` |
| `npm run update:data` | Download fresh Cricsheet zips, then import |
| `npm run audit` | Counts and duplicate check |
| `npm run finals` | Show Syed Mushtaq Ali finals found in the data |
| `npm run probe` | Check which domestic tournaments the live API carries |
| `npm run reset:live` | Remove API-sourced matches so they refill cleanly |

## Known limitations
- Jersey numbers are generated; the data has none.
- Year-wise figures are built from match totals, so Test innings are combined per match.
- Ranji Trophy and Vijay Hazare ball-by-ball data is not published by Cricsheet, so those tournaments only have fixtures and results from the live API, and no lineups.
- The predictor is a transparent heuristic, not a trained model.

## License
MIT. Not affiliated with the BCCI, IPL, WPL or ICC.