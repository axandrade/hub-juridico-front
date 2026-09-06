/**
 * Gera public/favicon.ico (multi-size) + public/apple-touch-icon.png a partir do
 * monograma "H" do Hub Jurídico (mesma geometria de public/favicon.svg).
 * Sem dependências — só `zlib` do Node.  Rode: `node scripts/gen-favicon.mjs`
 */
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');
const BURGUNDY = [0x8d, 0x2a, 0x3a];
const CREAM = [0xf4, 0xf1, 0xde];

// --- geometria no espaço 32x32 ---
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x < x1 && y >= y0 && y < y1;
const isGlyph = (x, y) =>
  inRect(x, y, 6.5, 7, 14.5, 10) || inRect(x, y, 8.5, 10, 12.5, 22) || inRect(x, y, 6.5, 22, 14.5, 25) ||
  inRect(x, y, 17.5, 7, 25.5, 10) || inRect(x, y, 19.5, 10, 23.5, 22) || inRect(x, y, 17.5, 22, 25.5, 25) ||
  inRect(x, y, 12.5, 13.5, 19.5, 18.5);
function inTile(x, y) {
  const r = 7, w = 32, h = 32;
  if (x < 0 || y < 0 || x > w || y > h) return false;
  let cx = null, cy = null;
  if (x < r && y < r) { cx = r; cy = r; }
  else if (x > w - r && y < r) { cx = w - r; cy = r; }
  else if (x < r && y > h - r) { cx = r; cy = h - r; }
  else if (x > w - r && y > h - r) { cx = w - r; cy = h - r; }
  if (cx === null) return true;
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function render(size) {
  const SS = 4;
  const buf = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const X = ((px + (sx + 0.5) / SS) / size) * 32;
          const Y = ((py + (sy + 0.5) / SS) / size) * 32;
          let col, al;
          if (isGlyph(X, Y)) { col = CREAM; al = 255; }
          else if (inTile(X, Y)) { col = BURGUNDY; al = 255; }
          else { col = [0, 0, 0]; al = 0; }
          r += col[0]; g += col[1]; b += col[2]; a += al;
        }
      }
      const n = SS * SS, i = (py * size + px) * 4;
      buf[i] = Math.round(r / n); buf[i + 1] = Math.round(g / n); buf[i + 2] = Math.round(b / n); buf[i + 3] = Math.round(a / n);
    }
  }
  return buf;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; }
  return t;
})();
const crc32 = (buf) => { let c = ~0; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(rgba, size) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function buildICO(sizes) {
  const imgs = sizes.map((s) => encodePNG(render(s), s));
  const dir = Buffer.alloc(6 + 16 * sizes.length);
  dir.writeUInt16LE(1, 2); dir.writeUInt16LE(sizes.length, 4);
  let offset = dir.length;
  sizes.forEach((s, i) => {
    const e = 6 + i * 16;
    dir[e] = s >= 256 ? 0 : s; dir[e + 1] = s >= 256 ? 0 : s;
    dir.writeUInt16LE(1, e + 4); dir.writeUInt16LE(32, e + 6);
    dir.writeUInt32LE(imgs[i].length, e + 8);
    dir.writeUInt32LE(offset, e + 12);
    offset += imgs[i].length;
  });
  return Buffer.concat([dir, ...imgs]);
}

fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), buildICO([16, 24, 32, 48, 64]));
fs.writeFileSync(path.join(PUBLIC, 'apple-touch-icon.png'), encodePNG(render(180), 180));
console.log('OK -> public/favicon.ico, public/apple-touch-icon.png');
