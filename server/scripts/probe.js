import 'dotenv/config';
const key = process.env.CRICKETDATA_KEY;
if (!key) { console.error('Set CRICKETDATA_KEY in .env first'); process.exit(1); }
for (const q of ['Ranji', 'Vijay Hazare', 'Duleep', 'Syed Mushtaq', 'Deodhar', 'Irani']) {
  const j = await fetch(`https://api.cricapi.com/v1/series?apikey=${key}&offset=0&search=${encodeURIComponent(q)}`).then(r => r.json());
  console.log(`\n"${q}" -> ${j.status}${j.reason ? ` (${j.reason})` : ''} | hits ${j.info?.hitsToday}/${j.info?.hitsLimit}`);
  (j.data || []).slice(0, 6).forEach(s => console.log('  ', s.id, '|', s.name, '|', s.startDate ?? s.startdate ?? '', '->', s.endDate ?? s.enddate ?? ''));
}