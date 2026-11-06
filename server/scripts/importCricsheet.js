// Usage: npm run import:all
// Reads every Cricsheet-format match JSON under ../data (any subfolder) and rebuilds matches, players, teams and honours.
import 'dotenv/config'; import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import mongoose from 'mongoose';
import { Team, Player, Match, Honour } from '../models.js'; import { mkKey } from '../matchKey.js'; import { domTeam, DOMESTIC_TEAMS } from '../domestic.js';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../data');
const SKIP = ['manifest.json', 'schema.json'];
const rp = path.resolve(HERE, '../roles.json');
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

// ---------- notes for a best knock, derived only from the ball-by-ball record ----------
const PH = ['powerplay', 'middle overs', 'death overs'];
function knockNotes(d, fmt) {
  const sr = d.balls ? d.runs / d.balls * 100 : 0, par = fmt === 'ODI' ? 85 : fmt === 'Test' ? 50 : 130;
  const bShare = d.runs ? Math.round((d.f4 * 4 + d.s6 * 6) / d.runs * 100) : 0, dotPct = d.balls ? Math.round(d.dots / d.balls * 100) : 0;
  const S = [], W = [];
  if (sr >= par * 1.25) S.push(`Fast scoring: strike rate ${Math.round(sr)}, against a typical ${par} in this format.`);
  if (d.f4 + d.s6 >= 4 && bShare >= 50) S.push(`Boundary power: ${d.f4} fours and ${d.s6} sixes made up ${bShare}% of the runs.`);
  else if (d.s6 >= 3) S.push(`Power hitting: ${d.s6} sixes.`);
  if (d.balls >= 15 && dotPct <= 25) S.push(`Kept the scoreboard moving: only ${dotPct}% dot balls.`);
  if (fmt !== 'Test') {
    const ph = d.ph.map((x, i) => ({ i, r: x[0], b: x[1], sr: x[1] ? x[0] / x[1] * 100 : 0 })).filter(x => x.b >= 8);
    if (ph.length > 1) { const hi = ph.reduce((a, b) => (b.sr > a.sr ? b : a)), lo = ph.reduce((a, b) => (b.sr < a.sr ? b : a));
      S.push(`Strongest in the ${PH[hi.i]}: ${hi.r} off ${hi.b} (SR ${Math.round(hi.sr)}).`);
      if (lo.i !== hi.i && lo.sr < par * 0.8) W.push(`Slowest in the ${PH[lo.i]}: ${lo.r} off ${lo.b} (SR ${Math.round(lo.sr)}).`); }
  }
  const vs = Object.entries(d.vs).filter(([, v]) => v[1] >= 6), rate = v => v[0] / v[1];
  if (vs.length > 1) { const hi = vs.reduce((a, b) => (rate(b[1]) > rate(a[1]) ? b : a)), lo = vs.reduce((a, b) => (rate(b[1]) < rate(a[1]) ? b : a));
    S.push(`Scored most freely against ${hi[0]}: ${hi[1][0]} off ${hi[1][1]} balls.`);
    if (lo[0] !== hi[0] && rate(lo[1]) * 100 < par * 0.7) W.push(`Struggled against ${lo[0]}: only ${lo[1][0]} off ${lo[1][1]} balls.`); }
  if (!d.out) S.push('Finished not out, so the bowlers never ended the innings.');
  if (fmt !== 'Test' && d.f10[1] >= 8 && d.f10[0] / d.f10[1] * 100 < par * 0.7) W.push(`Slow start: ${d.f10[0]} off the first ${d.f10[1]} balls.`);
  if (d.balls >= 15 && dotPct >= 40) W.push(`${dotPct}% of the balls faced were dots.`);
  if (d.out && d.runs >= 90 && d.runs < 100) W.push('Fell in the nineties, just short of a century.');
  if (d.out && d.kind) W.push(`Dismissed ${d.kind}${d.by ? ` by ${d.by}` : ''}.`);
  if (!S.length) S.push(`Solid innings: ${d.runs} off ${d.balls}.`);
  if (!W.length) W.push('No clear weakness in the ball-by-ball record.');
  return { strengths: S.slice(0, 4), weaknesses: W.slice(0, 4) };
}

const nbat = () => ({ runs: 0, balls: 0, out: false, f4: 0, s6: 0, dots: 0, ph: [[0, 0], [0, 0], [0, 0]], f10: [0, 0], vs: {}, kind: null, by: null });

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
  const cuts = fmt === 'ODI' ? [10, 40] : [6, 15], phase = o => (o < cuts[0] ? 0 : o < cuts[1] ? 1 : 2);

  for (const inn of m.innings) {
    if (inn.super_over) continue;
    const bt = code(inn.team), bw = code(teams.find(t => t !== inn.team) ?? ''), bat = {}, bowl = {};
    for (const ov of inn.overs || []) for (const d of ov.deliveries || []) {
      const run = d.runs?.batter || 0, wd = d.extras?.wides || 0, nb = d.extras?.noballs || 0, legal = !wd && !nb;
      const s = (bat[d.batter] ??= nbat()); s.runs += run;
      if (!wd) { s.balls++; if (s.balls <= 10) { s.f10[0] += run; s.f10[1]++; } if (run === 0) s.dots++;
        const ph = s.ph[phase(ov.over)]; ph[0] += run; ph[1]++; const v = (s.vs[d.bowler] ??= [0, 0]); v[0] += run; v[1]++; }
      if (run === 4 && !d.runs?.non_boundary) s.f4++; else if (run === 6) s.s6++;
      const tb = Tt(d.batter, bt); tb.ord ||= ord(bt, d.batter); tb.runs += run; if (!wd) tb.balls++;
      if (d.non_striker) Tt(d.non_striker, bt).ord ||= ord(bt, d.non_striker);
      const o = (bowl[d.bowler] ??= { runs: 0, balls: 0, wk: 0 }); o.runs += run + wd + nb; if (legal) o.balls++;
      const tw = Tt(d.bowler, bw); tw.bRuns += run + wd + nb; if (legal) tw.bBalls++;
      for (const w of d.wickets || []) {
        if (w.player_out) { const gone = !['retired hurt', 'retired not out'].includes(w.kind), b = (bat[w.player_out] ??= nbat());
          if (gone) { b.out = true; b.kind = w.kind; b.by = NOT_BOWLER.includes(w.kind) ? null : d.bowler; Tt(w.player_out, bt).out = true; } }
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
  const doc = { season: club ? date.slice(0, 4) : String(i.season ?? date.slice(0, 4)), date, league, ...(!club && { format: fmt }), venue: i.venue ?? null,
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

// Per player: career buckets and calendar-year buckets per tab (Test, ODI, T20, League = IPL/WPL, Domestic), all from innings-level data.
const nb = () => ({ m: 0, bat: { runs: 0, balls: 0, out: 0, inns: 0, f: 0, h: 0, hs: 0, hsNo: false }, bowl: { runs: 0, balls: 0, wk: 0, bw: 0, br: 999 } });
const slot = (o, k) => (o[k] ??= nb());
const docs = new Map(), A = {}, counts = { IPL: 0, WPL: 0, International: 0, Domestic: 0, skipped: 0, duplicates: 0, unreadable: 0 }; let shown = 0;

function accumulate(r) {
  const tab = r.league === 'International' ? r.fmt : r.league === 'Domestic' ? 'Domestic' : 'League', year = r.date.slice(0, 4), core = r.league !== 'Domestic';
  const P = name => (A[`${name}|${r.fem ? 'f' : 'm'}`] ??= { name, club: null, clubLast: '', nat: null, natLast: '', dom: null, domLast: '', first: '', last: '',
    imps: [], inns: [], fb: 0, bb: 0, st: 0, ordSum: 0, ordN: 0, raw: {}, yr: {}, best: {}, bestY: {} });
  const both = (p, f) => { f(slot(p.raw, tab)); f(slot((p.yr[year] ??= {}), tab)); };
  for (const [name, t] of Object.entries(r.tot)) if (r.include.has(t.team)) {
    const p = P(name);
    if (!p.first || r.date < p.first) p.first = r.date; if (r.date > p.last) p.last = r.date;
    both(p, b => { b.m++; });
    p.imps.push([r.date, r.imp(name)]);
    if (!core) { if (r.date >= p.domLast) { p.domLast = r.date; p.dom = t.team; } continue; }
    p.st += t.st; if (t.balls || t.out) { p.ordSum += t.ord; p.ordN++; }
    if (r.league !== 'International') { if (r.date >= p.clubLast) { p.clubLast = r.date; p.club = t.team; } } else if (r.date >= p.natLast) { p.natLast = r.date; p.nat = t.team; }
  }
  for (const inn of r.innings) {
    if (r.include.has(inn.team)) for (const [name, s] of Object.entries(inn.bat)) { const p = P(name);
      both(p, b => { const B = b.bat; if (s.balls || s.out) B.inns++; B.runs += s.runs; B.balls += s.balls; if (s.out) B.out++;
        if (s.runs >= 100) B.h++; else if (s.runs >= 50) B.f++; if (s.runs > B.hs) { B.hs = s.runs; B.hsNo = !s.out; } });
      p.fb += s.balls; if (core) p.inns.push([r.date, s.runs]);
        if (s.balls > 0) {
        const cand = { s, date: r.date, opp: inn.opp, venue: r.doc.venue, event: r.doc.event, fmt: r.fmt,
          result: r.doc.winner ? (r.doc.winner === inn.team ? 'won' : 'lost') : 'no result' };
        const better = c => !c || s.runs > c.s.runs || (s.runs === c.s.runs && s.balls < c.s.balls);
        if (better(p.best[tab])) p.best[tab] = cand;
        const by = (p.bestY[year] ??= {}); if (better(by[tab])) by[tab] = cand;       // best knock of that calendar year
       } } 
    if (r.include.has(inn.opp)) for (const [name, s] of Object.entries(inn.bowl)) { const p = P(name);
      both(p, b => { const W = b.bowl; W.runs += s.runs; W.balls += s.balls; W.wk += s.wk; if (s.wk > W.bw || (s.wk === W.bw && s.runs < W.br)) { W.bw = s.wk; W.br = s.runs; } });
      p.bb += s.balls; }
  }
}

for (const f of files) {
  let json; try { json = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { counts.unreadable++; continue; }
  let any = false;
  for (const m of matchesIn(json)) { any = true; const r = parse(m);
    if (!r) { counts.skipped++; continue; }
    const key = mkKey(r.doc); if (docs.has(key)) { counts.duplicates++; continue; }
    docs.set(key, { ...r.doc, key }); counts[r.league]++; accumulate(r); }
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
const fin = b => ({ m: b.m,
  bat: { runs: b.bat.runs, balls: b.bat.balls, outs: b.bat.out, inns: b.bat.inns, avg: b.bat.inns ? r2(b.bat.runs / (b.bat.out || 1)) : null, sr: b.bat.balls ? r2(b.bat.runs / b.bat.balls * 100) : null,
    fifties: b.bat.f, hundreds: b.bat.h, hs: b.bat.inns ? `${b.bat.hs}${b.bat.hsNo ? '*' : ''}` : '-' },
  bowl: { wkts: b.bowl.wk, runs: b.bowl.runs, balls: b.bowl.balls, econ: b.bowl.balls ? r2(b.bowl.runs / (b.bowl.balls / 6)) : null, avg: b.bowl.wk ? r2(b.bowl.runs / b.bowl.wk) : null,
    best: b.bowl.balls ? `${b.bowl.bw}/${b.bowl.br}` : '-' } });
const byDate = (a, b) => (a[0] < b[0] ? -1 : 1);
const players = Object.values(A).map(p => {
  const last10 = p.imps.sort(byDate).slice(-10).map(x => x[1]), avgImp = last10.reduce((s, x) => s + x, 0) / (last10.length || 1), share = p.bb / ((p.bb + p.fb) || 1);
  const stats = {}; for (const [k, b] of Object.entries(p.raw)) stats[k] = fin(b);
  const years = {}; for (const [y, tabs] of Object.entries(p.yr)) { years[y] = {}; for (const [k, b] of Object.entries(tabs)) years[y][k] = fin(b); }
  const note = c => ({ runs: c.s.runs, balls: c.s.balls, out: c.s.out, date: c.date, opp: c.opp, venue: c.venue, event: c.event, result: c.result, ...knockNotes(c.s, c.fmt) });
  const best = {}; for (const [k, c] of Object.entries(p.best)) best[k] = note(c);
  const bestY = {}; for (const [y, tabs] of Object.entries(p.bestY)) { bestY[y] = {}; for (const [k, c] of Object.entries(tabs)) bestY[y][k] = note(c); }
  const pos = p.ordN ? p.ordSum / p.ordN : null;
  const slotName = share > 0.6 ? 'Bowler' : share > 0.25 ? 'All-rounder' : p.ordN >= 5 ? (pos <= 2.4 ? 'Opener' : pos <= 4.4 ? 'Top order' : pos <= 7.4 ? 'Middle order' : 'Lower order') : 'Batter';
  const d = { slot: slotName, keeper: p.st >= 3, captain: false, name: p.name, team: p.club ?? p.nat ?? p.dom, jersey: (hash(p.name) % 99) + 1,
    matches: Object.values(p.raw).reduce((s, b) => s + b.m, 0), first: p.first, last: p.last, lastDate: [p.clubLast, p.natLast, p.domLast].sort().pop(),
    active: !!p.club && yr(p.clubLast) >= maxClub - 1, role: share > 0.6 ? 'Bowler' : share > 0.25 ? 'All-rounder' : 'Batter',
    impact: Math.round(clamp(avgImp * 14, 0, 99)), recent: p.inns.sort(byDate).slice(-5).map(x => x[1]), stats, years, best, bestY };
  if (p.nat) { d.national = p.nat; d.natActive = yr(p.natLast) >= maxNat - 1; }
  return d; });

// ---------- roles.json: resolve friendly names ("Ruturaj Gaikwad (CSK)") to the data's spelling ("RD Gaikwad") ----------
const known = new Set(players.map(p => p.name));
const resolveRole = raw => {
  const m = String(raw).match(/^(.*?)\s*(?:\(([^)]*)\))?\s*$/), nm = m[1].trim(), hint = (m[2] || '').trim();
  if (known.has(nm)) return nm;
  const sur = nm.toLowerCase().split(/\s+/).at(-1), ini = nm[0].toLowerCase();
  let c = players.filter(p => p.name.toLowerCase().split(/\s+/).at(-1) === sur && p.name[0].toLowerCase() === ini);
  if (c.length > 1 && hint) {
    const base = hint.replace(/\s*women\s*/i, '').trim().toUpperCase(), codes = /women/i.test(hint) ? [`${base}W`, base] : [base];
    const t = c.filter(p => codes.includes(p.team)); if (t.length) c = t;
  }
  return c.sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || '') || b.matches - a.matches)[0]?.name ?? null;
};
const cap = new Set(), kee = new Set();
for (const [list, set] of [['captains', cap], ['keepers', kee]]) for (const raw of ROLES[list]) {
  const hit = resolveRole(raw);
  if (hit) { set.add(hit); if (hit !== raw) console.log(`roles.json: "${raw}" -> ${hit}`); }
  else console.warn(`roles.json: "${raw}" (${list}) not found.`);
}
players.forEach(p => { if (cap.has(p.name)) p.captain = true; if (kee.has(p.name)) p.keeper = true; });
console.log(`Roles applied: ${players.filter(p => p.captain).length} captains, ${players.filter(p => p.keeper).length} keepers`);

// ---------- write ----------
const PAL = ['#1E6FD9', '#D7263D', '#F26B21', '#7B4BB7', '#2BB5C9', '#E83E8C', '#3B5B92', '#C8A24A'];
const CLUB_EVT = /premier league|syed mushtaq|vijay hazare|ranji|duleep|deodhar/i;
const short = e => /syed/i.test(e) ? 'SMAT' : /vijay/i.test(e) ? 'VHT' : /ranji/i.test(e) ? 'Ranji' : /indian premier/i.test(e) ? 'IPL' : /women'?s premier/i.test(e) ? 'WPL' : e;
const nk = s => String(s).replace('-', '/');
const tour = {};
for (const d of arr) if (/^final$/i.test(d.stage || '') && d.winner && CLUB_EVT.test(d.event || ''))
  ((tour[short(d.event)] ??= {})[nk(d.season)] = { code: d.winner, year: +d.date.slice(0, 4), event: d.event });
const cp = path.resolve(HERE, '../champions.json');
if (fs.existsSync(cp)) for (const [ev, seasons] of Object.entries(JSON.parse(fs.readFileSync(cp, 'utf8'))))
  for (const [season, name] of Object.entries(seasons))
    ((tour[short(ev)] ??= {})[nk(season)] = { code: domTeam(name)?.code ?? IPL[name] ?? name, year: +String(season).slice(0, 4), event: ev });
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
for (let n = 0; n < players.length; n += 500) await Player.insertMany(players.slice(n, n + 500));
console.log(`\nDone: ${rows.length} matches, ${players.length} players. Howzat!`); process.exit();