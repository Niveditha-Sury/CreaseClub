import { Team, Match } from '../models.js';
import { mkKey } from '../matchKey.js';
import { domTeam, canonEvent } from '../domestic.js';

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

let teams = null;
const toCode = async name => { teams ??= await Team.find().lean();
  return teams.find(t => norm(t.name) === norm(name) && /W$/.test(t.code) === isW(name))?.code ?? null; };

const slug = n => n.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase();
const domInfo = (n, evt) => { const w = isW(n) || /women/i.test(evt || ''), d = domTeam(n), base = d?.code ?? slug(strip(n));
  return { code: w ? `${base}W` : base, name: `${d?.name ?? strip(n)}${w ? ' (W)' : ''}` }; };
async function ensureTeam({ code, name }) {
  await Team.updateOne({ code }, { $setOnInsert: { code, name, league: 'Domestic', domestic: true,
    color: PAL[hash(code) % PAL.length], accent: '#14213D', titles: [] } }, { upsert: true });
}
// Indian domestic season runs July to June, labelled like Cricsheet: 2025/26
const domSeason = (name, date) => { const m = String(name || '').match(/(20\d{2})\s*[-/]\s*(\d{2,4})/);
  if (m) return `${m[1]}/${m[2].slice(-2)}`;
  const y = +date.slice(0, 4), mo = +date.slice(5, 7);
  return mo >= 7 ? `${y}/${String(y + 1).slice(-2)}` : `${y - 1}/${String(y).slice(-2)}`; };

const stageOf = n => (/semi/i.test(n || '') ? 'Semi Final' : /quarter/i.test(n || '') ? 'Quarter Final' : /\bfinal\b/i.test(n || '') ? 'Final' : null);
// A winner exists only if the result text says "<team> won ...".
const winnerOf = m => (/\bwon\b/i.test(m.status || '') ? (m.teams || []).find(t => String(m.status).toLowerCase().startsWith(String(t).toLowerCase())) : null);
const item = (m, event) => ({ id: `cd:${m.id}`, teams: m.teams || [], matchType: m.matchType, venue: m.venue,
  date: String(m.date || m.dateTimeGMT || '').slice(0, 10), status: m.matchEnded ? 'finished' : m.matchStarted ? 'live' : 'upcoming', text: m.status,
  winnerName: m.matchEnded ? winnerOf(m) : null,
  score: (m.score || []).map(s => `${String(s.inning).replace(/\s*Inning\s*\d+/i, '')} ${s.r}/${s.w} (${s.o})`).join(' · '),
  event, stage: stageOf(m.name) });

async function api(path, params = {}) {
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
// EliteSport: fill in mapElite once you have its response format (return null to skip an entry).
const mapElite = _raw => null;
async function eliteSport() {
  const { ELITESPORT_BASE_URL: base, ELITESPORT_KEY: key } = process.env; if (!base || !key) return { items: [] };
  const j = await fetch(`${base}/live`, { headers: { Authorization: `Bearer ${key}` } }).then(r => r.json());
  return { items: (j.matches ?? j.data ?? []).map(mapElite).filter(Boolean) };
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
  const margin = it.status === 'finished' ? (/\bwon\b\s*(.*)$/i.exec(text)?.[1] || text) : null;   // "by 5 wickets", like the dataset
  return { ...doc, key: mkKey(doc), season: dom ? domSeason(it.event, it.date) : it.date.slice(0, 4), venue: it.venue, status: it.status,
    score: it.score, liveId: it.id, winner: w, margin, event: dom && it.event ? canonEvent(it.event) : it.event, stage: it.stage,
    nameA: dom ? ia.name : a, nameB: dom ? ib.name : b };
}

async function store(items) {
  let live = 0, saved = 0;
  for (const it of items) {
    const d = await toDoc(it); if (!d) continue; if (d.status === 'live') live++;
        if (d.league === 'International' && d.status === 'finished') { await Match.deleteOne({ key: d.key, source: 'live' }); continue; }   // results come from Cricsheet only
    const { key, status, score, winner, margin, liveId, event, stage, season, nameA, nameB, ...base } = d;
    try {
      await Match.updateOne({ key, source: { $ne: 'dataset' } },
        { $set: clean({ status, score, winner, margin, liveId, event, stage, season, nameA, nameB, seenAt: new Date() }),
          $setOnInsert: clean({ ...base, source: 'live', xiA: [], xiB: [] }) }, { upsert: true });
      saved++;
    } catch (e) { if (e.code !== 11000) throw e; }
  }
  return { live, saved };
}

export async function syncLive() {
  teams = null;
  const res = await Promise.allSettled([cricketData(), eliteSport()]);
  res.filter(r => r.status === 'rejected').forEach(r => console.error('[live] source failed:', r.reason.message));
  const ok = res.filter(r => r.status === 'fulfilled').map(r => r.value);
  return { ...(await store(ok.flatMap(v => v.items))), exhausted: ok.some(v => v.exhausted) };
}

let seriesCache = { at: 0, list: [] };
async function domesticSeries() {
  if (Date.now() - seriesCache.at < 12 * 36e5) return seriesCache.list;
  const yr = new Date().getFullYear(), recent = new RegExp(`${yr - 1}|${yr}`), out = new Map();
  for (const q of ['Ranji', 'Vijay Hazare', 'Duleep', 'Syed Mushtaq', 'Deodhar', 'Irani']) {
    const j = await api('series', { offset: 0, search: q });
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
    const j = await api('series_info', { id }); n++;
    saved += (await store((j.data?.matchList ?? []).map(m => item(m, j.data?.info?.name ?? name)))).saved;
    if (spent(j)) break;
  }
  return { series: n, saved };
}

export function startLiveSync() {
  if (!process.env.CRICKETDATA_KEY && !process.env.ELITESPORT_KEY) return console.log('[live] sync off (no API keys in .env)');
  const loop = async () => { let next = 60;
    try { const r = await syncLive(); console.log(`[live] live=${r.live} saved=${r.saved}${r.exhausted ? ' (quota nearly used)' : ''}`); next = r.exhausted ? 360 : r.live ? 10 : 60; }
    catch (e) { console.error('[live] sync error:', e.message); next = 30; }
    setTimeout(loop, next * 60000); };
  loop();
  if (process.env.CRICKETDATA_KEY) {
    const series = async () => { try { const r = await syncSeries(); console.log(`[series] series=${r.series} saved=${r.saved}`); }
      catch (e) { console.error('[series] error:', e.message); } setTimeout(series, 12 * 36e5); };
    setTimeout(series, 30000);
  }
}