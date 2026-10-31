import fs from 'fs';
const [file, n = 1500] = process.argv.slice(2);
const buf = Buffer.alloc(+n), fd = fs.openSync(file, 'r');
fs.readSync(fd, buf, 0, +n, 0); console.log(buf.toString());