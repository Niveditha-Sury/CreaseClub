import { Team, Match } from '../models.js';
import { mkKey } from '../matchKey.js';
import { domTeam, canonEvent } from '../domestic.js';
import { canSpend, record, spentToday } from './quota.js';
import { eliteGet, findMatches, mapMatch } from './elite.js';

const ALIAS = { royalchallengersbangalore: 'royalchallengersbengaluru', delhidaredevils: 'delhicapitals', kingsxipunjab: 'punjabkings' };
const isW = s => /women|\(w\)|-w\b/i.test(s || '');
const strip = s => String(s || '').replace(/\s*women\s*/i, ' ').replace(/\s*\(w\)/i, '').replace(/-w\b/i, '').trim();
const norm = s => { const n = strip(s).toLowerCase().replace(/[^a-z]/g, ''); return ALIAS[n] ?? n; };
const raw = n => (isW(n) ? `${strip(n)} (W)` : strip(n));
const national = c => c === 'IND' || c === 'INDW';
const DOM_EVT = /ranji|vijay hazare|duleep|syed mushtaq|deodhar|irani|senior women|inter.?state/i;
const PAL = ['#1E6FD9', '#D7263D', '#F26B21', '#7B4BB7', '#2BB5C9', '#E83E8C', '#3B5B92', '#C8A24A'];
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const clean = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null));
const spent = j => !!j.info && j.info.hitsToday >= j.info.hitsLimit - 8;
const dayIso = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

let teams = null;
const toCode = async name => { teams ??= await Team.find().lean();
  return teams.find(t => norm(t.name) === norm(name) && /W$/.test(t.code) === isW(name))?.code ?? null; };
const slug = n => n.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
const domInfo = (n, evt) => { const w = isW(n) || /women/i.test(evt || ''), d = domTeam(n), base = d?.code ?? slug(strip(n));
  return { code: w ? `${base}W` : base, name: `${d?.name ?? strip(n)}${w ? ' (W)' : ''}` }; };
const ensureTeam = ({ code, name }) => Team.updateOne({ code }, { $setOnInsert: { code, name, league: 'Domestic', domestic: true,
  color: PAL[hash(code) % PAL.length], accent: '#14213D', titles: [] } }, { upsert: true });
const domSeason = (name, date) => { const m = String(name || '').match(/(20\d{2})\s*[-/]\s*(\d{2,4})/);
  if (m) return `${m[1]}/${m[2].slice(-2)}`;
  const y = +date.slice(0, 4), mo = +date.slice(5, 7);
  return mo >= 7 ? `${y}/${String(y + 1).slice(-2)}` : `${y - 1}/${String(y).slice(-2)}`; };
const stageOf = n => (/semi/i.test(n || '') ? 'Semi Final' : /quarter/i.test(n || '') ? 'Quarter Final' : /\bfinal\b/i.test(n || '') ? 'Final' : null);
const winnerOf = m => (/\bwon\b/i.test(m.status || '') ? (m.teams || []).find(t => String(m.status).toLowerCase().startsWith(String(t).toLowerCase())) : null);
const ENDED = /\b(won|drawn?|tied|abandoned|no result|cancelled|walkover)\b/i;

// "live" only when the API says started AND the status text doesn't announce a result
const gmt = s => { if (!s) return null; const t = String(s), d = new Date(/z$/i.test(t) || /[+-]\d\d:?\d\d$/.test(t) ? t : `${t}Z`); return isNaN(d) ? null : d; };
const item = (m, event) => ({ id: `cd:${m.id}`, teams: m.teams || [], matchType: m.matchType, venue: m.venue,
  date: String(m.date || m.dateTimeGMT || '').slice(0, 10), startAt: gmt(m.dateTimeGMT),
  status: m.matchEnded ? 'finished' : m.matchStarted ? (ENDED.test(m.status || '') ? 'finished' : 'live') : 'upcoming', text: m.status,
  winnerName: m.matchEnded || ENDED.test(m.status || '') ? winnerOf(m) : null,
  score: (m.score || []).map(s => `${String(s.inning).replace(/\s*Inning\s*\d+/i, '')} ${s.r}/${s.w} (${s.o})`).join(' · '),
  event, stage: stageOf(m.name) });

async function api(path, params = {}, cap = 90) {
  if (!(await canSpend('cricketdata', 1, cap))) throw new Error('CricketData daily budget used up');
  await record('cricketdata');
  const u = new URL(`https://api.cricapi.com/v1/${path}`); u.searchParams.set('apikey', process.env.CRICKETDATA_KEY);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const j = await fetch(u).then(r => r.json());
  if (j.status !== 'success') throw new Error(`CricketData ${path}: ${j.reason || j.status}`);
  return j;
}
async function cricketData() {
  if (!process.env.CRICKETDATA_KEY) return { items: [] };
  const j = await api('currentMatches', { offset: 0 });
  return { items: (j.data || []).map(m => item(m)), exhausted: spent(j) };
}

async function toDoc(it) {
  const [a, b] = it.teams || []; if (!a || !b || !it.date) return null;
  const domEvt = !!it.event && DOM_EVT.test(it.event);
  const ta = domEvt ? null : await toCode(a), tb = domEvt ? null : await toCode(b), lg = c => teams.find(t => t.code === c)?.league;
  const league = domEvt ? 'Domestic'
    : ta && tb && lg(ta) === 'IPL' && lg(tb) === 'IPL' ? 'IPL'
    : ta && tb && lg(ta) === 'WPL' && lg(tb) === 'WPL' ? 'WPL'
    : national(ta) || national(tb) ? 'International'
    : domTeam(a) && domTeam(b) ? 'Domestic' : 'Other';
  const mt = { test: 'Test', odi: 'ODI', t20: 'T20' }[String(it.matchType || '').toLowerCase()];
  if (league === 'International' && !mt) return null;
  const dom = league === 'Domestic', ia = dom ? domInfo(a, it.event) : null, ib = dom ? domInfo(b, it.event) : null;
  if (dom) { await ensureTeam(ia); await ensureTeam(ib); }
  const codeOf = async n => (dom ? domInfo(n, it.event).code : (await toCode(n)) ?? raw(n));
  const doc = { league, format: league === 'IPL' || league === 'WPL' ? undefined : mt, date: it.date, teamA: await codeOf(a), teamB: await codeOf(b) };
  const w = it.winnerName ? await codeOf(it.winnerName) : null, text = it.text || '';
  const margin = it.status === 'finished' ? (/\bwon\b\s*(.*)$/i.exec(text)?.[1] || text) : null;
  return { ...doc, key: mkKey(doc), season: dom ? domSeason(it.event, it.date) : it.date.slice(0, 4), venue: it.venue, status: it.status,
    score: it.score, startAt: it.startAt, liveId: it.id, winner: w, margin, event: dom && it.event ? canonEvent(it.event) : it.event, stage: it.stage,
    nameA: dom ? ia.name : a, nameB: dom ? ib.name : b };
}

const shiftDay = (d, n) => new Date(+new Date(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const KEEP = new Set(['IPL', 'WPL', 'International', 'Domestic']);
// Same teams within one day of a dataset match (Cricsheet uses local dates, the feed uses UTC).
const nearDataset = async d => !!(await Match.exists({ source: 'dataset', league: d.league,
  $or: [{ teamA: d.teamA, teamB: d.teamB }, { teamA: d.teamB, teamB: d.teamA }],
  date: { $in: [shiftDay(d.date, -1), d.date, shiftDay(d.date, 1)] }, ...(d.format ? { format: d.format } : {}) }));

export async function store(items, { trusted = false } = {}) {
  let live = 0, saved = 0;
  for (const it of items) {
    const d = await toDoc(it); if (!d || !KEEP.has(d.league)) continue; if (d.status === 'live') live++;   // only IPL, WPL, India internationals, Indian domestic
    if (trusted) { if (!it.text || !KEEP.has(d.league) || await nearDataset(d)) continue; }   // skip unknown results, uncovered leagues, dataset duplicates
    else if (d.league === 'International' && d.status === 'finished') d.status = 'pending';  // needs a second source
    const { key, status, score, winner, margin, liveId, event, stage, season, nameA, nameB, startAt, ...base } = d;
    const filter = { key, source: { $ne: 'dataset' } }; if (status === 'pending') filter.verified = { $ne: true };
    try {
      await Match.updateOne(filter, { $set: clean({ status, score, winner, margin, liveId, event, stage, season, nameA, nameB, startAt, seenAt: new Date(),
        ...(trusted ? { verified: true, confirmed: true } : {}) }), $setOnInsert: clean({ ...base, source: 'live', xiA: [], xiB: [] }) }, { upsert: true });
      saved++;
    } catch (e) { if (e.code !== 11000) throw e; }
  }
  return { live, saved };
}

export async function syncLive() {
  teams = null;
  const r = await cricketData();
  return { ...(await store(r.items)), exhausted: !!r.exhausted };
}

// ---- domestic tournaments via CricketData series endpoints (whole fixture list per call) ----
let seriesCache = { at: 0, list: [] };
async function domesticSeries() {
  if (Date.now() - seriesCache.at < 12 * 36e5) return seriesCache.list;
  const yr = new Date().getFullYear(), recent = new RegExp(`${yr - 1}|${yr}`), out = new Map();
  for (const q of ['Ranji', 'Vijay Hazare', 'Duleep', 'Syed Mushtaq', 'Deodhar', 'Irani']) {
    const j = await api('series', { offset: 0, search: q }, 60);
    for (const s of j.data || []) if (DOM_EVT.test(s.name) && recent.test(s.name)) out.set(s.id, s.name);
    if (spent(j)) break;
  }
  seriesCache = { at: Date.now(), list: [...out].slice(0, 8) };
  return seriesCache.list;
}
export async function syncSeries() {
  if (!process.env.CRICKETDATA_KEY) return { series: 0, saved: 0 };
  teams = null; let saved = 0, n = 0;
  for (const [id, name] of await domesticSeries()) {
    const j = await api('series_info', { id }, 60); n++;
    saved += (await store((j.data?.matchList ?? []).map(m => item(m, j.data?.info?.name ?? name)))).saved;
    if (spent(j)) break;
  }
  return { series: n, saved };
}

// ---- EliteSport: second opinion, used sparingly (hard budget in quota.js) ----
let lastEliteRecent = 0;
let lastEliteLive = 0;
let lastEliteUpcoming = 0;
const eliteItems = async (path, status) => findMatches(await eliteGet(path)).map(o => mapMatch(o, status)).filter(Boolean);
export async function syncElite(only)  {
  if (!process.env.ELITESPORT_KEY) return { calls: 0 };
  teams = null; let calls = 0;
  const run = async (job, f) => { try { await f(); await record(`elite:${job}`); calls++; } catch (e) { console.error(`[elite] ${job}:`, e.message); } };
  // 1) finished results: runs every 6 hours (4 times a day)
  if ((!only || only === 'recent') && Date.now() - lastEliteRecent > 6 * 36e5)
   await run('recent', async () => { lastEliteRecent = Date.now(); const items = await eliteItems('getRecentMatches', 'finished'), r = await store(items, { trusted: true });
    console.log(`[elite] recent: ${items.length} in feed, ${r.saved} saved`); });
  // 2) confirm live matches, at most every 3 hours and only if something is live
  if ((!only || only === 'live') && Date.now() - lastEliteLive > 3 * 36e5 && (await Match.exists({ status: 'live', seenAt: { $gte: new Date(Date.now() - 36e5) } })))
    await run('live', async () => { lastEliteLive = Date.now(); const keys = [];
      for (const it of await eliteItems('getLiveMatches', 'live')) { const d = await toDoc(it); if (d) keys.push(d.key); }
      if (keys.length) await Match.updateMany({ key: { $in: keys }, status: 'live' }, { $set: { confirmed: true } }); });
  // 3) fill gaps in upcoming fixtures every 12 hours
  if ((!only || only === 'upcoming') && Date.now() - lastEliteUpcoming > 12 * 36e5)
    await run('upcoming', async () => { 
      lastEliteUpcoming = Date.now(); 
      const items = await eliteItems('getUpcomingMatches', 'upcoming'), keys = [];
      for (const it of items) { const d = await toDoc(it); if (d) keys.push(d.key); }
      await store(items); 
      await Match.updateMany({ key: { $in: keys }, status: 'upcoming' }, { $set: { confirmed: true } }); 
    }); 
  await Match.deleteMany({ status: 'pending', date: { $lt: dayIso(-6) } });
  return { calls };
}

export function startLiveSync() {
  if (!process.env.CRICKETDATA_KEY && !process.env.ELITESPORT_KEY) return console.log('[live] sync off (no API keys in .env)');
  const loop = async () => { let next = 60;
    try { const r = await syncLive(); console.log(`[live] live=${r.live} saved=${r.saved}${r.exhausted ? ' (quota nearly used)' : ''}`); next = r.exhausted ? 360 : r.live ? 10 : 60; }
    catch (e) { console.error('[live] sync error:', e.message); next = e.message.includes('budget') ? 120 : 30; }
    setTimeout(loop, next * 60000); };
  if (process.env.CRICKETDATA_KEY) loop();
  if (process.env.CRICKETDATA_KEY) { const series = async () => { try { const r = await syncSeries(); console.log(`[series] series=${r.series} saved=${r.saved}`); }
    catch (e) { console.error('[series] error:', e.message); } setTimeout(series, 12 * 36e5); }; setTimeout(series, 30000); }
  if (process.env.ELITESPORT_KEY) { const elite = async () => { try { const r = await syncElite(); if (r.calls) console.log(`[elite] calls=${r.calls}`); }
    catch (e) { console.error('[elite] error:', e.message); } setTimeout(elite, 3 * 36e5); }; setTimeout(elite, 90000); }
}