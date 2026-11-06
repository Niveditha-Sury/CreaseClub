import { createContext, useContext, useEffect, useRef, useState } from 'react';
const API = import.meta.env.VITE_API_URL || '';
const get = u => fetch(API + u).then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))));
const post = async (u, b) => {
  const r = await fetch(API + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch { /* not JSON */ }
  if (!r.ok) throw new Error(j.error || t.slice(0, 120) || `HTTP ${r.status}`); return j;
};
const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const form = r => { if (!r?.length) return 'No recent knocks'; const a = r.reduce((s, x) => s + x, 0) / r.length; return a > 40 ? 'In Golden Form' : a > 20 ? 'Finding the Gap' : 'In the Mud'; };
const go = id => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
const pred = (a, b, toss) => get(`/api/predict?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}${toss ? `&toss=${encodeURIComponent(toss)}` : ''}`);
const route = h => {
  let m = h.match(/^#\/team\/([^/?]+)(?:\?format=(\w+))?/); if (m) return { type: 'team', code: decodeURIComponent(m[1]), format: m[2] || '' };
  m = h.match(/^#\/player\/([^?]+)(?:\?ctx=(\w+))?/); if (m) return { type: 'player', name: decodeURIComponent(m[1]), ctx: m[2] || '' };
  if (/^#\/matches/.test(h)) return { type: 'matches' };
  return /^#\/bookmarks/.test(h) ? { type: 'bookmarks' } : null;
};
const useHash = () => { const [h, setH] = useState(location.hash);
  useEffect(() => { const f = () => { setH(location.hash); window.scrollTo(0, 0); }; addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []); return h; };
const women = m => m.league === 'WPL' || /W$/.test(m.teamA) && /W$/.test(m.teamB) || m.teamA === 'INDW' || m.teamB === 'INDW' || /\(W\)/.test(`${m.teamA}${m.teamB}`);

const QUIPS = ['Form is temporary, class is permanent.', 'Catches win matches.', 'Keep your eye on the ball and your head on your shoulders.',
  'A good length is a bowler\'s best friend.', 'Every ball is a new chance.', 'Stay at the crease and the runs will come.', 'Chin music never goes out of style.'];

// One fact per day, picked by the calendar date.
const FACTS = [
  'The first Test match was played in March 1877 between Australia and England at the MCG.',
  'Sachin Tendulkar scored 100 international centuries: 51 in Tests and 49 in ODIs.',
  'Brian Lara\'s 400 not out against England in 2004 is still the highest individual Test score.',
  'Rohit Sharma\'s 264 against Sri Lanka in 2014 is the highest score in men\'s ODIs.',
  'Anil Kumble took all 10 wickets in a Test innings against Pakistan in Delhi in 1999.',
  'Jim Laker took 19 wickets in a single Test in 1956, a record that still stands.',
  'Don Bradman\'s Test batting average was 99.94.',
  'Muttiah Muralitharan finished his Test career with 800 wickets, the most ever.',
  'Chris Gayle\'s 175 not out for RCB in 2013 is the highest individual score in IPL history.',
  'The IPL began in 2008 and Rajasthan Royals won the first title.',
  'In 2025, 14-year-old Vaibhav Suryavanshi scored an IPL century off just 35 balls.',
  'Yuvraj Singh hit six sixes in an over against England at the 2007 T20 World Cup.',
  'India lifted their first World Cup in 1983, beating the West Indies at Lord\'s.',
  'MS Dhoni captained India to the 2007 T20 World Cup, the 2011 World Cup and the 2013 Champions Trophy.',
  'Cricket has been in the Olympics once, in 1900, when Great Britain beat France.',
  'The 1939 "Timeless Test" in Durban was abandoned as a draw after ten days because England had a ship to catch.',
  'Shane Warne\'s first Ashes ball in 1993 to Mike Gatting became known as the Ball of the Century.',
  'A men\'s cricket ball weighs between 155.9 and 163 grams.',
  'The Ashes urn is only about 11 cm tall.',
  'The Women\'s Premier League began in 2023, and Mumbai Indians won the first title.',
  'Harmanpreet Kaur hit an unbeaten 171 against Australia in the 2017 Women\'s World Cup semi-final.',
  'Mithali Raj scored more runs in women\'s ODIs than anyone else, over 7,000.',
  'The first day-night Test with a pink ball was played in Adelaide in 2015.',
  'Ravi Shastri hit six sixes in an over in a Ranji Trophy match in 1985.',
  '"Howzat" is simply "How is that?" squeezed into one appeal.',
  'In 2024 Sunrisers Hyderabad posted 287/3 against RCB, then the highest total in IPL history.',
];
const today = () => { const d = new Date(); return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };

/* ---------- small pieces ---------- */
function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(), [on, setOn] = useState(false);
  useEffect(() => { const o = new IntersectionObserver(([e]) => e.isIntersecting && (setOn(true), o.disconnect()), { threshold: 0.12 }); o.observe(ref.current); return () => o.disconnect(); }, []);
  return <div ref={ref} className={`reveal ${on ? 'in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}
function PixelAvatar({ name, color, accent, size = 56 }) {
  let h = hash(name); const cells = [];
  for (let y = 0; y < 8; y++) { const row = []; for (let x = 0; x < 4; x++) { h = (h * 1103515245 + 12345) >>> 0; row.push(h % 3); } cells.push([...row, ...row.slice().reverse()]); }
  const pal = [color, '#E8B98A', accent];
  return <div className="px-grid shrink-0" style={{ width: size, height: size }} aria-hidden>
    {cells.flat().map((c, i) => { const y = Math.floor(i / 8); return <i key={i} style={{ background: y < 2 ? pal[0] : y > 5 ? pal[2] : pal[c === 0 ? 1 : c] }} />; })}</div>;
}
const Cups = ({ years = [] }) => years.length ? <span className="inline-flex items-center gap-1 text-gold text-xs" title={years.join(', ')}>🏆 ×{years.length}</span> : null;
const Stat = ({ k, v }) => <div className="text-center"><div className="font-pixel text-[11px]">{v ?? '–'}</div><div className="text-[10px] text-mute mt-1">{k}</div></div>;
const kindOf = r => (/bowler/i.test(r) ? 'bowl' : /all/i.test(r) ? 'both' : 'bat');
const Tags = ({ p }) => <div className="flex gap-1 flex-wrap mt-2">
  {p.captain && <span className="chip text-gold border-gold/40">C</span>}{p.keeper && <span className="chip text-lime border-lime/40">WK</span>}{p.slot && <span className="chip">{p.slot}</span>}</div>;
const Chips = ({ items, value, onChange }) => <div className="flex gap-2 flex-wrap">{items.map(([k, l]) => <button key={k} className="btn" aria-pressed={value === k} onClick={() => onChange(k)}>{l}</button>)}</div>;
const fmtDate = d => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');
const fmtShort = d => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
const Footer = () => <footer className="border-t border-line mt-16"><div className="max-w-6xl mx-auto px-4 py-8 text-center text-xs text-mute">
  <div>© 2026 Niveditha Sury. All rights reserved.</div>
  <div className="mt-1 opacity-70">Match data from Cricsheet and CricketData.org. Not affiliated with the BCCI, IPL, WPL or ICC.</div></div></footer>;

const Trophy = () => <svg viewBox="0 0 64 64" className="w-20 h-20 float shrink-0" aria-hidden><path d="M20 8h24v14a12 12 0 0 1-24 0z" fill="#f4b400" /><path d="M20 12H10v4a10 10 0 0 0 10 10M44 12h10v4a10 10 0 0 1-10 10" fill="none" stroke="#f4b400" strokeWidth="4" /><rect x="29" y="34" width="6" height="10" fill="#f4b400" /><rect x="20" y="44" width="24" height="8" rx="2" fill="#b8f26b" /></svg>;
const Globe = () => <svg viewBox="0 0 64 64" className="w-20 h-20 float shrink-0" aria-hidden><circle cx="32" cy="32" r="22" fill="#1c3b5a" stroke="#2e86de" strokeWidth="3" /><path d="M10 32h44M32 10c-12 12-12 32 0 44M32 10c12 12 12 32 0 44" fill="none" stroke="#2e86de" strokeWidth="2" /><rect x="40" y="6" width="3" height="16" fill="#f4b400" /><path d="M43 6h10l-3 4 3 4H43z" fill="#ff9933" /></svg>;
const Pulse = () => <svg viewBox="0 0 64 64" className="w-20 h-20 float shrink-0" aria-hidden><rect x="6" y="14" width="52" height="34" rx="5" fill="#1c261f" stroke="#b8f26b" strokeWidth="3" /><path d="M12 32h10l5-10 8 18 5-8h12" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><rect x="24" y="52" width="16" height="4" rx="2" fill="#b8f26b" /></svg>;
const Ground = () => <svg viewBox="0 0 64 64" className="w-20 h-20 float shrink-0" aria-hidden><ellipse cx="32" cy="44" rx="28" ry="14" fill="#1f5d3a" /><ellipse cx="32" cy="44" rx="16" ry="7" fill="none" stroke="#b8f26b" strokeWidth="2" /><rect x="28" y="28" width="2" height="16" fill="#e9f0ea" /><rect x="32" y="28" width="2" height="16" fill="#e9f0ea" /><rect x="36" y="28" width="2" height="16" fill="#e9f0ea" /><circle cx="50" cy="18" r="5" fill="#d7263d" /></svg>;
const Orb = ({ busy }) => <svg viewBox="0 0 64 64" className={`w-24 h-24 shrink-0 ${busy ? 'shake' : 'float'}`} aria-hidden><circle cx="32" cy="30" r="22" fill="#1c261f" stroke="#b8f26b" strokeWidth="3" /><circle cx="32" cy="30" r="8" fill="#d7263d" /><path d="M26 28q6 4 12 0" stroke="#fff" strokeWidth="1.5" fill="none" /><path d="M20 22a14 14 0 0 1 10-8" stroke="#fff" strokeOpacity=".5" strokeWidth="3" fill="none" strokeLinecap="round" /><rect x="18" y="50" width="28" height="8" rx="3" fill="#b8f26b" /></svg>;
const Head = ({ art, title, sub }) => <div className="flex items-center gap-4">{art}<div><h2 className="font-display font-extrabold text-2xl md:text-3xl">{title}</h2><p className="text-mute text-sm mt-1">{sub}</p></div></div>;

const Bat = () => <svg viewBox="0 0 32 32" className="w-8 h-8 shrink-0" aria-hidden><rect x="13" y="2" width="6" height="16" rx="3" transform="rotate(30 16 10)" fill="#e8b98a" /><rect x="14" y="17" width="3" height="10" rx="1.5" transform="rotate(30 16 10)" fill="#1f5d3a" /><circle cx="7" cy="25" r="4" fill="#d7263d" /></svg>;
const Duck = ({ text }) => <div className="col-span-full text-center py-6"><svg viewBox="0 0 64 64" className="w-16 h-16 mx-auto float" aria-hidden><ellipse cx="32" cy="40" rx="20" ry="17" fill="#f4b400" /><circle cx="32" cy="40" r="9" fill="#0d120f" /><text x="32" y="45" textAnchor="middle" fontSize="14" fontWeight="700" fill="#b8f26b">0</text><circle cx="42" cy="17" r="9" fill="#f4b400" /><circle cx="45" cy="15" r="1.8" fill="#0d120f" /><path d="M50 18l8 2-8 3z" fill="#f26b21" /></svg><p className="text-sm text-mute mt-2 max-w-md mx-auto">{text}</p></div>;
const Quip = ({ n }) => <Reveal><div className="flex items-center justify-center gap-3 text-center text-mute text-sm float"><Bat /><i>“{QUIPS[(today() + n) % QUIPS.length]}”</i></div></Reveal>;

const Wicket = () => <svg viewBox="0 0 320 200" className="w-full max-w-md" aria-hidden>
  <ellipse cx="200" cy="180" rx="120" ry="8" fill="#000" opacity=".4" />
  <g className="stumps">{[170, 200, 230].map(x => <rect key={x} x={x - 4} y="70" width="8" height="110" rx="2" fill="#e9f0ea" />)}</g>
  <rect className="bail b1" x="167" y="62" width="30" height="6" rx="3" fill="#f4b400" />
  <rect className="bail b2" x="203" y="62" width="30" height="6" rx="3" fill="#f4b400" />
  <circle className="ring" cx="200" cy="118" r="14" fill="none" stroke="#b8f26b" strokeWidth="3" />
  <g className="ball"><circle r="12" fill="#d7263d" /><path d="M-10 -3 Q0 4 10 -3" stroke="#fff" strokeWidth="1.5" fill="none" /></g></svg>;

function Hero({ ready, live }) {
  const n = live.filter(m => m.status === 'live').length;
  return <section className="relative min-h-screen flex flex-col items-center justify-center text-center px-4 py-16 overflow-hidden">
    <div className="hero-bg absolute inset-0 pointer-events-none" /><div className="beam l" /><div className="beam r" />
    <Wicket />
    <h1 className="glow font-pixel text-2xl sm:text-4xl md:text-5xl mt-4 leading-snug">Crease Club</h1>
    <div className="tag card fact mt-6 max-w-lg p-4 text-left flex gap-3 items-start">
      <svg viewBox="0 0 32 32" className="w-9 h-9 shrink-0" aria-hidden><rect x="14" y="2" width="5" height="20" rx="2" transform="rotate(25 16 12)" fill="#e8b98a" /><rect x="12" y="19" width="3" height="10" rx="1" transform="rotate(25 16 12)" fill="#1f5d3a" /><circle cx="8" cy="25" r="4" fill="#d7263d" /></svg>
      <div><div className="text-[10px] tracking-widest text-lime">DID YOU KNOW · TODAY</div><p className="text-sm mt-1">{FACTS[today() % FACTS.length]}</p></div></div>
    {ready && <div className="rise mt-8 flex gap-3 flex-wrap justify-center">
      <button className="btn primary" onClick={() => go('ipl')}>Step onto the field ↓</button>
      {n > 0 && <button className="btn" onClick={() => go('live')}><span className="livedot inline-block mr-2" />{n} live now</button>}</div>}
  </section>;
}

/* ---------- home sections ---------- */
const TeamCard = ({ t, fit }) => <a href={`#/team/${t.code}`} className={`card block p-4 ${fit ? '' : 'h-full'} relative ${t.champion ? 'champ' : ''}`}>
  {t.champion && <span className="absolute -top-2 right-3 text-[9px] font-pixel bg-gold text-bg px-2 py-1 rounded">CHAMPS{t.champOf?.length ? ` · ${t.champOf.join(' · ')}` : ''}</span>}
  <div className="h-1.5 rounded-full mb-3" style={{ background: t.color }} />
  <div className="flex justify-between items-start"><span className="font-pixel text-xl" style={{ color: t.color }}>{t.code}</span><Cups years={t.titles} /></div>
  <div className="font-display font-bold mt-3 leading-tight">{t.titles?.length ? '🏆 ' : ''}{t.name}</div><span className="chip mt-2 inline-block">{t.league}</span></a>;

function IplSection({ teams }) {
  const [g, setG] = useState('m'), list = teams.filter(t => t.league === (g === 'm' ? 'IPL' : 'WPL'));
  return <section id="ipl" className="pt-16 space-y-6 scroll-mt-6">
    <Reveal><Head art={<Trophy />} title="Indian Premier League" sub="The IPL franchises and the Women's Premier League. Pick a side." /></Reveal>
    <Reveal><Chips items={[['m', "Men's · IPL"], ['w', "Women's · WPL"]]} value={g} onChange={setG} /></Reveal>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">{list.map((t, i) => <Reveal key={g + t.code} delay={i * 60}><TeamCard t={t} /></Reveal>)}</div>
  </section>;
}

function IntlSection({ teams }) {
  const [g, setG] = useState('m'), [d, setD] = useState(null), code = g === 'm' ? 'IND' : 'INDW', t = teams.find(x => x.code === code);
  useEffect(() => { setD(null); get(`/api/international/${code}`).then(setD).catch(() => setD({ byFormat: {}, recent: [] })); }, [code]);
  return <section id="india" className="space-y-6 scroll-mt-6">
    <Reveal><Head art={<Globe />} title="India internationals" sub="Tests, ODIs and T20Is against every opponent. Pick a format to dive in." /></Reveal>
    <Reveal><Chips items={[['m', "Men's"], ['w', "Women's"]]} value={g} onChange={setG} /></Reveal>
    {t && <div className="grid md:grid-cols-4 gap-3">
      {['Test', 'ODI', 'T20'].map((f, i) => { const x = d?.byFormat?.[f]; return <Reveal key={code + f} delay={i * 60}><a href={`#/team/${code}?format=${f}`} className="card block p-4 h-full">
        <div className="text-[10px] text-mute">{f === 'T20' ? 'T20I' : f}</div>
        <div className="font-pixel text-xl mt-2" style={{ color: t.color }}>{x ? x.played : '–'}</div><div className="text-xs text-mute mt-1">matches</div>
        <div className="text-xs mt-3">{x ? `${x.won} won · ${x.lost} lost${x.other ? ` · ${x.other} other` : ''}` : d ? 'No data yet' : 'Loading…'}</div></a></Reveal>; })}
      <Reveal delay={180}><a href={`#/team/${code}`} className="card block p-4 h-full" style={{ borderColor: t.color }}>
        <div className="text-[10px] text-mute">ALL FORMATS</div><div className="font-display font-bold mt-2">{t.name}</div><div className="text-xs text-mute mt-2">Squad, record and every match →</div></a></Reveal></div>}
    {d?.recent?.length > 0 && <Reveal><div className="card p-4"><h3 className="font-display font-bold">Recent matches</h3>
  <p className="text-[11px] text-mute">Newest first, grouped by date. “feed” marks results from the live API.</p>
  {[...new Set(d.recent.map(m => m.date))].map(day => <div key={day}>
    <div className="text-[11px] tracking-wide text-mute pt-3 pb-1">{fmtDate(day)}</div>
    {d.recent.filter(m => m.date === day).map(m => { const opp = m.teamA === code ? m.teamB : m.teamA, res = m.winner === code ? 'Won' : m.winner ? 'Lost' : 'No result';
      return <div key={day + opp + m.format} className="flex justify-between gap-3 py-1.5 border-b border-line last:border-0 text-sm">
        <span className="truncate">{m.format === 'T20' ? 'T20I' : m.format} v {opp}{m.margin ? <span className="text-mute text-xs"> · {m.margin.replace(/^(T20|ODI|Test) · /, '')}</span> : null}{m.source === 'live' ? <span className="chip ml-2">feed</span> : null}</span>
        <b className={res === 'Won' ? 'text-lime' : ''}>{res}</b></div>; })}</div>)}</div></Reveal>}
  </section>;
}

function LiveCard({ m }) {
  const [p, setP] = useState(null), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const run = async () => { setErr(''); setBusy(true); try { setP(await pred(m.teamA, m.teamB)); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const a = m.nameA || m.teamA, b = m.nameB || m.teamB, where = m.league === 'Other' ? 'World cricket' : m.league;
  return <div className="card p-4 min-w-0">
    <div className="flex items-center gap-2 text-[10px] text-mute">{m.status === 'live' && <span className="livedot" />}
      <b className={m.status === 'live' ? 'text-lime' : ''}>{m.status === 'live' ? 'LIVE' : `UPCOMING · ${m.startAt ? new Date(m.startAt).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : m.date}`}</b>
      <span className="truncate">{[where, m.format, women(m) ? 'Women' : ''].filter(Boolean).join(' · ')}</span></div>
    {m.confirmed && <span className="chip">✓ 2 feeds</span>}
    <div className="font-display font-bold mt-2 leading-tight">{a} v {b}</div>
    {m.event && <div className="text-[11px] text-mute mt-1 truncate">{m.event}</div>}
    <div className="text-xs text-mute mt-1">{m.score || m.venue || ''}</div>
    <button className="btn mt-3" disabled={busy} onClick={run}>{busy ? 'Gazing…' : 'Predict'}</button>
    {err && <p className="text-xs text-red-400 mt-2">{err}</p>}
    {p?.pA != null && <div className="mt-3"><div className="flex h-2 rounded-full overflow-hidden bg-line"><div className="bg-lime" style={{ width: `${p.pA * 100}%` }} /></div>
      <div className="flex justify-between text-xs mt-1"><b>{a} {Math.round(p.pA * 100)}%</b><b>{b} {Math.round(p.pB * 100)}%</b></div></div>}
  </div>;
}

const LIVE_LIMIT = 3;
function LiveSection({ live }) {
  const [g, setG] = useState('all'), [f, setF] = useState('all'), [all, setAll] = useState(false);
  const list = live.filter(m => (g === 'all' || (g === 'w') === women(m)) && (f === 'all' || m.format === f)), shown = all ? list : list.slice(0, LIVE_LIMIT);
  return <section id="live" className="space-y-6 scroll-mt-6">
    <Reveal><Head art={<Pulse />} title="Live &amp; upcoming" sub="Matches in play right now and fixtures in the next 5 days. Refreshes automatically." /></Reveal>
    <Reveal><div className="flex gap-x-6 gap-y-3 flex-wrap">
      <Chips items={[['all', 'All'], ['m', "Men's"], ['w', "Women's"]]} value={g} onChange={setG} />
      <Chips items={[['all', 'Any format'], ['Test', 'Test'], ['ODI', 'ODI'], ['T20', 'T20']]} value={f} onChange={setF} /></div></Reveal>
    {list.length ? <><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{shown.map(m => <LiveCard key={m._id} m={m} />)}</div>
        {list.length > LIVE_LIMIT && <button className="btn" onClick={() => setAll(!all)}>{all ? 'Show fewer' : `Show all ${list.length}`}</button>}</>
      : <div className="grid"><Duck text="Rain stopped play. Nothing live and nothing scheduled in the next 5 days for this filter." /></div>}
  </section>;
}

const FALLBACK = [
  ['🔴 Red-Ball / First-Class', [['ranji', "Ranji Trophy (Men's)"], ['duleep', "Duleep Trophy (Men's)"], ['irani', "Irani Cup (Men's)"], ['w-multi', "Senior Women's Multi-Day Trophy"]]],
  ['⚪ 50-Over / One Day (List A)', [['vhr', "Vijay Hazare Trophy (Men's)"], ['deodhar', "Deodhar Trophy (Men's)"], ['w-odi', "Senior Women's One Day Trophy"], ['w-odi-zonal', "Senior Women's Inter-Zonal One Day Trophy"]]],
  ['⚡ 20-Over / T20', [['smat', "Syed Mushtaq Ali Trophy (Men's)"], ['w-t20', "Senior Women's T20 Trophy"], ['w-t20-zonal', "Senior Women's Inter-Zonal T20 Trophy"], ['ipl', 'Indian Premier League (IPL)'], ['wpl', "Women's Premier League (WPL)"]]]];

function DomesticSection() {
  const [cat, setCat] = useState(null), [sid, setSid] = useState(''), [data, setData] = useState(null), [up, setUp] = useState([]), [mid, setMid] = useState(''), [p, setP] = useState(null), [busy, setBusy] = useState(false);
  const mk = m => m.key || `${m.date}|${m.teamA}|${m.teamB}`;
  const [catErr, setCatErr] = useState('');
  useEffect(() => {
  const use = c => { setCat(c); const all = c.flatMap(g => g.items); setSid((all.find(x => x.has) || all[0])?.id || ''); };
  get('/api/domestic/catalog').then(c => (c.length ? use(c) : Promise.reject(new Error('empty list'))))
  .catch(e => { setCatErr(e.message); use(FALLBACK.map(([group, items]) => ({ group, items: items.map(([id, label]) => ({ id, label, has: true })) }))); });
  }, []);
  useEffect(() => {
    if (!sid) return; let on = true; setData(null); setUp([]); setMid(''); setP(null);
    get(`/api/domestic/teams?series=${sid}`).then(x => on && setData(x)).catch(() => on && setData({ teams: [], honours: [] }));
    get(`/api/domestic/upcoming?series=${sid}`).then(x => on && setUp(x)).catch(() => on && setUp([]));
    return () => { on = false; };
  }, [sid]);
  const teams = data?.teams ?? null, honours = data?.honours ?? [];
  const names = Object.fromEntries((teams || []).map(t => [t.code, t.name]));
  const nm = (m, k) => (k === 'A' ? m.nameA || names[m.teamA] || m.teamA : m.nameB || names[m.teamB] || m.teamB);
  const sel = up.find(m => mk(m) === mid);
  const predict = async () => { setBusy(true); setP(null); try { setP(await pred(sel.teamA, sel.teamB)); } catch { setP({ err: true }); } finally { setBusy(false); } };
  return <section id="domestic" className="space-y-6 scroll-mt-6">
    <Reveal><Head art={<Ground />} title="Domestic cricket" sub="Pick a tournament to see its teams and champions, and browse what is coming up." /></Reveal>
    <Reveal><div className="flex gap-3 flex-wrap items-center">
      <select value={sid} onChange={e => setSid(e.target.value)} disabled={!cat?.length} className="bg-bg border border-line rounded-full px-3 py-2 text-sm min-w-[16rem] max-w-full">
        {(cat || []).map(g => <optgroup key={g.group} label={g.group}>{g.items.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}</optgroup>)}</select>
      <select value={mid} onChange={e => { setMid(e.target.value); setP(null); }} disabled={!up.length} className="bg-bg border border-line rounded-full px-3 py-2 text-sm min-w-[16rem] max-w-full">
        <option value="">{up.length ? `Upcoming matches (${up.length})` : 'No upcoming matches'}</option>
        {up.map(m => <option key={mk(m)} value={mk(m)}>{fmtShort(m.date)} · {nm(m, 'A')} v {nm(m, 'B')}</option>)}</select>
          {catErr && <p className="text-xs text-red-400">Couldn't load the tournament list from the API ({catErr}), so the default list is shown. Check that the server is running the latest code.</p>}</div></Reveal>
    {data && <div className="card p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
      {honours[0] ? <><span>🏆 <b>Reigning champions:</b> {honours[0].name} <span className="text-mute">({honours[0].season})</span></span>
        {honours.length > 1 && <span className="text-xs text-mute">Previous: {honours.slice(1, 6).map(h => `${h.name} ${h.season}`).join(' · ')}</span>}</>
        : <span className="text-mute">No champions recorded for this tournament yet.</span>}</div>}
    {sel && <div className="card p-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span><b>{nm(sel, 'A')} v {nm(sel, 'B')}</b> <span className="text-mute">· {fmtDate(sel.date)}{sel.venue ? ` · ${sel.venue}` : ''}{sel.stage ? ` · ${sel.stage}` : ''}</span></span>
      <button className="btn" disabled={busy} onClick={predict}>{busy ? 'Gazing…' : 'Predict'}</button>
      {p?.pA != null && <span className="text-xs"><b>{nm(sel, 'A')} {Math.round(p.pA * 100)}%</b> · <b>{nm(sel, 'B')} {Math.round(p.pB * 100)}%</b></span>}
      {p?.err && <span className="text-xs text-red-400">Couldn't predict this one.</span>}</div>}
    {teams === null && sid && <p className="text-sm text-mute">Loading teams…</p>}
    {teams?.length === 0 && <Duck text="Out for a duck! No teams for this tournament yet. It needs Cricsheet data or a live API feed that carries it." />}
    {teams?.length > 0 && data && !data.hasMatches && <p className="text-xs text-mute">These cards come from the champions list. Match, lineup and player data isn't published for this tournament, so team pages will be mostly empty.</p>}
    {teams?.length > 0 && <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">{teams.map((t, i) => <Reveal key={sid + t.code} delay={(i % 5) * 60}><TeamCard t={{ ...t, titles: t.years, champion: t.reigning, champOf: [] }} /></Reveal>)}</div>}
  </section>;
}

function Crystal({ teams }) {
  const [others, setOthers] = useState([]), [a, setA] = useState(''), [b, setB] = useState(''), [toss, setToss] = useState(''), [out, setOut] = useState(null), [h2h, setH2h] = useState(null), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  useEffect(() => { get('/api/ratings').then(x => { const c = new Set(teams.map(t => t.code)); setOthers(Object.keys(x.ratings || {}).filter(k => !c.has(k)).sort()); }).catch(() => {}); }, [teams]);
  const label = v => teams.find(t => t.code === v)?.name ?? v;
  const run = async () => { setErr(''); setOut(null); setBusy(true);
    try { const [o, h] = await Promise.all([pred(a, b, toss), get(`/api/h2h/${encodeURIComponent(a)}/${encodeURIComponent(b)}`).catch(() => null)]);
      await new Promise(r => setTimeout(r, 900)); setOut(o); setH2h(h); }
    catch (e) { setErr(`Couldn't predict: ${e.message}`); } finally { setBusy(false); } };
  const Sel = ({ v, set, ph }) => <select value={v} onChange={e => set(e.target.value)} className="bg-bg border border-line rounded-full px-3 py-2 text-sm flex-1 min-w-[8rem]"><option value="">{ph}</option>
    <optgroup label="IPL, WPL and India">{teams.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}</optgroup>
    {others.length > 0 && <optgroup label="Other teams">{others.map(o => <option key={o} value={o}>{o}</option>)}</optgroup>}</select>;
  return <section className="scroll-mt-6"><Reveal><div className="card p-6 md:p-8 text-center md:text-left">
    <div className="flex flex-wrap items-center gap-5 justify-center md:justify-start"><Orb busy={busy} />
      <div className="flex-1 min-w-[14rem]"><h2 className="font-display font-extrabold text-2xl md:text-3xl">Crystal Ball</h2><p className="text-mute text-sm mt-1">Pick any two teams and let the numbers call it. Odds come from Elo, recent form, toss and venue.</p></div></div>
    <div className="flex gap-2 flex-wrap mt-6"><Sel v={a} set={setA} ph="Team A" /><Sel v={b} set={setB} ph="Team B" />
      <select value={toss} onChange={e => setToss(e.target.value)} className="bg-bg border border-line rounded-full px-3 py-2 text-sm flex-1 min-w-[8rem]"><option value="">Toss: unknown</option>{[a, b].filter(Boolean).map(t => <option key={t} value={t}>{label(t)}</option>)}</select>
      <button className="btn primary" disabled={!a || !b || a === b || busy} onClick={run}>{busy ? 'Gazing…' : 'Predict'}</button></div>
    {err && <p className="text-sm text-red-400 mt-4">{err}</p>}
    {out?.pA != null && <div className="mt-6 rise"><div className="flex h-3 rounded-full overflow-hidden bg-line"><div className="bg-lime transition-all duration-700" style={{ width: `${out.pA * 100}%` }} /></div>
      <div className="flex justify-between text-sm mt-2"><b>{label(a)} {Math.round(out.pA * 100)}%</b><b>{label(b)} {Math.round(out.pB * 100)}%</b></div>
      <p className="text-xs text-mute mt-2">{out.confidence === 'high' ? 'Clear favourites.' : 'Toss-up, grab the popcorn.'} Elo {out.ratings?.[a]} v {out.ratings?.[b]}{h2h ? ` · Head-to-head ${h2h[a]}–${h2h[b]} in ${h2h.played}` : ''}</p></div>}
  </div></Reveal></section>;
}

/* ---------- team page ---------- */
// Builds stats from per-match rows (used for year-wise figures).
const agg = rs => {
  if (!rs.length) return null;
  let m = 0, runs = 0, balls = 0, outs = 0, f = 0, h = 0, hs = 0, inns = 0, wk = 0, conc = 0, ob = 0, bw = 0, bc = 999;
  for (const r of rs) { m++;
    if (r.balls || r.out) { inns++; runs += r.runs; balls += r.balls; if (r.out) outs++; if (r.runs >= 100) h++; else if (r.runs >= 50) f++; hs = Math.max(hs, r.runs); }
    if (r.ob) { wk += r.wk; conc += r.conc; ob += r.ob; if (r.wk > bw || (r.wk === bw && r.conc < bc)) { bw = r.wk; bc = r.conc; } } }
  const r2 = x => Math.round(x * 100) / 100;
  return { m, bat: { runs, avg: inns ? r2(runs / (outs || 1)) : null, sr: balls ? r2(runs / balls * 100) : null, fifties: f, hundreds: h, hs: inns ? hs : '-' },
    bowl: { wkts: wk, econ: ob ? r2(conc / (ob / 6)) : null, avg: wk ? r2(conc / wk) : null, best: ob ? `${bw}/${bc === 999 ? 0 : bc}` : '-' } };
};

function PlayerModal({ id, team, onClose }) {
  const [p, setP] = useState(null), [rows, setRows] = useState([]), [tab, setTab] = useState('League'), [yr, setYr] = useState('career'), [badges, setBadges] = useState([]), [saved, setSaved] = useState(false);
  useEffect(() => { get(`/api/players/${id}`).then(setP); get(`/api/players/${id}/seasons`).then(setRows).catch(() => setRows([])); get(`/api/players/${id}/badges`).then(setBadges).catch(() => {}); }, [id]);
  const ALL = [['Test', 'Test'], ['ODI', 'ODI'], ['T20', 'T20'], ['League', 'IPL / WPL'], ['Domestic', 'Domestic']];
  // The year is global. Format tabs only appear for formats the player actually has data for in that year.
  const tabs = !p ? [] : ALL.filter(([a]) => (yr === 'career' ? p.stats?.[a] || rows.some(r => r.tab === a) : rows.some(r => r.tab === a && r.season === yr)));
  const years = [...new Set(rows.map(r => r.season))].sort().reverse();
  useEffect(() => { if (tabs.length && !tabs.some(([a]) => a === tab)) setTab(tabs[0][0]); }, [p, rows, yr, tab]);
  if (!p) return null;
  const k = kindOf(p.role), tabRows = rows.filter(r => r.tab === tab);
  const s = yr === 'career' ? (p.stats?.[tab] ?? agg(tabRows)) : agg(tabRows.filter(r => r.season === yr)), b = s?.bat || {}, w = s?.bowl || {};
  const save = () => post('/api/bookmarks', { userId: 'guest', kind: 'player', refId: id }).then(() => setSaved(true)).catch(() => {});
  const Row = ([a, v]) => <div key={a} className="flex justify-between py-1.5 border-b border-line text-sm"><span className="text-mute">{a}</span><b>{v ?? '–'}</b></div>;
  return <div className="fixed inset-0 z-30 bg-black/70 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
    <div role="dialog" aria-modal className="sheet card w-full sm:max-w-lg max-h-[92vh] overflow-auto rounded-b-none sm:rounded-b-2xl p-5" style={{ borderTop: `3px solid ${team.color}` }} onClick={e => e.stopPropagation()}>
      <div className="flex gap-4 items-center"><PixelAvatar name={p.name} color={team.color} accent={team.accent} size={64} />
        <div className="min-w-0 flex-1"><h2 className="font-display font-extrabold text-xl truncate">{p.name}</h2><p className="text-sm text-mute">{p.role} · {team.code}</p><Tags p={p} /><p className="text-xs mt-2 text-lime">{form(p.recent)}</p></div>
        <div className="text-right"><div className="font-pixel text-2xl text-lime">{p.impact}</div><div className="text-[10px] text-mute">IMPACT</div></div></div>
      {badges.length > 0 && <div className="flex gap-2 mt-3 flex-wrap">{badges.map(x => <span key={x} className="chip text-gold border-gold/40">{x}</span>)}</div>}
      {k !== 'bowl' && <><p className="mt-4 text-xs text-mute">Last 5 innings</p>
        <div className="flex gap-2 mt-1">{p.recent.map((r, i) => <span key={i} className="font-pixel text-[11px] px-2 py-2 rounded-lg bg-bg border border-line">{r}</span>)}</div></>}
      <div className="flex items-center gap-2 mt-4"><span className="text-xs text-mute">Year</span>
        <select value={yr} onChange={e => setYr(e.target.value)} className="bg-bg border border-line rounded-full px-3 py-1.5 text-sm"><option value="career">Career</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
        {yr !== 'career' && s?.m != null && <span className="text-xs text-mute">{s.m} matches</span>}</div>
      <div className="flex gap-2 my-3 flex-wrap">{tabs.map(([a, l]) => <button key={a} className="btn" aria-pressed={tab === a} onClick={() => setTab(a)}>{l}</button>)}</div>
      {!s ? <p className="text-sm text-mute">Nothing recorded for this selection.</p> :
        <div className={`grid gap-x-6 ${k === 'both' ? 'sm:grid-cols-2' : ''}`}>
          {k !== 'bowl' && <div><h3 className="text-xs text-mute mb-1">Batting</h3>{Object.entries({ Runs: b.runs, Average: b.avg, 'Strike rate': b.sr, '50s / 100s': b.fifties != null ? `${b.fifties} / ${b.hundreds}` : null, 'High score': b.hs }).map(Row)}</div>}
          {k !== 'bat' && <div><h3 className={`text-xs text-mute mb-1 ${k === 'both' ? 'mt-4 sm:mt-0' : ''}`}>Bowling</h3>{Object.entries({ Wickets: w.wkts, Economy: w.econ, Average: w.avg, 'Best figures': w.best }).map(Row)}</div>}</div>}
      {yr !== 'career' && <p className="text-[11px] text-mute mt-3">Year figures are built from match totals, so Test innings are combined per match.</p>}
      <div className="flex gap-2 mt-5"><button className="btn primary" onClick={onClose}>Back to the pavilion</button><button className="btn" disabled={saved} onClick={save}>{saved ? 'Saved' : 'Bookmark'}</button></div>
    </div></div>;
}

const XiLine = x => <div key={x.name} className="flex justify-between gap-3 py-1 border-b border-line/50 last:border-0">
  <span className="truncate text-mute">{x.order < 99 ? `${x.order}. ` : '· '}<span className="text-ink">{x.name}</span></span>
  <span className="shrink-0 tabular-nums text-xs text-right">
    {x.runs != null && (x.balls || x.out ? <span><b className="text-ink">{x.runs}{x.out ? '' : '*'}</b> <span className="text-mute">({x.balls})</span></span> : <span className="text-mute">DNB</span>)}
    {x.ob > 0 && <span className="ml-2 text-mute">{x.wk}/{x.conc} ({Math.floor(x.ob / 6)}.{x.ob % 6})</span>}
    <span className="ml-2 text-lime" title="Impact score">{Number(x.impact).toFixed(1)}</span></span></div>;

function SquadCard({ p, t, onOpen }) {
  const k = kindOf(p.role), c = p.career || { m: p.matches, runs: p.runs, avg: p.avg, sr: p.sr, wkts: p.wkts, econ: p.econ };   // career to date, falls back to the season
  const cells = k === 'bowl' ? [['M', c.m], ['WKTS', c.wkts], ['ECON', c.econ]]
    : k === 'bat' ? [['M', c.m], ['RUNS', c.runs], ['AVG', c.avg], ['SR', c.sr]]
    : [['RUNS', c.runs], ['SR', c.sr], ['WKTS', c.wkts], ['ECON', c.econ]];
  return <button disabled={!p.id} onClick={() => onOpen(p.id)} className="card p-4 text-left w-full h-full">
    <div className="flex justify-between"><span className="chip">{p.role || 'Player'}</span><span className="font-pixel text-lg text-lime">{p.impact}</span></div>
    <div className="flex items-center gap-3 mt-3"><PixelAvatar name={p.name} color={t.color} accent={t.accent} size={40} />
      <div className="min-w-0"><div className="font-display font-bold truncate">{p.name}</div><div className="text-xs text-mute">{p.jersey ? `#${p.jersey}` : ''}</div></div></div>
    <Tags p={p} />
    <div className="text-[10px] text-mute mt-3">{p.career ? 'CAREER TO DATE' : 'THIS SELECTION'}</div>
    <div className="grid gap-1 mt-1 pt-2 border-t border-line" style={{ gridTemplateColumns: `repeat(${cells.length}, 1fr)` }}>{cells.map(([a, b]) => <Stat key={a} k={a} v={b} />)}</div>
    <div className="text-[11px] text-mute mt-2">This season: {k === 'bowl' ? `${p.wkts} wkts` : `${p.runs} runs`} in {p.matches} {p.matches === 1 ? 'match' : 'matches'}</div></button>;
}

function TeamPage({ code, format }) {
  const [d, setD] = useState(null), [seasons, setSeasons] = useState([]), [season, setSeason] = useState(null), [squad, setSquad] = useState(null), [basis, setBasis] = useState(null), [matches, setMatches] = useState([]), [pid, setPid] = useState(null), [err, setErr] = useState(''), [tick, setTick] = useState(0);
  useEffect(() => { let on = true; setSeason(null); setSquad(null); setBasis(null); setD(null); setErr('');
    get(`/api/teams/${code}/seasons${format ? `?format=${format}` : ''}`)
      .then(s => { if (!on) return; setSeasons(s); setSeason(s[0] || 'all'); })
      .catch(() => { if (!on) return; setSeasons([]); setSeason('all'); });
    return () => { on = false; }; }, [code, format, tick]);
  useEffect(() => { if (!season) return; let on = true; const q = new URLSearchParams({ season }); if (format) q.set('format', format); setSquad(null); setBasis(null);
    get(`/api/teams/${code}?${q}`).then(x => { if (on) { setD(x); setErr(''); } }).catch(e => on && setErr(e.message || 'request failed'));
    get(`/api/teams/${code}/matches?${q}`).then(x => on && setMatches(x)).catch(() => on && setMatches([]));
    get(`/api/teams/${code}/squad?${q}`).then(x => { if (on) { setSquad(x.players); setBasis(x.basis); } }).catch(() => on && setSquad([]));
    return () => { on = false; }; }, [code, season, format]);
  if (err) return <div className="pt-28 text-center text-mute space-y-3"><p>Couldn't load this team ({err}).</p>
    <div className="flex gap-2 justify-center"><button className="btn" onClick={() => setTick(t => t + 1)}>Try again</button><a className="btn" href="#">Back home</a></div></div>;
  if (!d) return <p className="pt-28 text-center text-mute">Loading…</p>;
  const t = d.team, intl = t.league === 'International', label = season === 'all' ? 'all seasons' : season;
  return <main className="max-w-6xl mx-auto px-4 pt-20 pb-20 space-y-8 rise">
    <div className="flex gap-2 flex-wrap"><a href="#" className="btn">← Home</a><BmButton kind="team" refId={t.code} /></div>
    <div className={`card p-6 ${t.champion ? 'champ' : ''}`} style={{ background: `linear-gradient(135deg, ${t.color}2b, transparent 60%)` }}>
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="font-display font-extrabold text-3xl md:text-4xl">{t.titles?.length ? '🏆 ' : ''}{t.name}</h1>
        <div className="mt-2"><span className="chip mr-2">{t.league}{format ? ` · ${format}` : ''}</span><Cups years={t.titles} />{t.champion && <span className="chip ml-2 text-gold border-gold/40">Reigning champions{t.champOf?.length ? ` · ${t.champOf.join(', ')}` : ''}</span>}</div></div>
        <select value={season || ''} onChange={e => setSeason(e.target.value)} className="bg-bg border border-line rounded-full px-3 py-2 text-sm">{seasons.map(s => <option key={s}>{s}</option>)}<option value="all">All seasons</option></select></div>
      {intl && <div className="flex gap-2 flex-wrap mt-4">{['', 'Test', 'ODI', 'T20'].map(f => <a key={f} href={`#/team/${code}${f ? `?format=${f}` : ''}`} className="btn" aria-pressed={format === f}>{f || 'All formats'}</a>)}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6"><Stat k="PLAYED" v={d.record.played} /><Stat k="WON" v={d.record.won} /><Stat k="LOST" v={d.record.lost} /><Stat k="TOSS ➜ WIN" v={d.toss.won ? `${d.toss.convertedToWin}/${d.toss.won}` : null} /></div>
      <div className="flex items-center gap-2 mt-5 text-xs text-mute">Last 5 {d.recent.map((x, i) => <span key={i} className={`font-pixel text-[10px] px-2 py-1 rounded ${x === 'W' ? 'bg-lime text-bg' : 'bg-line'}`}>{x}</span>)}</div>
      <p className="text-xs text-mute mt-3">{Object.entries(d.venues).sort((a, b) => b[1].p - a[1].p).slice(0, 4).map(([v, x]) => `${v} ${x.w}/${x.p}`).join(' · ')}</p></div>

    <div><h2 className="font-display font-bold text-xl">Squad · {label}{format ? ` · ${format}` : ''}</h2>
      <p className="text-xs text-mute mb-3">{basis ? `No lineups are recorded for ${label} yet. Showing ${t.name}'s last ${basis.matches} matches that have lineups (${basis.season}, up to ${basis.last}).` : `Players who played for ${t.name} in ${season === 'all' ? 'this selection' : 'this season'}. Cards show career totals up to ${season === 'all' ? 'today' : 'the end of this season'}; the small line shows the season alone.`}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {squad && !squad.length && <Duck text="Nobody walked out here. Out for a duck!" />}
        {(squad || []).map((p, i) => <Reveal key={p.name} delay={(i % 4) * 60}><SquadCard p={p} t={t} onOpen={n => { location.hash = `#/player/${encodeURIComponent(n)}${t.domestic ? '?ctx=domestic' : ''}`; }} /></Reveal>)}
      </div>
    </div>

    <div className="card p-5"><h2 className="font-display font-bold text-xl mb-1">Match lookback</h2>
      <p className="text-[11px] text-mute mb-2">Per player: runs (balls faced), wickets/runs conceded (overs), and impact score in green. * means not out, DNB means did not bat.</p>
      {!matches.length && <p className="text-sm text-mute">No matches found.</p>}
      {matches.map(m => <details key={m.key || m.date + m.teamA} className="border-b border-line py-3"><summary className="cursor-pointer text-sm"><span className="text-mute">{m.date}</span> · {m.teamA} v {m.teamB} · <b>{m.winner ? `${m.winner} won ${m.margin}` : (m.margin || 'No result')}</b></summary>
        <p className="text-xs text-mute mt-2">{m.venue}{m.playerOfMatch ? ` · Player of the match: ${m.playerOfMatch}` : ''}</p>
        <div className="grid sm:grid-cols-2 gap-6 text-sm mt-3">{[['xiA', m.teamA], ['xiB', m.teamB]].map(([k, c]) => <div key={k}><b>{c} XI</b>
          <div className="mt-1">{m[k]?.length ? m[k].map(XiLine) : <div className="text-mute">Not available.</div>}</div></div>)}</div></details>)}</div>
    {pid && <PlayerModal id={pid} team={t} onClose={() => setPid(null)} />}
  </main>;
}

function WakeNotice() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let done = false; const t = setTimeout(() => !done && setSlow(true), 3000);
    get('/api/health').catch(() => {}).finally(() => { done = true; clearTimeout(t); setSlow(false); });
    return () => clearTimeout(t);
  }, []);
  return slow ? <div className="fixed bottom-4 inset-x-4 z-40 mx-auto max-w-md card p-3 text-sm text-center">⏳ Waking up the free-tier server. The first load can take up to a minute.</div> : null;
}

/* ---------- bookmarks, favourites, search, nav ---------- */
const BmCtx = createContext({ has: () => false, toggle: () => {}, list: [], uid: '' });
const useBm = () => useContext(BmCtx);
const getUid = () => { try { let u = localStorage.getItem('cc_uid');
  if (!u) { u = crypto.randomUUID ? crypto.randomUUID() : `u${Date.now()}${Math.random().toString(36).slice(2)}`; localStorage.setItem('cc_uid', u); } return u; } catch { return 'guest'; } };
function BmProvider({ children }) {
  const uid = getUid(), [data, setData] = useState({ players: [], teams: [] });
  const refresh = () => get(`/api/bookmarks/${uid}`).then(setData).catch(() => {});
  useEffect(() => { refresh(); }, []);
  const list = [...data.players.map(p => ({ kind: 'player', refId: p.name })), ...data.teams.map(t => ({ kind: 'team', refId: t.code }))];
  const has = (kind, refId) => list.some(b => b.kind === kind && b.refId === refId);
  const toggle = async (kind, refId) => {
    const on = has(kind, refId);
    setData(d => (kind === 'player'
      ? { ...d, players: on ? d.players.filter(p => p.name !== refId) : [...d.players, { name: refId }] }
      : { ...d, teams: on ? d.teams.filter(t => t.code !== refId) : [...d.teams, { code: refId, name: refId, color: '#2E86DE', accent: '#14213D', titles: [], league: '' }] }));
    try { await fetch(`${API}/api/bookmarks`, { method: on ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: uid, kind, refId }) }); } catch { /* resync below */ }
    refresh();                                              // re-sync only after the server has answered
  };
  return <BmCtx.Provider value={{ has, toggle, list, data, uid }}>{children}</BmCtx.Provider>;
}

function BmButton({ kind, refId }) {
  const { has, toggle } = useBm(), on = has(kind, refId);
  return <button type="button" className="btn" aria-pressed={on} onClick={e => { e.preventDefault(); e.stopPropagation(); toggle(kind, refId); }}>
    {kind === 'team' ? (on ? '♥ Favourite' : '♡ Favourite') : (on ? '★ Bookmarked' : '☆ Bookmark')}</button>;
}

function SearchBox({ onPick }) {
  const [q, setQ] = useState(''), [res, setRes] = useState([]), [open, setOpen] = useState(false), ref = useRef();
  useEffect(() => { if (q.trim().length < 2) { setRes([]); return; } let on = true;
    const t = setTimeout(() => get(`/api/players/search?q=${encodeURIComponent(q.trim())}`).then(x => on && setRes(x)).catch(() => on && setRes([])), 250);
    return () => { on = false; clearTimeout(t); }; }, [q]);
  useEffect(() => { const f = e => !ref.current?.contains(e.target) && setOpen(false); document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f); }, []);
  const pick = () => { setQ(''); setRes([]); setOpen(false); onPick?.(); };
  return <div ref={ref} className="relative w-full">
    <input value={q} onChange={e => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder="Search any player…" aria-label="Search players"
      className="w-full bg-panel border border-line rounded-full px-4 py-2 text-sm" />
    {open && q.trim().length >= 2 && <div className="absolute left-0 right-0 mt-2 card p-1 max-h-80 overflow-auto z-40">
      {res.length ? res.map(p => <a key={p.name + p._id} href={`#/player/${encodeURIComponent(p.name)}`} onClick={pick} className="flex justify-between gap-3 px-3 py-2 rounded-lg hover:bg-line text-sm">
        <span className="truncate">{p.name}</span><span className="text-xs text-mute shrink-0">{p.team || p.national || ''}{p.role ? ` · ${p.role}` : ''}</span></a>)
        : <div className="px-3 py-2 text-sm text-mute">No players found. Try the surname.</div>}</div>}
  </div>;
}

function NavBar() {
  const [open, setOpen] = useState(false), { list } = useBm(), close = () => setOpen(false);
  const links = [['#', 'Home'], ['#/matches', 'Matches'], ['#/bookmarks', `Bookmarks${list.length ? ` (${list.length})` : ''}`]];
  return <header className="sticky top-0 z-30 backdrop-blur bg-bg/85 border-b border-line">
    <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-4">
      <a href="#" className="font-display font-extrabold text-lg shrink-0">Crease Club</a>
      <div className="hidden md:block flex-1 max-w-md"><SearchBox /></div>
      <nav className="hidden md:flex items-center gap-6 ml-auto text-sm text-mute">{links.map(([h, l]) => <a key={h} href={h} className="hover:text-ink">{l}</a>)}</nav>
      <button className="md:hidden ml-auto btn !px-3" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg></button></div>
    {open && <div className="md:hidden border-t border-line px-4 py-3 space-y-3"><SearchBox onPick={close} />
      {links.map(([h, l]) => <a key={h} href={h} onClick={close} className="block py-1">{l}</a>)}</div>}
  </header>;
}

/* ---------- player page ---------- */
const TABS = [['Test', 'Test'], ['ODI', 'ODI'], ['T20', 'T20I'], ['League', 'IPL / WPL'], ['Domestic', 'Domestic']];
const cellsFor = (s, kind) => { const b = s?.bat || {}, w = s?.bowl || {};
  return [['M', s?.m],
    ...(kind !== 'bowl' ? [['Runs', b.runs], ['Avg', b.avg], ['SR', b.sr], ['100/50', b.hundreds != null ? `${b.hundreds}/${b.fifties}` : null], ['HS', b.hs]] : []),
    ...(kind !== 'bat' ? [['Wkts', w.wkts], ['Econ', w.econ], ['Bowl avg', w.avg], ['Best', w.best]] : [])]; };
function StatTable({ rows, kind, first }) {
  const head = cellsFor(null, kind).map(c => c[0]);
  return <div className="overflow-x-auto"><table className="w-full text-sm min-w-[32rem]"><thead><tr className="text-left text-[11px] text-mute">
    <th className="py-2 pr-3 font-medium">{first}</th>{head.map(h => <th key={h} className="py-2 px-2 font-medium text-right">{h}</th>)}</tr></thead>
    <tbody>{rows.map(([label, s, strong]) => <tr key={label} className={`border-t border-line ${strong ? 'text-lime font-semibold' : ''}`}>
      <td className="py-2 pr-3 whitespace-nowrap">{label}</td>{cellsFor(s, kind).map(([h, v]) => <td key={h} className="py-2 px-2 text-right tabular-nums">{v ?? '–'}</td>)}</tr>)}</tbody></table></div>;
}

function PlayerPage({ name, ctx }) {
  const [p, setP] = useState(null), [err, setErr] = useState(false), [tab, setTab] = useState(null), [yr, setYr] = useState('career'), [badges, setBadges] = useState([]);
  const dom = ctx === 'domestic', lab = k => TABS.find(x => x[0] === k)?.[1] ?? k;
  useEffect(() => { let on = true; setP(null); setErr(false); setTab(null); setYr('career'); setBadges([]);
    get(`/api/players/by-name/${encodeURIComponent(name)}`).then(x => { if (!on) return; setP(x); get(`/api/players/${x._id}/badges`).then(b => on && setBadges(b)).catch(() => {}); }).catch(() => on && setErr(true));
    return () => { on = false; }; }, [name]);
  const allTabs = p ? TABS.filter(([k]) => p.stats?.[k] && (!dom || k === 'Domestic')) : [];
  const years = p ? [...new Set(Object.keys(p.years || {}).filter(y => allTabs.some(([k]) => p.years[y]?.[k])))].sort().reverse() : [];
  const tabs = allTabs.filter(([k]) => yr === 'career' || p?.years?.[yr]?.[k]), tabKey = tabs.map(x => x[0]).join();
  useEffect(() => { if (tabs.length && !tabs.some(([k]) => k === tab)) setTab(tabs[0][0]); }, [tabKey, tab]);
  if (err) return <p className="pt-24 text-center text-mute">Couldn't find that player. <a className="text-lime" href="#">Back home</a></p>;
  if (!p) return <p className="pt-24 text-center text-mute">Loading…</p>;
  const t = p.teamDoc || { color: '#2E86DE', accent: '#14213D', name: '' }, kind = kindOf(p.role);
  const s = tab ? (yr === 'career' ? p.stats?.[tab] : p.years?.[yr]?.[tab]) : null;
  const best = tab ? (yr === 'career' ? p.best?.[tab] : p.bestY?.[yr]?.[tab]) : null;
  const rows = tab ? [['Career', p.stats[tab], yr === 'career'], ...Object.keys(p.years || {}).filter(y => p.years[y]?.[tab]).sort().reverse().map(y => [y, p.years[y][tab], yr === y])] : [];
  const when = yr === 'career' ? 'career' : yr;
  return <main className="max-w-6xl mx-auto px-4 pt-8 pb-20 space-y-6 rise">
    <div className="flex gap-2 flex-wrap"><a href="#" className="btn">← Home</a>{dom && <a href={`#/player/${encodeURIComponent(name)}`} className="btn">Show all formats</a>}</div>
    <div className="card p-6" style={{ background: `linear-gradient(135deg, ${t.color}2b, transparent 60%)` }}>
      <div className="flex flex-wrap items-center gap-5"><PixelAvatar name={p.name} color={t.color} accent={t.accent} size={88} />
        <div className="min-w-0 flex-1"><h1 className="font-display font-extrabold text-3xl">{p.name}</h1>
          <p className="text-mute text-sm mt-1">{p.role}{t.name ? ` · ${t.name}` : ''}{dom ? ' · Domestic view' : ''}</p><Tags p={p} />
          {badges.length > 0 && <div className="flex gap-2 flex-wrap mt-2">{badges.map(x => <span key={x} className="chip text-gold border-gold/40">{x}</span>)}</div>}</div>
        <div className="flex flex-col items-end gap-3"><BmButton kind="player" refId={p.name} />
          <div className="text-right"><div className="font-pixel text-3xl text-lime">{p.impact}</div><div className="text-[10px] text-mute">IMPACT</div></div></div></div>
      <p className="text-[11px] text-mute mt-4">Ball-by-ball records held: {p.first?.slice(0, 4)}–{p.last?.slice(0, 4)}. Matches outside the dataset aren't counted, so totals for older careers are lower than official figures.</p>
      {dom && p.domThrough && <p className="text-[11px] text-gold mt-2">Domestic match data in the dataset runs through {p.domThrough}, so later seasons are not counted.</p>}
      </div>
      
    {!p.years && <div className="card p-4 text-sm text-gold">This player was saved with the old format. Run <code>npm run import:all</code> in <code>server/</code> to build year-wise stats and best knocks.</div>}
    {!tab ? <div className="grid"><Duck text={dom ? 'No domestic matches recorded for this player.' : 'No recorded matches for this player yet.'} /></div> : <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs text-mute">Year</label>
        <select value={yr} onChange={e => setYr(e.target.value)} className="bg-bg border border-line rounded-full px-3 py-2 text-sm"><option value="career">Career</option>{years.map(y => <option key={y} value={y}>{y}</option>)}</select>
        <div className="flex gap-2 flex-wrap">{tabs.map(([k, l]) => <button key={k} className="btn" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div></div>

      <div className="card p-5"><h2 className="font-display font-bold text-lg mb-2">{yr === 'career' ? 'Career' : yr} · {lab(tab)}</h2>
        {s ? <StatTable first="Period" kind={kind} rows={[[yr === 'career' ? 'Career' : yr, s, true]]} /> : <p className="text-sm text-mute">Nothing recorded for this selection.</p>}</div>

      {kind === 'bowl' ? <div className="card p-5"><h2 className="font-display font-bold text-lg">Best bowling · {when}</h2>
          <p className="font-pixel text-2xl text-lime mt-2">{s?.bowl?.best ?? '–'}</p><p className="text-xs text-mute mt-1">Wickets/runs in an innings. Batting knocks aren't shown for bowlers.</p></div>
        : best ? <div className="card p-5"><div className="flex flex-wrap items-baseline gap-x-4 gap-y-1"><h2 className="font-display font-bold text-lg">Best knock · {when}</h2>
            <span className="font-pixel text-2xl text-lime">{best.runs}{best.out ? '' : '*'}</span>
            <span className="text-mute text-sm">off {best.balls} balls{best.balls ? ` · SR ${Math.round(best.runs / best.balls * 100)}` : ''}</span></div>
          <p className="text-xs text-mute mt-1">{fmtDate(best.date)} · v {best.opp}{best.venue ? ` · ${best.venue}` : ''}{best.result ? ` · ${best.result}` : ''}{best.event ? ` · ${best.event}` : ''}</p>
          <div className="grid sm:grid-cols-2 gap-6 mt-4">
            <div><h3 className="text-xs text-lime mb-2">STRENGTHS IN THIS INNINGS</h3><ul className="space-y-2 text-sm">{best.strengths?.map(x => <li key={x}>✅ {x}</li>)}</ul></div>
            <div><h3 className="text-xs text-gold mb-2">WEAKNESSES IN THIS INNINGS</h3><ul className="space-y-2 text-sm">{best.weaknesses?.map(x => <li key={x}>⚠️ {x}</li>)}</ul></div></div>
          <p className="text-[11px] text-mute mt-4">Derived from the ball-by-ball record (runs, dot balls, boundaries, over phases, bowlers faced). It has no shot direction or bowler-type data.</p></div>
        : <div className="card p-5 text-sm text-mute">No batting innings recorded for this selection.</div>}

      <div className="card p-5"><h2 className="font-display font-bold text-lg mb-2">Year by year · {lab(tab)}</h2><StatTable first="Year" kind={kind} rows={rows} /></div>
    </>}
  </main>;
}

function BookmarksPage() {
  const { data, toggle } = useBm();
  return <main className="max-w-6xl mx-auto px-4 pt-8 pb-20 space-y-12 rise">
    <div><h1 className="font-display font-extrabold text-3xl">Bookmarks</h1><p className="text-mute text-sm mt-1">Saved in this browser. There's no login, so another device has its own list.</p></div>
    <section className="space-y-5"><h2 className="font-display font-bold text-lg">Favourite teams</h2>
      {!data.teams.length && <div className="grid"><Duck text="No favourite teams yet. Open a team and tap ♡ Favourite." /></div>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 items-start">{data.teams.map(t => <div key={t.code} className="flex flex-col gap-3">
        <TeamCard t={t} fit /><button className="btn w-full" onClick={() => toggle('team', t.code)}>Remove</button></div>)}</div></section>
    <section className="space-y-5"><h2 className="font-display font-bold text-lg">Saved players</h2>
      {!data.players.length && <div className="grid"><Duck text="No saved players yet. Search a player and tap ☆ Bookmark." /></div>}
      {data.players.length > 0 && <div className="card px-4">{data.players.map(p => <div key={p.name} className="flex items-center justify-between gap-3 py-3 border-b border-line last:border-0">
        <a href={`#/player/${encodeURIComponent(p.name)}`} className="min-w-0 hover:text-lime"><span className="font-display font-bold">{p.name}</span><span className="text-xs text-mute ml-2">{p.team || p.national || ''}{p.role ? ` · ${p.role}` : ''}</span></a>
        <button className="btn" onClick={() => toggle('player', p.name)}>Remove</button></div>)}</div>}</section>
  </main>;
}

const COMP_OPTS = [['ipl', 'IPL · Men'], ['wpl', 'WPL · Women'], ['ind-men', "India · Men's internationals"], ['ind-women', "India · Women's internationals"]];
function MatchesPage({ teams }) {
  const [comp, setComp] = useState('ipl'), [years, setYears] = useState([]), [year, setYear] = useState(''), [ms, setMs] = useState(null);
  const nameOf = c => teams.find(t => t.code === c)?.name || c;
  useEffect(() => { let on = true; setYears([]); setYear(''); setMs(null);
    get(`/api/matches/years?comp=${comp}`).then(y => { if (on) { setYears(y); setYear(y[0] || ''); if (!y.length) setMs([]); } }).catch(() => on && setMs([]));
    return () => { on = false; }; }, [comp]);
  useEffect(() => { if (!year) return; let on = true; setMs(null);
    get(`/api/matches?comp=${comp}&year=${year}`).then(x => on && setMs(x)).catch(() => on && setMs([]));
    return () => { on = false; }; }, [comp, year]);
  const Side = ({ code, c }) => <div className="min-w-0"><div className="text-xs text-mute mb-1">{nameOf(code)}</div>
    {c?.bat && <div className="text-sm">🏏 {c.bat.name} <b>{c.bat.runs}{c.bat.out ? '' : '*'}</b> <span className="text-mute">({c.bat.balls})</span></div>}
    {c?.bowl && <div className="text-sm">🎯 {c.bowl.name} <b>{c.bowl.wk}/{c.bowl.conc}</b> <span className="text-mute">({Math.floor(c.bowl.ob / 6)}.{c.bowl.ob % 6} ov)</span></div>}
    {!c?.bat && !c?.bowl && <div className="text-xs text-mute">No lineup recorded.</div>}</div>;
  const result = m => (m.winner ? `${nameOf(m.winner)} won ${(m.margin || '').replace(/^(T20|ODI|Test) · /, '')}` : (m.margin || 'No result'));
  return <main className="max-w-6xl mx-auto px-4 pt-8 pb-20 space-y-6 rise">
    <div><h1 className="font-display font-extrabold text-3xl">Match summaries</h1><p className="text-mute text-sm mt-1">Every result with venue and the key performers. Pick a competition and a year.</p></div>
    <div className="flex gap-3 flex-wrap">
      <select value={comp} onChange={e => setComp(e.target.value)} className="bg-bg border border-line rounded-full px-3 py-2 text-sm min-w-[14rem]">{COMP_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select value={year} onChange={e => setYear(e.target.value)} disabled={!years.length} className="bg-bg border border-line rounded-full px-3 py-2 text-sm">{years.map(y => <option key={y}>{y}</option>)}</select>
      {ms && <span className="text-xs text-mute self-center">{ms.length} matches</span>}</div>
    {ms === null && <p className="text-sm text-mute">Loading…</p>}
    {ms?.length === 0 && <div className="grid"><Duck text="No matches recorded for this selection." /></div>}
    {ms?.length > 0 && <div className="card px-4">{ms.map(m => <details key={m.key || m.date + m.teamA} className="border-b border-line last:border-0 py-3">
      <summary className="cursor-pointer flex flex-wrap justify-between gap-x-4 gap-y-1 text-sm"><span><span className="text-mute">{fmtShort(m.date)}</span> · <b>{nameOf(m.teamA)} v {nameOf(m.teamB)}</b>{m.stage ? <span className="chip ml-2">{m.stage}</span> : null}</span>
        <span className="text-mute">{result(m)}</span></summary>
      <p className="text-xs text-mute mt-3">{m.venue || 'Venue not recorded'}{m.playerOfMatch ? ` · Player of the match: ${m.playerOfMatch}` : ''}</p>
      <div className="grid sm:grid-cols-2 gap-5 mt-3"><Side code={m.teamA} c={m.a} /><Side code={m.teamB} c={m.b} /></div></details>)}</div>}
  </main>;
}

/* ---------- app ---------- */
export default function App() {
  const hash = useHash(), rt = route(hash), [ready, setReady] = useState(!!rt), [teams, setTeams] = useState([]), [live, setLive] = useState([]);
  useEffect(() => { if (ready) return; const quick = matchMedia('(prefers-reduced-motion: reduce)').matches; const t = setTimeout(() => setReady(true), quick ? 0 : 3600); return () => clearTimeout(t); }, [ready]);
  useEffect(() => { document.body.style.overflow = ready ? '' : 'hidden'; }, [ready]);
  useEffect(() => { get('/api/teams?domestic=false').then(setTeams).catch(() => {}); }, []);
  useEffect(() => { const load = () => get('/api/live').then(setLive).catch(() => {}); load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, []);
  return <BmProvider><div className="min-h-screen">
    {typeof WakeNotice === 'function' && <WakeNotice />}
    <NavBar />
      {rt?.type === 'team' ? <TeamPage code={rt.code} format={rt.format} />
      : rt?.type === 'player' ? <PlayerPage name={rt.name} ctx={rt.ctx} />
      : rt?.type === 'matches' ? <MatchesPage teams={teams} />
      : rt?.type === 'bookmarks' ? <BookmarksPage />
      : <>
        <Hero ready={ready} live={live} />
        {ready && <main className="rise max-w-6xl mx-auto px-4 pb-24 space-y-24"><IplSection teams={teams} /><Quip n={0} /><IntlSection teams={teams} /><Quip n={1} /><LiveSection live={live} /><DomesticSection /><Quip n={2} /><Crystal teams={teams} /></main>}</>}
    {(ready || rt) && <Footer />}
  </div></BmProvider>;
}