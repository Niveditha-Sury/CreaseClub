import 'dotenv/config'; import express from 'express'; import cors from 'cors'; import mongoose from 'mongoose';
import { Team, Player, Match, Bookmark, Honour } from './models.js';
import { predict } from './predictor.js';
import { extra } from './extra.js';
import { startLiveSync } from './services/live.js';
import { SERIES, seriesQuery, eventQuery } from './series.js';
import { status as quotaStatus } from './services/quota.js';
const app = express(); app.use(cors(), express.json()); app.use(extra);
const wrap = f => (q, r) => f(q, r).catch(e => { console.error(e); r.status(500).json({ error: e.message || 'Server error' }); });
const DONE = { $nin: ['live', 'upcoming', 'pending'] };
const desc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
const iso = (n = 0) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
const filt = (code, q) => { const f = { $or: [{ teamA: code }, { teamB: code }], status: DONE };
  if (q.season && q.season !== 'all') f.season = q.season; if (q.format) f.format = q.format; return f; };

app.get('/api/health', wrap(async (_q, r) => r.json({ ok: true, v: 4, matches: await Match.countDocuments(), players: await Player.countDocuments() })));
app.get('/api/quota', wrap(async (_q, r) => r.json(await quotaStatus())));
app.get('/api/teams', wrap(async (q, r) => r.json(await Team.find({ domestic: q.query.domestic === 'true' }).lean())));
app.get('/api/seasons', wrap(async (_q, r) => r.json((await Match.distinct('season', { status: DONE })).sort().reverse())));

app.get('/api/teams/:code/seasons', wrap(async (q, r) => {
  const ms = await Match.find(filt(q.params.code, { format: q.query.format }), 'season date').lean(), last = {};
  ms.forEach(m => { if (!last[m.season] || m.date > last[m.season]) last[m.season] = m.date; });
  r.json(Object.keys(last).sort((a, b) => (last[a] < last[b] ? 1 : -1)));
}));

// Career totals up to (and including) a calendar year, summed from the player's year-wise records.
const careerTo = (years, tabs, through) => {
  const A = { m: 0, runs: 0, balls: 0, outs: 0, inns: 0, wkts: 0, bRuns: 0, bBalls: 0 };
  for (const [y, byTab] of Object.entries(years || {})) if (+y <= through) for (const k of tabs) { const s = byTab[k]; if (!s) continue;
    A.m += s.m || 0; A.runs += s.bat?.runs || 0; A.balls += s.bat?.balls || 0; A.outs += s.bat?.outs || 0; A.inns += s.bat?.inns || 0;
    A.wkts += s.bowl?.wkts || 0; A.bRuns += s.bowl?.runs || 0; A.bBalls += s.bowl?.balls || 0; }
  return { m: A.m, runs: A.runs, wkts: A.wkts, avg: A.balls ? +(A.runs / (A.outs || 1)).toFixed(1) : null,
    sr: A.balls ? +(A.runs / A.balls * 100).toFixed(1) : null, econ: A.bBalls ? +(A.bRuns / (A.bBalls / 6)).toFixed(2) : null };
};
const squadFrom = async (ms, code, limit, tabs, through) => {
  const P = {};
  for (const m of ms) for (const x of (m.teamA === code ? m.xiA : m.xiB) || []) {
    const p = (P[x.name] ??= { name: x.name, matches: 0, runs: 0, balls: 0, outs: 0, wkts: 0, conc: 0, ob: 0, imp: 0 });
    p.matches++; p.runs += x.runs || 0; p.balls += x.balls || 0; if (x.out) p.outs++; p.wkts += x.wk || 0; p.conc += x.conc || 0; p.ob += x.ob || 0; p.imp += x.impact || 0; }
  const docs = await Player.find({ name: { $in: Object.keys(P) } }, 'name role slot keeper captain jersey years').lean(), by = {}; docs.forEach(d => { by[d.name] ??= d; });
  return Object.values(P).map(p => { const d = by[p.name], sh = p.ob / ((p.ob + p.balls) || 1);
    return { name: p.name, id: d ? d.name : null, jersey: d?.jersey ?? null, slot: d?.slot ?? null, keeper: !!d?.keeper, captain: !!d?.captain,
      role: d?.role || (sh > 0.6 ? 'Bowler' : sh > 0.25 ? 'All-rounder' : 'Batter'), matches: p.matches, runs: p.runs, wkts: p.wkts,
      avg: p.outs ? +(p.runs / p.outs).toFixed(1) : p.runs || null, sr: p.balls ? +(p.runs / p.balls * 100).toFixed(1) : null,
      econ: p.ob ? +(p.conc / (p.ob / 6)).toFixed(2) : null, impact: Math.round(Math.min(99, p.imp / p.matches * 14)),
      career: d?.years ? careerTo(d.years, tabs, through) : null }; })
    .sort((a, b) => b.matches - a.matches || b.runs - a.runs).slice(0, limit);
};
app.get('/api/teams/:code/squad', wrap(async (q, r) => {
  const code = q.params.code, all = !q.query.season || q.query.season === 'all', P = 'teamA teamB xiA xiB date season';
  const t = await Team.findOne({ code }, 'league').lean();
  const tabs = t?.league === 'IPL' || t?.league === 'WPL' ? ['League'] : t?.league === 'Domestic' ? ['Domestic'] : q.query.format ? [q.query.format] : ['Test', 'ODI', 'T20'];
  const s0 = String(q.query.season || ''), through = all ? 9999 : +s0.slice(0, 4) + (s0.includes('/') ? 1 : 0);   // "2025/26" runs into 2026
  let ms = await Match.find(filt(code, q.query), P).lean(), basis = null;
  if (!ms.some(m => (m.teamA === code ? m.xiA : m.xiB)?.length)) {
    const f = { $and: [{ $or: [{ teamA: code }, { teamB: code }] }, { $or: [{ 'xiA.0': { $exists: true } }, { 'xiB.0': { $exists: true } }] }], status: DONE };
    if (q.query.format) f.format = q.query.format;
    ms = await Match.find(f, P).sort({ date: -1 }).limit(8).lean();
    basis = ms.length ? { season: ms[0].season, matches: ms.length, last: ms[0].date } : null;
  }
  r.json({ players: await squadFrom(ms, code, basis ? 16 : all ? 24 : 30, tabs, basis ? 9999 : through), basis });
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
app.get('/api/players/by-name/:name', wrap(async (q, r) => {
  const p = await Player.findOne({ name: q.params.name }).sort({ matches: -1 }).lean(); if (!p) return r.status(404).json({ error: 'Player not found' });
  const dom = await Match.findOne({ league: 'Domestic', source: 'dataset' }, 'date').sort({ date: -1 }).lean();
  r.json({ ...p, domThrough: dom?.date?.slice(0, 4) ?? null, teamDoc: (await Team.findOne({ code: p.team ?? p.national }).lean()) || null });
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


// Live = started, inside the play window for its format, and confirmed by a feed in the last 45 minutes.
// Upcoming = starts within the next 5 days. Finished matches never appear.
const PLAY_H = { ODI: 9.5, T20: 4.5 };
const playing = (m, now) => { const st = m.startAt && +new Date(m.startAt); if (!st || st > now) return false;
  const h = (now - st) / 36e5;
  if (m.format === 'Test') { const d = Math.floor(h / 24); return d < 5 && h - d * 24 <= 9; }     // day 1-5, nine hours of play each
  return h <= (PLAY_H[m.format] ?? 4.5); };
const LEAGUES = ['IPL', 'WPL', 'International', 'Domestic', 'India A'];
app.get('/api/live', wrap(async (_q, r) => {
  const now = Date.now(), ago = min => new Date(now - min * 6e4), by = (a, b) => +new Date(a.startAt) - +new Date(b.startAt);
  const live = (await Match.find({ source: 'live', league: { $in: LEAGUES }, status: 'live', seenAt: { $gte: ago(45) }, startAt: { $gte: new Date(now - 6 * 864e5), $lte: new Date(now) } }, '-xiA -xiB').lean())
    .filter(m => playing(m, now)).sort(by);
  const up = await Match.find({ source: 'live', league: { $in: LEAGUES }, status: 'upcoming', seenAt: { $gte: ago(36 * 60) }, startAt: { $gt: ago(15), $lte: new Date(now + 5 * 864e5) } }, '-xiA -xiB').sort({ startAt: 1 }).lean();
  r.json([...live, ...up].slice(0, 60));
}));

app.post('/api/bookmarks', wrap(async (q, r) => {
  const { userId, kind, refId } = q.body || {};
  if (!userId || !['player', 'team'].includes(kind) || !refId) return r.status(400).json({ error: 'Bad bookmark' });
  await Bookmark.updateOne({ userId, kind, refId }, { $setOnInsert: { userId, kind, refId } }, { upsert: true }); r.json({ ok: true });
}));
app.delete('/api/bookmarks', wrap(async (q, r) => { const { userId, kind, refId } = q.body || {}; await Bookmark.deleteOne({ userId, kind, refId }); r.json({ ok: true }); }));
app.get('/api/bookmarks/:userId', wrap(async (q, r) => {
  const bs = await Bookmark.find({ userId: q.params.userId }).lean(), by = k => bs.filter(b => b.kind === k).map(b => b.refId);
  const [players, teams] = await Promise.all([Player.find({ name: { $in: by('player') } }, 'name team role national').lean(), Team.find({ code: { $in: by('team') } }).lean()]);
  r.json({ players, teams });
}));

app.get('/api/domestic/catalog', wrap(async (_q, r) => {
  const groups = {};
  for (const s of SERIES) { let has = false;
    try { has = !!(await Match.exists(seriesQuery(s))); } catch (e) { console.error('catalog', s.id, e.message); }
    (groups[s.group] ??= []).push({ id: s.id, label: s.label, has }); }
  r.json(Object.entries(groups).map(([group, items]) => ({ group, items })));
}));

// Teams for a tournament: the newest season with a near-complete team list, plus teams with fixtures,
// plus the reigning champion. Tournaments with only a champions list show those teams.
app.get('/api/domestic/teams', wrap(async (q, r) => {
  const s = SERIES.find(x => x.id === q.query.series); if (!s) return r.json({ teams: [], honours: [], hasMatches: false });
  const hs = (await Honour.find(eventQuery(s)).lean()).sort((a, b) => b.year - a.year || (a.season < b.season ? 1 : -1));
  const rows = await Match.aggregate([{ $match: { $and: [seriesQuery(s), { status: DONE }] } },
    { $group: { _id: '$season', a: { $addToSet: '$teamA' }, b: { $addToSet: '$teamB' }, last: { $max: '$date' } } }]);
  const sets = rows.map(x => ({ last: x.last, codes: [...new Set([...x.a, ...x.b])] })).sort((a, b) => (a.last < b.last ? 1 : -1));
  const biggest = Math.max(0, ...sets.map(x => x.codes.length)), pick = sets.find(x => x.codes.length >= 0.6 * biggest);
  const upcoming = await Match.find({ $and: [seriesQuery(s), { status: { $in: ['upcoming', 'live'] }, date: { $gte: iso(-3) } }] }, 'teamA teamB').lean();
  const inSeason = new Set([...(pick?.codes ?? []), ...upcoming.flatMap(m => [m.teamA, m.teamB]), ...(hs[0] ? [hs[0].code] : [])]);
  const hasMatches = sets.length > 0 || upcoming.length > 0;
  if (!hasMatches) hs.forEach(h => inSeason.add(h.code));
  const docs = await Team.find({ code: { $in: [...new Set([...inSeason, ...hs.map(h => h.code)])] } }).lean();
  const nameOf = Object.fromEntries(docs.map(t => [t.code, t.name])), years = {};
  hs.forEach(h => (years[h.code] ??= []).push(h.year));
  r.json({ hasMatches, honours: hs.slice(0, 8).map(h => ({ season: h.season, code: h.code, name: nameOf[h.code] || h.code })),
    teams: docs.filter(t => inSeason.has(t.code)).sort((a, b) => a.name.localeCompare(b.name))
      .map(t => ({ ...t, years: (years[t.code] || []).sort(), reigning: hs[0]?.code === t.code })) });
}));
app.get('/api/domestic/upcoming', wrap(async (q, r) => {
  const s = SERIES.find(x => x.id === q.query.series); if (!s) return r.json([]);
  r.json(await Match.find({ $and: [seriesQuery(s), { status: 'upcoming', date: { $gte: iso(0) } }] }, 'key date teamA teamB nameA nameB venue stage').sort({ date: 1 }).limit(40).lean());
}));

const COMPS = {
  ipl: { league: 'IPL' }, wpl: { league: 'WPL' },
  'ind-men': { league: 'International', $or: [{ teamA: 'IND' }, { teamB: 'IND' }] },
  'ind-women': { league: 'International', $or: [{ teamA: 'INDW' }, { teamB: 'INDW' }] } };
app.get('/api/matches/years', wrap(async (q, r) => {
  const c = COMPS[q.query.comp]; if (!c) return r.json([]);
  r.json((await Match.aggregate([{ $match: { ...c, status: DONE } }, { $group: { _id: { $substrCP: ['$date', 0, 4] } } }, { $sort: { _id: -1 } }])).map(x => x._id));
}));
const topOf = (xi = []) => {
  const bat = xi.filter(x => x.balls > 0 || x.runs > 0).sort((a, b) => b.runs - a.runs || a.balls - b.balls)[0];
  const bowl = xi.filter(x => x.ob > 0).sort((a, b) => b.wk - a.wk || a.conc - b.conc)[0];
  return { bat: bat && { name: bat.name, runs: bat.runs, balls: bat.balls, out: bat.out }, bowl: bowl && { name: bowl.name, wk: bowl.wk, conc: bowl.conc, ob: bowl.ob } };
};
app.get('/api/matches', wrap(async (q, r) => {
  const c = COMPS[q.query.comp], y = q.query.year; if (!c || !/^\d{4}$/.test(y || '')) return r.json([]);
  const ms = (await Match.find({ ...c, status: DONE, date: { $gte: `${y}-01-01`, $lte: `${y}-12-31` } }).lean()).sort(desc);
  r.json(ms.slice(0, 300).map(m => ({ key: m.key, date: m.date, teamA: m.teamA, teamB: m.teamB, winner: m.winner, margin: m.margin, venue: m.venue,
    stage: m.stage, playerOfMatch: m.playerOfMatch, a: topOf(m.xiA), b: topOf(m.xiB) })));
}));


app.use((err, _q, r, _n) => r.status(500).json({ error: err.message || 'Server error' }));
await mongoose.connect(process.env.MONGO_URI);
app.listen(process.env.PORT || 5000, () => { console.log('Howzat! API is up'); startLiveSync();
  setInterval(() => {
    startLiveSync(); // or syncElite() if imported directly
  }, 30 * 60 * 1000);
 });