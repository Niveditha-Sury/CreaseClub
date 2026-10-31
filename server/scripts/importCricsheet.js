// Usage: npm run import:all
// Reads every Cricsheet-format match JSON under ../data (any subfolder) and rebuilds matches, players and teams.
import 'dotenv/config'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import mongoose from 'mongoose';
import { Team, Player, Match, Honour } from '../models.js';
import { mkKey } from '../matchKey.js'; 
import { domTeam, DOMESTIC_TEAMS } from '../domestic.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../data');
const SKIP = ['manifest.json', 'schema.json'];
const rp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../roles.json');
const ROLES = { captains: [], keepers: [], ...(fs.existsSync(rp) ? JSON.parse(fs.readFileSync(rp, 'utf8')) : {}) };
const T = (code, name, league, color, accent, titles = []) => ({ code, name, league, color, accent, titles });
const TEAMS = [
  T('CSK','Chennai Super Kings','IPL','#F4B400','#1B3A6B',[2010,2011,2018,2021,2023]), T('MI','Mumbai Indians','IPL','#1E6FD9','#F4B400',[2013,2015,2017,2019,2020]),
  T('RCB','Royal Challengers Bengaluru','IPL','#D7263D','#14213D',[2025]), T('KKR','Kolkata Knight Riders','IPL','#7B4BB7','#F4B400',[2012,2014,2024]),
  T('DC','Delhi Capitals','IPL','#2F7BE5','#D7263D'), T('PBKS','Punjab Kings','IPL','#D7263D','#C9C9C9'), T('RR','Rajasthan Royals','IPL','#E83E8C','#1E3A8A',[2008]),
  T('SRH','Sunrisers Hyderabad','IPL','#F26B21','#14213D',[2016]), T('GT','Gujarat Titans','IPL','#3B5B92','#C8A24A',[2022]), T('LSG','Lucknow Super Giants','IPL','#2BB5C9','#F4B400'),
  T('MIW','Mumbai Indians (W)','WPL','#1E6FD9','#F4B400',[2023,2025]), T('RCBW','RCB (W)','WPL','#D7263D','#14213D',[2024]), T('DCW','Delhi Capitals (W)','WPL','#2F7BE5','#D7263D'),
  T('UPW','UP Warriorz','WPL','#7A3FB0','#F4B400'), T('GGW','Gujarat Giants (W)','WPL','#F26B21','#14213D'),
  T('IND','India','International','#2E86DE','#F4B400',[1983,2007,2011,2013,2024,2025]), T('INDW','India Women','International','#2E86DE','#F4B400',[2025]),
];
const IPL = { 'Royal Challengers Bangalore':'RCB','Royal Challengers Bengaluru':'RCB','Delhi Daredevils':'DC','Delhi Capitals':'DC','Kings XI Punjab':'PBKS','Punjab Kings':'PBKS',
  'Chennai Super Kings':'CSK','Mumbai Indians':'MI','Kolkata Knight Riders':'KKR','Rajasthan Royals':'RR','Sunrisers Hyderabad':'SRH','Gujarat Titans':'GT','Lucknow Super Giants':'LSG',
  'Rising Pune Supergiant':'RPS','Rising Pune Supergiants':'RPS','Deccan Chargers':'DCH','Gujarat Lions':'GL','Pune Warriors':'PWI','Kochi Tuskers Kerala':'KTK' };
const WPL = { 'Mumbai Indians':'MIW','Delhi Capitals':'DCW','Royal Challengers Bangalore':'RCBW','Royal Challengers Bengaluru':'RCBW','UP Warriorz':'UPW','Gujarat Giants':'GGW' };
const FMT = { test: 'Test', mdm: 'Test', odi: 'ODI', odm: 'ODI', t20: 'T20', it20: 'T20' };
const NOT_BOWLER = ['run out', 'retired hurt', 'retired out', 'obstructing the field'];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x)), r2 = x => +x.toFixed(2);
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const isMatch = o => o && typeof o === 'object' && o.info && Array.isArray(o.innings);
function* matchesIn(x, depth = 0) {
  if (isMatch(x)) { yield x; return; }
  if (depth > 3 || !x || typeof x !== 'object') return;
  for (const v of Array.isArray(x) ? x : Object.values(x)) yield* matchesIn(v, depth + 1);
}
function classify(i) {
  const ev = String(i.event?.name || ''), teams = i.teams || [], fem = i.gender === 'female';
  if (/indian premier league/i.test(ev)) return 'IPL';
  if (/women'?s premier league/i.test(ev)) return 'WPL';
  if (/syed mushtaq ali|vijay hazare|ranji|duleep|deodhar/i.test(ev)) return 'Domestic';
  if (teams.includes('India') && (i.team_type === 'international' || !i.team_type)) return 'International';
  if (i.team_type === 'club' && !fem && teams.every(t => t in IPL)) return 'IPL';
  return null;
}

function parse(m) {
  const i = m.info || {}, teams = i.teams || [], league = classify(i);
  if (!league || teams.length < 2) return null;
  const fem = i.gender === 'female'; let fmt = 'T20', code;
  if (league === 'International') {
    fmt = FMT[String(i.match_type || '').toLowerCase()]; if (!fmt) return null;
    const nat = fem ? 'INDW' : 'IND'; code = n => (n === 'India' ? nat : fem ? `${n} (W)` : n);
  } else if (league === 'Domestic') {
    fmt = FMT[String(i.match_type || '').toLowerCase()] || 'T20'; code = n => domTeam(n)?.code ?? n;
  } else { const map = league === 'IPL' ? IPL : WPL; code = n => map[n] ?? n; }
  const include = new Set(league === 'International' ? [code('India')] : teams.map(code));
  const date = String(i.dates?.[0] || '').slice(0, 10);
  const tot = {}, seen = {}, innings = [];
  const Tt = (name, team) => (tot[name] ??= { team, runs: 0, balls: 0, bRuns: 0, bBalls: 0, wk: 0, ord: 0, out: false, st: 0 });
  const ord = (team, n) => { const a = (seen[team] ??= []); if (!a.includes(n)) a.push(n); return a.indexOf(n) + 1; };

  for (const inn of m.innings) {
    if (inn.super_over) continue;
    const bt = code(inn.team), bw = code(teams.find(t => t !== inn.team) ?? ''), bat = {}, bowl = {};
    for (const ov of inn.overs || []) for (const d of ov.deliveries || []) {
      const run = d.runs?.batter || 0, wd = d.extras?.wides || 0, nb = d.extras?.noballs || 0, legal = !wd && !nb;
      const s = (bat[d.batter] ??= { runs: 0, balls: 0, out: false }); s.runs += run; if (!wd) s.balls++;
      const tb = Tt(d.batter, bt); tb.ord ||= ord(bt, d.batter); tb.runs += run; if (!wd) tb.balls++;
      if (d.non_striker) Tt(d.non_striker, bt).ord ||= ord(bt, d.non_striker);
      const o = (bowl[d.bowler] ??= { runs: 0, balls: 0, wk: 0 }); o.runs += run + wd + nb; if (legal) o.balls++;
      const tw = Tt(d.bowler, bw); tw.bRuns += run + wd + nb; if (legal) tw.bBalls++;
      for (const w of d.wickets || []) {
        if (w.player_out) { const gone = !['retired hurt', 'retired not out'].includes(w.kind);
          const b = (bat[w.player_out] ??= { runs: 0, balls: 0, out: false }); if (gone) { b.out = true; Tt(w.player_out, bt).out = true; } }
                if (!NOT_BOWLER.includes(w.kind)) { o.wk++; tw.wk++; }
        if (w.kind === 'stumped') { const k = w.fielders?.find(f => !f.substitute)?.name; if (k) Tt(k, bw).st++; }
      }
    }
    innings.push({ team: bt, opp: bw, bat, bowl });
  }

  const pom = i.player_of_match?.[0] || '';
  const rpo = fmt === 'ODI' ? 5.5 : fmt === 'Test' ? 3.5 : 8.5, par = fmt === 'ODI' ? 85 : 130;
  const imp = n => { const p = tot[n]; if (!p) return 0; const sr = p.balls ? p.runs / p.balls * 100 : 0, econ = p.bBalls ? p.bRuns / p.bBalls * 6 : 0;
    return +clamp(p.runs * 0.08 + (p.runs >= 20 && fmt !== 'Test' ? (sr - par) / 60 : 0) + p.wk * 1.6 + (p.bBalls >= 12 ? (rpo - econ) / 2 : 0) + (pom === n ? 1.5 : 0), 0, 10).toFixed(1); };
  const xi = t => { const list = i.players?.[t]?.length ? i.players[t] : Object.keys(tot).filter(n => tot[n].team === code(t));
    return list.map(n => { const p = tot[n];
      return { name: n, order: p?.ord || 99, impact: imp(n), runs: p?.runs ?? 0, balls: p?.balls ?? 0, out: !!p?.out, wk: p?.wk ?? 0, conc: p?.bRuns ?? 0, ob: p?.bBalls ?? 0 }; })
      .sort((a, b) => a.order - b.order); };
  const o = i.outcome || {}, by = o.by ? 'by ' + Object.entries(o.by).map(([k, v]) => `${v} ${k}`).join(' ') : '', win = o.winner ?? o.eliminator;
  const club = league === 'IPL' || league === 'WPL';
  const doc = { season: String(i.season ?? date.slice(0, 4)), date, league, ...(!club && { format: fmt }), venue: i.venue ?? null,
    teamA: code(teams[0]), teamB: code(teams[1]), tossWinner: i.toss?.winner ? code(i.toss.winner) : null, tossDecision: i.toss?.decision ?? null,
    winner: win ? code(win) : null, margin: [club ? '' : fmt, by, o.method, !win && o.result ? o.result : ''].filter(Boolean).join(' · '),
      playerOfMatch: pom, event: i.event?.name ?? null, stage: i.event?.stage ?? null, xiA: xi(teams[0]), xiB: xi(teams[1]) };
  return { league, fmt, fem, include, doc, innings, tot, imp, date };
}

// ---------- read everything ----------
if (!fs.existsSync(ROOT)) { console.error(`Missing folder: ${ROOT}`); process.exit(1); }
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name))
  : e.name.endsWith('.json') && !SKIP.includes(e.name) ? [path.join(d, e.name)] : []);
const files = walk(ROOT); console.log(`Scanning ${files.length} JSON files under ${ROOT} ...`);

const nb = () => ({ bat: { runs: 0, balls: 0, out: 0, f: 0, h: 0, hs: 0, hsNo: false }, bowl: { runs: 0, balls: 0, wk: 0, bw: 0, br: 999 } });
const docs = new Map(), A = {}, counts = { IPL: 0, WPL: 0, International: 0, Domestic: 0, skipped: 0, duplicates: 0, unreadable: 0 }; let shown = 0;

function accumulate(r) {
  const club = r.league !== 'International';
  const P = name => (A[`${name}|${r.fem ? 'f' : 'm'}`] ??= { name, club: null, clubLast: '', nat: null, natLast: '', imps: [], inns: [], fb: 0, bb: 0, lg: nb(), f: {}, st: 0, ordSum: 0, ordN: 0 });
  const bucket = p => (club ? p.lg : (p.f[r.fmt] ??= nb()));
  for (const [name, t] of Object.entries(r.tot)) if (r.include.has(t.team)) {
      const p = P(name); p.imps.push([r.date, r.imp(name)]); p.st += t.st; if (t.balls || t.out) { p.ordSum += t.ord; p.ordN++; }
    if (club) { if (r.date >= p.clubLast) { p.clubLast = r.date; p.club = t.team; } } else if (r.date >= p.natLast) { p.natLast = r.date; p.nat = t.team; }
  }
  for (const inn of r.innings) {
    if (r.include.has(inn.team)) for (const [name, s] of Object.entries(inn.bat)) { const p = P(name), B = bucket(p).bat;
      B.runs += s.runs; B.balls += s.balls; if (s.out) B.out++; if (s.runs >= 100) B.h++; else if (s.runs >= 50) B.f++;
      if (s.runs > B.hs) { B.hs = s.runs; B.hsNo = !s.out; } p.fb += s.balls; p.inns.push([r.date, s.runs]); }
    if (r.include.has(inn.opp)) for (const [name, s] of Object.entries(inn.bowl)) { const p = P(name), W = bucket(p).bowl;
      W.runs += s.runs; W.balls += s.balls; W.wk += s.wk; p.bb += s.balls;
      if (s.wk > W.bw || (s.wk === W.bw && s.runs < W.br)) { W.bw = s.wk; W.br = s.runs; } }
  }
}

for (const f of files) {
  let json; try { json = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { counts.unreadable++; continue; }
  let any = false;
  for (const m of matchesIn(json)) { any = true; const r = parse(m);
    if (!r) { counts.skipped++; continue; }
    const key = mkKey(r.doc); if (docs.has(key)) { counts.duplicates++; continue; }
    docs.set(key, { ...r.doc, key }); counts[r.league]++;
    if (r.league !== 'Domestic') accumulate(r); }              // domestic player stats are not built yet
  if (!any && shown++ < 2) { const pk = Array.isArray(json) ? json[0] : json;
    console.error(`\nNot a recognised match file: ${f}\n  keys: ${Object.keys(pk ?? {}).slice(0, 12).join(', ')}\n  sample: ${JSON.stringify(pk)?.slice(0, 400)}`); }
}
console.log('Found:', counts);
if (!docs.size) { console.error('\nNo matches recognised. Paste the output above and I will adapt the parser.'); process.exit(1); }

// ---------- players ----------
const yr = s => +String(s).slice(0, 4);
const arr = [...docs.values()];
const maxYr = f => Math.max(0, ...arr.filter(f).map(d => yr(d.date)));
const maxClub = maxYr(d => d.league === 'IPL' || d.league === 'WPL'), maxNat = maxYr(d => d.league === 'International');
const fmtStats = b => ({
  bat: { runs: b.bat.runs, avg: r2(b.bat.runs / (b.bat.out || 1)), sr: r2(b.bat.runs / (b.bat.balls || 1) * 100), fifties: b.bat.f, hundreds: b.bat.h, hs: b.bat.hs ? b.bat.hs + (b.bat.hsNo ? '*' : '') : '-' },
  bowl: { wkts: b.bowl.wk, econ: b.bowl.balls ? r2(b.bowl.runs / (b.bowl.balls / 6)) : 0, avg: b.bowl.wk ? r2(b.bowl.runs / b.bowl.wk) : 0, best: b.bowl.bw ? `${b.bowl.bw}/${b.bowl.br}` : '-' } });
const byDate = (a, b) => (a[0] < b[0] ? -1 : 1);
const players = Object.values(A).map(p => {
  const last10 = p.imps.sort(byDate).slice(-10).map(x => x[1]), avg = last10.reduce((s, x) => s + x, 0) / (last10.length || 1), share = p.bb / ((p.bb + p.fb) || 1);
  const stats = {}; if (p.club) stats.League = fmtStats(p.lg); for (const [k, b] of Object.entries(p.f)) stats[k] = fmtStats(b);
    const pos = p.ordN ? p.ordSum / p.ordN : null;
  const slot = share > 0.6 ? 'Bowler' : share > 0.25 ? 'All-rounder' : p.ordN >= 5 ? (pos <= 2.4 ? 'Opener' : pos <= 4.4 ? 'Top order' : pos <= 7.4 ? 'Middle order' : 'Lower order') : 'Batter';
  const keeper = p.st >= 3 || ROLES.keepers.includes(p.name), captain = ROLES.captains.includes(p.name);
  const d = { slot, keeper, captain, name: p.name, team: p.club ?? p.nat, jersey: (hash(p.name) % 99) + 1, matches: p.imps.length, lastDate: [p.clubLast, p.natLast].sort().pop(),
    active: !!p.club && yr(p.clubLast) >= maxClub - 1, role: share > 0.6 ? 'Bowler' : share > 0.25 ? 'All-rounder' : 'Batter',
    impact: Math.round(clamp(avg * 14, 0, 99)), recent: p.inns.sort(byDate).slice(-5).map(x => x[1]), stats };
  if (p.nat) { d.national = p.nat; d.natActive = yr(p.natLast) >= maxNat - 1; }
  return d; });

// ---------- write ----------
const PAL = ['#1E6FD9', '#D7263D', '#F26B21', '#7B4BB7', '#2BB5C9', '#E83E8C', '#3B5B92', '#C8A24A'];
const CLUB_EVT = /premier league|syed mushtaq|vijay hazare|ranji|duleep|deodhar/i;
const short = e => /syed/i.test(e) ? 'SMAT' : /vijay/i.test(e) ? 'VHT' : /ranji/i.test(e) ? 'Ranji' : /indian premier/i.test(e) ? 'IPL' : /women'?s premier/i.test(e) ? 'WPL' : e;
const nk = s => String(s).replace('-', '/');

// 1) finals found in the data: tour[tournament][season] = { code, year }
const tour = {};
for (const d of arr) if (/^final$/i.test(d.stage || '') && d.winner && CLUB_EVT.test(d.event || ''))
  ((tour[short(d.event)] ??= {})[nk(d.season)] = { code: d.winner, year: +d.date.slice(0, 4), event: d.event });
// 2) manual overrides fill gaps when the download lags or a final is unlabelled
const cp = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../champions.json');
if (fs.existsSync(cp)) for (const [ev, seasons] of Object.entries(JSON.parse(fs.readFileSync(cp, 'utf8'))))
  for (const [season, name] of Object.entries(seasons))
    ((tour[short(ev)] ??= {})[nk(season)] = { code: domTeam(name)?.code ?? IPL[name] ?? name, year: +String(season).slice(0, 4), event: ev });
// 3) titles per team, and reigning champions = winner of each tournament's latest season
const won = {}, champOf = {};
for (const [ev, seasons] of Object.entries(tour)) {
  const keys = Object.keys(seasons).sort();
  for (const s of keys) (won[seasons[s].code] ??= new Set()).add(seasons[s].year);
  (champOf[seasons[keys[keys.length - 1]].code] ??= []).push(ev);
}
const yrs = c => [...(won[c] ?? [])].sort();
console.log('Reigning champions:', Object.fromEntries(Object.entries(champOf).map(([c, e]) => [c, e.join(', ')])));

await mongoose.connect(process.env.MONGO_URI);
await Honour.deleteMany({});
await Honour.insertMany(Object.values(tour).flatMap(s => Object.entries(s).map(([season, v]) => ({ event: v.event, season, year: v.year, code: v.code }))));
await Team.deleteMany({ domestic: true });
for (const t of TEAMS) await Team.updateOne({ code: t.code },
  { ...t, titles: [...new Set([...t.titles, ...yrs(t.code)])].sort(), champion: !!champOf[t.code], champOf: champOf[t.code] ?? [] }, { upsert: true });
const domCodes = new Set(arr.filter(d => d.league === 'Domestic').flatMap(d => [d.teamA, d.teamB]));
for (const t of DOMESTIC_TEAMS.filter(t => domCodes.has(t.code) || won[t.code]))
  await Team.updateOne({ code: t.code }, { ...t, league: 'Domestic', domestic: true, color: PAL[hash(t.code) % PAL.length], accent: '#14213D',
    titles: yrs(t.code), champion: !!champOf[t.code], champOf: champOf[t.code] ?? [] }, { upsert: true });

await Match.deleteMany({ source: { $ne: 'live' } }); await Player.deleteMany({});
const rows = arr.map(d => ({ ...d, source: 'dataset', status: 'finished', score: null }));
for (let n = 0; n < rows.length; n += 500)
  await Match.bulkWrite(rows.slice(n, n + 500).map(d => ({ updateOne: { filter: { key: d.key }, update: { $set: d }, upsert: true } })));
await Player.insertMany(players);
console.log(`\nDone: ${rows.length} matches, ${players.length} players. Howzat!`); process.exit();