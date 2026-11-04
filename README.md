<div align="center">

# 🏏 Crease Club

### Cricket analytics for the IPL, WPL, India internationals and Indian domestic cricket

Playing XIs · year-wise player stats · Elo win predictor · live and upcoming fixtures

[![Live Demo](https://img.shields.io/badge/LIVE%20DEMO-open-b8f26b?style=for-the-badge&logo=github&logoColor=black)](https://<you>.github.io/<repo>/)
[![Deploy](https://github.com/<you>/<repo>/actions/workflows/deploy.yml/badge.svg)](https://github.com/<you>/<repo>/actions/workflows/deploy.yml)
[![Data refresh](https://github.com/<you>/<repo>/actions/workflows/data-refresh.yml/badge.svg)](https://github.com/<you>/<repo>/actions/workflows/data-refresh.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-f4b400)](LICENSE)

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-3-06B6D4?logo=tailwindcss&logoColor=white)
![Node](https://img.shields.io/badge/Node.js-20-339933?logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-2088FF?logo=githubactions&logoColor=white)

<!-- Add a 15-20 second screen recording here: docs/demo.gif -->
<img src="docs/demo.gif" alt="Crease Club demo" width="780">

</div>

> The free-tier API sleeps when idle, so the **first load of the live demo can take up to a minute**. The GIF above shows the full flow.

## ✨ What it does
| | |
|---|---|
| 🔎 **Player search and pages** | Search any player from the nav bar. Career stats across formats, calendar-year tables, and a best-knock breakdown with strengths and weaknesses derived from the ball-by-ball record |
| 🏆 **IPL and WPL** | Franchise cards with trophy badges and a men's/women's filter |
| 🌏 **India internationals** | Test, ODI and T20I records for men and women, with per-format team pages |
| 🏟️ **Domestic cricket** | Pick a tournament (Ranji, Vijay Hazare, SMAT, women's trophies and more) to see its teams, per-tournament champions and upcoming fixtures |
| 🗂️ **Match summaries** | Every result with venue and key performers, by competition (IPL, WPL, India men, India women) and year |
| 📡 **Live and upcoming** | Matches in play and fixtures for the next 5 days, checked against two feeds where possible |
| ⭐ **Bookmarks and favourites** | Save players and teams (stored per browser, no login) |
| 🔮 **Crystal Ball** | Win probability from Elo, recent form, toss and venue |
| 📱 **Responsive** | Nav bar collapses into a hamburger menu on small screens |

## 🧱 Architecture

```mermaid
flowchart LR
  CS[Cricsheet ball-by-ball JSON] --> IMP[Import pipeline]
  CD[CricketData.org] --> SYNC[Live and series sync]
  ES[EliteSport API] --> VER[Verification and gap-filling]
  IMP --> DB[(MongoDB Atlas)]
  SYNC --> DB
  VER --> DB
  DB --> EXP[Express API]
  EXP --> UI[React app]
  GH[GitHub Actions] -- twice daily --> IMP
  GH -- on push --> UI
```

| Layer | Tech | Hosted on |
|---|---|---|
| Frontend | React, Vite, Tailwind CSS, SCSS | GitHub Pages |
| API and sync jobs | Node.js, Express, Mongoose | Render (any Node host works) |
| Database | MongoDB | Atlas free tier |
| CI/CD | GitHub Actions | Deploys on push; refreshes data twice a day |

## 🛠️ Engineering highlights
- **Data pipeline:** parses thousands of ball-by-ball match files into lineups, per-match impact scores and year-wise player stats. It classifies each match (IPL, WPL, India international, domestic) and rebuilds teams, players and champions in one idempotent run.
- **Two sources, no duplicates:** every match gets a stable key (`league | format | date | teams`) with a unique index, so the dataset and the live API can both write the same match without double-counting.
- **Source trust rules:** finished internationals come only from the dataset, because the live feed produced unverifiable rows. Live data drives live and upcoming fixtures only.
- **Quota-aware polling:** the sync reads the API's hit counter and backs off before the daily limit, and it polls faster only while a match is live.
- **Transparent predictor:** Elo (K = 24) plus form, toss and venue adjustments. It is a heuristic, not a trained ML model, and it is documented as such.
- **Per-tournament champions:** honours are derived from finals found in the data, with a small JSON override for tournaments the dataset doesn't cover.

## 📊 By the numbers
`[N]` matches · `[N]` players · `[N]` tournaments · data refreshed twice daily

## 🚀 Run locally
Requires Node 18+ and a MongoDB database (local or Atlas).
```bash
git clone https://github.com/<you>/<repo>.git && cd <repo>

# API
cd server && cp .env.example .env     # set MONGO_URI (and CRICKETDATA_KEY if you have one)
npm install
npm run update:data                   # download Cricsheet data and import it (Windows/PowerShell)
npm run dev                           # http://localhost:5000

# Web (new terminal)
cd client && npm install && npm run dev   # http://localhost:5173
```
On macOS or Linux, download the Cricsheet zips into `data/` yourself and run `npm run import:all`.

<details>
<summary><b>Environment variables</b></summary>

| Variable | Where | Purpose |
|---|---|---|
| `MONGO_URI` | server | MongoDB connection string |
| `CRICKETDATA_KEY` | server | CricketData.org key (live and upcoming fixtures, domestic series). Free plan: 100 calls a day |
| `ELITESPORT_KEY`, `ELITESPORT_BASE_URL` | server | EliteSport key and host (second feed). Free plan: 500 calls in total |
| `ELITE_DAILY` | server | Max EliteSport calls per day (default 3) |
| `VITE_API_URL` | client build | Public URL of the API (set from the repo variable `API_URL`) |
| `VITE_BASE` | client build | Base path for GitHub Pages (set automatically in CI) |
</details>

<details>
<summary><b>Useful commands (in <code>server/</code>)</b></summary>

| Command | Purpose |
|---|---|
| `npm run import:all` | Rebuild matches, players, teams and honours from `data/` |
| `npm run update:data` | Download fresh Cricsheet zips, then import |
| `npm run audit` | Counts and duplicate check |
| `npm run probe` | Check which tournaments CricketData carries |
| `npm run probe:elite` | Save raw EliteSport responses to `server/samples/` (3 calls) |
| `npm run reset:live` | Remove API-sourced matches so they refill cleanly |
| `GET /api/quota` | Current API usage against both budgets |
</details>

## ☁️ Deploy
1. **Database:** create a free MongoDB Atlas cluster and allow network access from your host and from GitHub Actions.
2. **API:** create a Web Service on Render. Root `server`, build `npm install`, start `npm start`. Add `MONGO_URI` and optionally the two API keys.
3. **Site:** in the repo, set Settings → Pages → Source to **GitHub Actions**. Add the variable `API_URL` (your API's URL, no trailing slash) and the secret `MONGO_URI`.
4. Push to `main`. **Deploy site** publishes the app, and **Refresh data** re-imports Cricsheet data twice a day.

## 🗺️ Roadmap
- [ ] Batter-vs-bowler matchups from ball-by-ball data
- [ ] A trained win-probability model, back-tested against past matches
- [ ] Official career totals for veteran players whose early matches predate the dataset
- [ ] Lineups and player stats for domestic tournaments the dataset doesn't publish
- [ ] Auth, so bookmarks follow you across devices

## ⚠️ Known limitations
- The ball-by-ball dataset only covers part of older careers, so veterans' totals are lower than official figures. The player page states the years covered.
- Strengths and weaknesses are rule-based summaries of the ball-by-ball record. The data has no shot direction or bowler type.
- Jersey numbers are generated, because the data has none.
- Tournaments such as the Ranji Trophy have fixtures and results only when a live feed carries them, with no lineups.
- New results can lag by up to a day. Bookmarks are stored per browser, not per account.

## 🙏 Credits
Ball-by-ball data from [Cricsheet](https://cricsheet.org). Live fixtures from [CricketData.org](https://cricketdata.org) and [EliteSport](https://elitesportapi.com). Please check each provider's licence before reusing their data.

## 📄 License
MIT. Not affiliated with the BCCI, IPL, WPL or ICC

<div align="center">

Built by **Niveditha Sury** · [LinkedIn](https://www.linkedin.com/in/<your-profile>) · [GitHub](https://github.com/<you>)

</div>