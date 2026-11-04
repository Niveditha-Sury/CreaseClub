const D = { 'Mumbai':'MUM','Delhi':'DEL','Karnataka':'KAR','Tamil Nadu':'TN','Kerala':'KER','Bengal':'BEN','Maharashtra':'MAH','Gujarat':'GUJ','Rajasthan':'RAJ',
  'Punjab':'PUN','Haryana':'HAR','Uttar Pradesh':'UP','Madhya Pradesh':'MP','Vidarbha':'VID','Saurashtra':'SAU','Baroda':'BRD','Hyderabad':'HYD','Andhra':'AND',
  'Odisha':'ODS','Jharkhand':'JHA','Bihar':'BIH','Assam':'ASM','Himachal Pradesh':'HP','Jammu and Kashmir':'JK','Uttarakhand':'UTK','Chandigarh':'CHD','Goa':'GOA',
  'Services':'SER','Railways':'RLY','Tripura':'TRI','Meghalaya':'MEG','Manipur':'MAN','Mizoram':'MIZ','Nagaland':'NAG','Sikkim':'SIK','Arunachal Pradesh':'ARP',
  'Puducherry':'PUD','Chhattisgarh':'CHH','North Zone':'NZ','South Zone':'SZ','East Zone':'EZ','West Zone':'WZ','Central Zone':'CZ','North East Zone':'NEZ','India A':'IA','India B':'IB','India C':'IC','India D':'ID','India Red':'IRD','India Blue':'IBL','India Green':'IGR', 'Rest of India':'ROI', };
const clean = n => String(n || '').replace(/&/g, 'and').replace(/\s+women$/i, '').replace(/\s+/g, ' ').trim().toLowerCase();
const MAP = Object.fromEntries(Object.entries(D).map(([name, code]) => [clean(name), { code, name }]));
MAP[clean('Pondicherry')] = MAP[clean('Puducherry')];
export const domTeam = n => MAP[clean(n)] ?? null;
export const DOMESTIC_TEAMS = Object.entries(D).map(([name, code]) => ({ code, name }));
export const canonEvent = n => { const s = String(n || '');
  return /ranji/i.test(s) ? 'Ranji Trophy' : /vijay hazare/i.test(s) ? 'Vijay Hazare Trophy' : /duleep/i.test(s) ? 'Duleep Trophy'
    : /syed mushtaq/i.test(s) ? 'Syed Mushtaq Ali Trophy' : /deodhar/i.test(s) ? 'Deodhar Trophy' : /irani/i.test(s) ? 'Irani Cup'
    : s.replace(/\b20\d{2}([-/]\d{2,4})?\b/g, '').replace(/\s+/g, ' ').trim(); };