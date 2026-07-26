#!/usr/bin/env node
// 生成扩展图标(PNG, 无外部依赖):紫色圆角底 + 白色"记忆网络"图案(节点+连线)
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "extension", "icons");

// ---- CRC32 ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

class Canvas {
  constructor(size) { this.size = size; this.px = Buffer.alloc(size * size * 4); }
  set(x, y, r, g, b, a) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return;
    const i = (y * this.size + x) * 4;
    const sa = a / 255, da = this.px[i + 3] / 255, oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    this.px[i] = Math.round((r * sa + this.px[i] * da * (1 - sa)) / oa);
    this.px[i + 1] = Math.round((g * sa + this.px[i + 1] * da * (1 - sa)) / oa);
    this.px[i + 2] = Math.round((b * sa + this.px[i + 2] * da * (1 - sa)) / oa);
    this.px[i + 3] = Math.round(oa * 255);
  }
  circle(cx, cy, rad, r, g, b, a = 255) {
    for (let y = Math.floor(cy - rad - 1); y <= Math.ceil(cy + rad + 1); y++)
      for (let x = Math.floor(cx - rad - 1); x <= Math.ceil(cx + rad + 1); x++) {
        const cov = Math.max(0, Math.min(1, rad - Math.hypot(x - cx, y - cy) + 0.5));
        if (cov > 0) this.set(x, y, r, g, b, Math.round(a * cov));
      }
  }
  line(x0, y0, x1, y1, w, r, g, b, a = 255) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      this.circle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w / 2, r, g, b, a);
    }
  }
  roundedBg(radius, top, bottom) {
    const S = this.size;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let inside = true;
      if (x < radius && y < radius) inside = Math.hypot(x - radius, y - radius) <= radius;
      else if (x > S - 1 - radius && y < radius) inside = Math.hypot(x - (S - 1 - radius), y - radius) <= radius;
      else if (x < radius && y > S - 1 - radius) inside = Math.hypot(x - radius, y - (S - 1 - radius)) <= radius;
      else if (x > S - 1 - radius && y > S - 1 - radius) inside = Math.hypot(x - (S - 1 - radius), y - (S - 1 - radius)) <= radius;
      if (!inside) continue;
      const t = y / (S - 1);
      this.set(x, y,
        Math.round(top[0] + (bottom[0] - top[0]) * t),
        Math.round(top[1] + (bottom[1] - top[1]) * t),
        Math.round(top[2] + (bottom[2] - top[2]) * t), 255);
    }
  }
  toPNG() {
    const S = this.size;
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const raw = Buffer.alloc((S * 4 + 1) * S);
    for (let y = 0; y < S; y++) {
      raw[y * (S * 4 + 1)] = 0;
      this.px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
    }
    return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
  }
}

function makeIcon(size) {
  const c = new Canvas(size), S = size;
  c.roundedBg(Math.round(S * 0.22), [108, 99, 255], [90, 82, 224]); // #6c63ff → #5a52e0
  const P = (fx, fy) => [fx * S, fy * S];
  const nodes = [P(0.5, 0.26), P(0.27, 0.46), P(0.73, 0.46), P(0.5, 0.56), P(0.34, 0.76), P(0.68, 0.76)];
  const edges = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [1, 2]];
  const lw = Math.max(1, S * 0.035);
  for (const [a, b] of edges) c.line(nodes[a][0], nodes[a][1], nodes[b][0], nodes[b][1], lw, 255, 255, 255, 210);
  const nr = S * 0.078;
  nodes.forEach(([x, y], i) => c.circle(x, y, i === 3 ? nr * 1.3 : nr, 255, 255, 255, 255));
  return c.toPNG();
}

fs.mkdirSync(OUT, { recursive: true });
for (const size of [16, 48, 128]) {
  const buf = makeIcon(size);
  fs.writeFileSync(path.join(OUT, `icon${size}.png`), buf);
  console.log(`✅ icon${size}.png (${buf.length} bytes)`);
}
console.log(`输出目录: ${OUT}`);
