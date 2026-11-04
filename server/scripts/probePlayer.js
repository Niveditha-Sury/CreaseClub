import 'dotenv/config';
const key = process.env.CRICKETDATA_KEY, name = process.argv[2] || 'Tendulkar';
if (!key) { console.error('Set CRICKETDATA_KEY in .env'); process.exit(1); }
const call = async p => (await fetch(`https://api.cricapi.com/v1/${p}&apikey=${key}`)).json();
const s = await call(`players?offset=0&search=${encodeURIComponent(name)}`);
console.log('search:', s.status, s.reason ?? '', JSON.stringify(s.data?.slice(0, 3)), `| hits ${s.info?.hitsToday}/${s.info?.hitsLimit}`);
const id = s.data?.[0]?.id; if (!id) process.exit();
const i = await call(`players_info?id=${id}`);
console.log(i.status, i.reason ?? '', JSON.stringify(i.data, null, 1)?.slice(0, 3000));