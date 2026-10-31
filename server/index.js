import 'dotenv/config'; import express from 'express'; import cors from 'cors'; import mongoose from 'mongoose';
import { Team, Player, Match, Bookmark, Honour } from './models.js';
import { predict } from './predictor.js';
import { extra } from './extra.js';
import { startLiveSync } from './services/live.js';
import { SERIES, seriesQuery, eventQuery } from './series.js';
const app = express(); app.use(cors(), express.json()); app.use(extra);
const wrap = f => (q, r) => f(q, r).catch(e => { console.error(e); r.status(500).json({ error: e.message || 'Server error' }); });
const DONE = { $nin: ['live', 'upcoming'] };
const desc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const iso = (n = 0) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const filt = (code, q) => { const f = { $or: [{ teamA: code }, { teamB: code }], status: DONE };
  if (q.season && q.season !== 'all') f.season = q.season; if (q.format) f.format = q.format; return f; };

app.get('/api/health', wrap(async (_q, r) => r.json({ ok: true, matches: await Match.countDocuments(), players: await Player.countDocuments() })));
app.get('/api/teams', wrap(async (q, r) => r.json(await Team.find({ domestic: q.query.domestic === 'true' }).lean())));
app.get('/api/seasons', wrap(async (_q, r) => r.json((await Match.distinct('season', { status: DONE })).sort().reverse())));

app.get('/api/teams/:code/seasons', wrap(async (q, r) => {
  const ms = await Match.find(filt(q.params.code, { format: q.query.format }), 'season date').lean(), last = {};
  ms.forEach(m => { if (!last[m.season] || m.date > last[m.season]) last[m.season] = m.date; });
  r.json(Object.keys(last).sort((a, b) => (last[a] < last[b] ? 1 : -1)));
}));

// Squad = players from the lineups of this team's matches. If the season has no lineups (API-only fixtures),
// fall back to the team's latest matches that do, and say so via `basis`.
const squadFrom = async (ms, code, limit) => {
  const P = {};
  for (const m of ms) for (const x of (m.teamA === code ? m.xiA : m.xiB) || []) {
    const p = (P[x.name] ??= { name: x.name, matches: 0, runs: 0, balls: 0, outs: 0, wkts: 0, conc: 0, ob: 0, imp: 0 });
    p.matches++; p.runs += x.runs || 0; p.balls += x.balls || 0; if (x.out) p.outs++; p.wkts += x.wk || 0; p.conc += x.conc || 0; p.ob += x.ob || 0; p.imp += x.impact || 0; }
  const docs = await Player.find({ name: { $in: Object.keys(P) } }, 'name role slot keeper captain jersey').lean(), by = {}; docs.forEach(d => { by[d.name] ??= d; });
  return Object.values(P).map(p => { const d = by[p.name], sh = p.ob / ((p.ob + p.balls) || 1);
    return { name: p.name, id: d?._id ?? null, jersey: d?.jersey ?? null, slot: d?.slot ?? null, keeper: !!d?.keeper, captain: !!d?.captain,
      role: d?.role || (sh > 0.6 ? 'Bowler' : sh > 0.25 ? 'All-rounder' : 'Batter'), matches: p.matches, runs: p.runs, wkts: p.wkts,
      avg: p.outs ? +(p.runs / p.outs).toFixed(1) : p.runs || null, sr: p.balls ? +(p.runs / p.balls * 100).toFixed(1) : null,
      econ: p.ob ? +(p.conc / (p.ob / 6)).toFixed(2) : null, impact: Math.round(Math.min(99, p.imp / p.matches * 14)) }; })
    .sort((a, b) => b.matches - a.matches || b.runs - a.runs).slice(0, limit);
};
app.get('/api/teams/:code/squad', wrap(async (q, r) => {
  const code = q.params.code, all = !q.query.season || q.query.season === 'all', P = 'teamA teamB xiA xiB date season';
  let ms = await Match.find(filt(code, q.query), P).lean(), basis = null;
  if (!ms.some(m => (m.teamA === code ? m.xiA : m.xiB)?.length)) {
    const f = { $and: [{ $or: [{ teamA: code }, { teamB: code }] }, { $or: [{ 'xiA.0': { $exists: true } }, { 'xiB.0': { $exists: true } }] }], status: DONE };
    if (q.query.format) f.format = q.query.format;
    ms = await Match.find(f, P).sort({ date: -1 }).limit(8).lean();
    basis = ms.length ? { season: ms[0].season, matches: ms.length, last: ms[0].date } : null;
  }
  r.json({ players: await squadFrom(ms, code, basis ? 16 : all ? 24 : 30), basis });
}));

app.get('/api/teams/:code', wrap(async (q, r) => {
  const t = await Team.findOne({ code: q.params.code }).lean(); if (!t) return r.status(404).json({ error: 'Team not found' });
  const ms = (await Match.find(filt(t.code, q.query), '-xiA -xiB').lean()).sort(desc); const won = ms.filter(m => m.winner === t.code).length;
  const tossWon = ms.filter(m => m.tossWinner === t.code), venues = {}, decisions = { bat: 0, field: 0 };
  ms.forEach(m => { const v = (venues[m.venue] ??= { p: 0, w: 0 }); v.p++; if (m.winner === t.code) v.w++; });
  tossWon.forEach(m => { if (m.tossDecision) decisions[m.tossDecision]++; });
  r.json({ team: t, record: { played: ms.length, won, lost: ms.filter(m => m.winner && m.winner !== t.code).length },
    recent: ms.slice(0, 5).map(m => (!m.winner ? 'NR' : m.winner === t.code ? 'W' : 'L')),
    toss: { won: tossWon.length, convertedToWin: tossWon.filter(m => m.winner === t.code).length, decisions }, venues });
}));
app.get('/api/teams/:code/players', wrap(async (q, r) => {
  const nat = ['IND', 'INDW'].includes(q.params.code);
  const f = nat ? { national: q.params.code, natActive: true } : { team: q.params.code, active: true };
  r.json(await Player.find(f).sort({ impact: -1 }).limit(24).lean());
}));
app.get('/api/players/:id', wrap(async (q, r) => r.json(await Player.findById(q.params.id).lean())));

// Year-wise rows: one entry per match the player appeared in (the client groups them by season and tab).
app.get('/api/players/:id/seasons', wrap(async (q, r) => {
  const p = await Player.findById(q.params.id, 'name').lean(); if (!p) return r.json([]);
  const pick = f => ({ $filter: { input: { $ifNull: [f, []] }, cond: { $eq: ['$$this.name', p.name] } } });
  const rows = await Match.aggregate([
    { $match: { status: DONE, $or: [{ 'xiA.name': p.name }, { 'xiB.name': p.name }] } },
    { $project: { season: 1, date: 1, league: 1, format: 1, row: { $concatArrays: [pick('$xiA'), pick('$xiB')] } } },
    { $unwind: '$row' }]);
  r.json(rows.map(m => ({ season: m.season, date: m.date, tab: m.league === 'IPL' || m.league === 'WPL' ? 'League' : m.league === 'International' ? m.format : 'Domestic',
    runs: m.row.runs || 0, balls: m.row.balls || 0, out: !!m.row.out, wk: m.row.wk || 0, conc: m.row.conc || 0, ob: m.row.ob || 0 })));
}));

app.get('/api/teams/:code/matches', wrap(async (q, r) => r.json(await Match.find(filt(q.params.code, q.query)).sort({ date: -1 }).limit(30).lean())));
// A team cannot play two internationals in one day. If the live feed produced such clashes, keep the dataset
// records and drop the unverifiable live-feed ones.
const sane = ms => { const by = {}; ms.forEach(m => (by[m.date] ??= []).push(m));
  return Object.values(by).flatMap(g => (g.length === 1 ? g : g.filter(m => m.source !== 'live'))); };
app.get('/api/international/:code', wrap(async (q, r) => {
  const c = q.params.code;
  const ms = sane(await Match.find({ league: 'International', $or: [{ teamA: c }, { teamB: c }], status: DONE, date: { $lte: iso() } }, 'date format winner teamA teamB margin source').lean()).sort(desc);
  const byFormat = {};
  for (const m of ms) { const f = (byFormat[m.format] ??= { played: 0, won: 0, lost: 0, other: 0 }); f.played++; m.winner === c ? f.won++ : m.winner ? f.lost++ : f.other++; }
  r.json({ code: c, byFormat, recent: ms.slice(0, 8) });
}));

// Domestic: tournaments by season, and the matches of one of them.
app.get('/api/domestic/series', wrap(async (_q, r) => {
  const rows = await Match.aggregate([{ $match: { league: 'Domestic', event: { $nin: [null, ''] } } },
    { $group: { _id: { event: '$event', season: '$season' }, matches: { $sum: 1 }, last: { $max: '$date' } } }]);
  r.json(rows.map(x => ({ event: x._id.event, season: x._id.season, matches: x.matches, last: x.last })).sort((a, b) => (a.last < b.last ? 1 : -1)));
}));
app.get('/api/domestic/matches', wrap(async (q, r) =>
  r.json((await Match.find({ league: 'Domestic', event: q.query.event, season: q.query.season }, '-xiA -xiB').lean()).sort(desc).slice(0, 300))));

app.get('/api/h2h/:a/:b', wrap(async (q, r) => {
  const { a, b } = q.params; const ms = await Match.find({ $or: [{ teamA: a, teamB: b }, { teamA: b, teamB: a }], status: DONE }, 'winner').lean();
  r.json({ played: ms.length, [a]: ms.filter(m => m.winner === a).length, [b]: ms.filter(m => m.winner === b).length });
}));
app.post('/api/predict', wrap(async (q, r) => r.json(predict(q.body))));

// Live now (confirmed in the last 3 hours) plus fixtures in the next 5 days. Never finished matches.
app.get('/api/live', wrap(async (_q, r) => {
  const ms = await Match.find({ source: 'live', $or: [
    { status: 'live', seenAt: { $gte: new Date(Date.now() - 3 * 36e5) } },
    { status: 'upcoming', date: { $gte: iso(0), $lte: iso(5) } }] }, '-xiA -xiB').lean();
  r.json(ms.sort((a, b) => (a.status === b.status ? (a.date < b.date ? -1 : 1) : a.status === 'live' ? -1 : 1)).slice(0, 80));
}));
app.post('/api/bookmarks', wrap(async (q, r) => r.json(await Bookmark.create(q.body))));
app.get('/api/bookmarks/:userId', wrap(async (q, r) => r.json(await Bookmark.find({ userId: q.params.userId }))));

app.get('/api/domestic/catalog', wrap(async (_q, r) => {
  const groups = {};
  for (const s of SERIES) (groups[s.group] ??= []).push({ id: s.id, label: s.label, has: !!(await Match.exists(seriesQuery(s))) });
  r.json(Object.entries(groups).map(([group, items]) => ({ group, items })));
}));
// Teams in the most recent season of the chosen tournament.
// Teams of the tournament's latest season, plus that tournament's own champions.
app.get('/api/domestic/teams', wrap(async (q, r) => {
  const s = SERIES.find(x => x.id === q.query.series); if (!s) return r.json({ teams: [], honours: [] });
  const hs = (await Honour.find(eventQuery(s)).lean()).sort((a, b) => b.year - a.year || (a.season < b.season ? 1 : -1));
  const last = await Match.findOne(seriesQuery(s), 'season date').sort({ date: -1 }).lean();
  const ms = last ? await Match.find({ $and: [seriesQuery(s), { season: last.season }] }, 'teamA teamB').lean() : [];
  const codes = [...new Set([...ms.flatMap(m => [m.teamA, m.teamB]), ...hs.map(h => h.code)])];
  const docs = await Team.find({ code: { $in: codes } }).lean(), nameOf = Object.fromEntries(docs.map(t => [t.code, t.name]));
  const inSeason = new Set(ms.flatMap(m => [m.teamA, m.teamB])), years = {};
  hs.forEach(h => (years[h.code] ??= []).push(h.year));
  r.json({ honours: hs.slice(0, 8).map(h => ({ season: h.season, code: h.code, name: nameOf[h.code] || h.code })),
    teams: docs.filter(t => inSeason.has(t.code)).sort((a, b) => a.name.localeCompare(b.name))
      .map(t => ({ ...t, years: (years[t.code] || []).sort(), reigning: hs[0]?.code === t.code })) });
}));
app.get('/api/domestic/upcoming', wrap(async (q, r) => {
  const s = SERIES.find(x => x.id === q.query.series); if (!s) return r.json([]);
  r.json(await Match.find({ $and: [seriesQuery(s), { status: 'upcoming', date: { $gte: iso(0) } }] }, 'key date teamA teamB nameA nameB venue stage').sort({ date: 1 }).limit(40).lean());
}));

app.use((err, _q, r, _n) => r.status(500).json({ error: err.message || 'Server error' }));
await mongoose.connect(process.env.MONGO_URI);
app.listen(process.env.PORT || 5000, () => { console.log('Howzat! API is up'); startLiveSync(); });