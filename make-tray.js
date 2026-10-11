// tray.png (16x16 turuncu daire) üretir
const z = require('zlib'), fs = require('fs'), path = require('path');
const W = 16, raw = Buffer.alloc((W * 4 + 1) * W);
for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
  const o = y * (W * 4 + 1) + 1 + x * 4, d = (x - 7.5) ** 2 + (y - 7.5) ** 2 < 49;
  raw[o] = 255; raw[o + 1] = 159; raw[o + 2] = 67; raw[o + 3] = d ? 255 : 0;
}
const T = [...Array(256)].map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = ~0; for (const x of b) c = T[(c ^ x) & 255] ^ (c >>> 8); return ~c >>> 0; };
const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(W, 4); ih[8] = 8; ih[9] = 6;
fs.writeFileSync(path.join(__dirname, 'tray.png'), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  ch('IHDR', ih), ch('IDAT', z.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]));
