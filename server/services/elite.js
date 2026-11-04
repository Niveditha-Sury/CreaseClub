import { canSpend, record } from './quota.js';
const BASE = () => (process.env.ELITESPORT_BASE_URL || 'https://trial.elitesportapi.com').replace(/\/$/, '');
const TYPE = { t20: 't20', odi: 'odi', test: 'test' };
const sc = s => (s && s.score !== '' && s.score != null ? { runs: +s.score, wk: +s.wickets, full: s.complete_score, ov: s.overs } : null);
const stageOf = n => (/semi/i.test(n || '') ? 'Semi Final' : /quarter/i.test(n || '') ? 'Quarter Final' : /\bfinal\b/i.test(n || '') ? 'Final' : null);

export const isMatch = o => !!o && typeof o === 'object' && !Array.isArray(o) && o.teama_name != null && o.teamb_name != null;
export function findMatches(j, depth = 0, out = []) {
  if (!j || depth > 6) return out;
  if (Array.isArray(j)) { const hits = j.filter(isMatch); hits.length ? out.push(...hits) : j.forEach(x => findMatches(x, depth + 1, out)); }
  else if (typeof j === 'object') Object.values(j).forEach(v => findMatches(v, depth + 1, out));
  return out;
}

// Maps one entry of the EliteSport match list. `status` comes from the endpoint used (the feed marks everything "Finished").
export function mapMatch(o, status) {
  const teams = [o.teama_name, o.teamb_name].map(x => String(x ?? '').trim());
  if (teams.some(t => !t || /^tbc\d*$/i.test(t))) return null;                 // placeholder fixtures
  let text = String(o.result ?? '').trim(), winnerName = null, derived = false;
  const w = text.match(/^(.*?)\s+won\b/i); if (w) winnerName = teams.find(t => t.toLowerCase() === w[1].trim().toLowerCase()) ?? null;
  const a = sc(o.teama_score), b = sc(o.teamb_score), toss = String(o.toss || '').match(/^(.*?)\s+opt to (bat|bowl)/i);
  // The feed sometimes leaves `result` empty. Derive it only when both innings and the toss are present (limited overs).
  if (!text && status === 'finished' && a && b && toss && a.runs !== b.runs && /match finished/i.test(o.runs_needed || '') && !/&/.test(`${a.full}${b.full}`)) {
    const tw = toss[1].trim().toLowerCase(), second = toss[2].toLowerCase() === 'bowl' ? tw : teams.find(t => t.toLowerCase() !== tw)?.toLowerCase();
    if (second) { const aWins = a.runs > b.runs, win = aWins ? a : b, lose = aWins ? b : a, wn = teams[aWins ? 0 : 1];
      winnerName = wn; derived = true; text = `${wn} won by ${wn.toLowerCase() === second ? `${10 - win.wk} wkts` : `${win.runs - lose.runs} runs`}`; }
  }
  const ven = String(o.venue ?? '').replace(/\s+/g, ' ').trim();
  const score = [[a, o.teama_name_abbr], [b, o.teamb_name_abbr]].filter(([x]) => x).map(([x, ab]) => `${ab} ${x.full}${x.ov ? ` (${x.ov})` : ''}`).join(' · ');
  return { id: `el:${o.id}`, teams, matchType: TYPE[String(o.type || '').toLowerCase()] ?? '', venue: /^tbc,?\s*tbc$/i.test(ven) ? null : ven || null,
    date: String(o.start_datetime || '').slice(0, 10), startAt: o.start_datetime ? new Date(o.start_datetime) : null,
    status, text, winnerName, derived, score, event: o.series_name, stage: stageOf(o.title) };
}

export async function eliteGet(path, params = {}, { force = false } = {}) {
  const key = process.env.ELITESPORT_KEY; if (!key) throw new Error('ELITESPORT_KEY not set');
  if (!(await canSpend('elite', 1, undefined, force))) throw new Error('EliteSport budget used up for now');
  const u = new URL(`${BASE()}/api/v2/${path}`); Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  await record('elite');
  const r = await fetch(u, { headers: { 'x-api-key': key } });
  if (!r.ok) throw new Error(`EliteSport ${path}: HTTP ${r.status}`);
  return r.json();
}