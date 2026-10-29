/**
 * Regenerate Resonale brand raster assets from the SVG mark in ResonaleBrand.
 * Run: node scripts/generate-brand-assets.mjs
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const NAVY = "#23243D";
const LAVENDER = "#B1A9D9";
const BG = "#FFFFFF";

/** Mark ink bounds (wave → R + eyes), from ResonaleBrand paths. */
const MARK_W = 116;
const MARK_H = 58;
const MARK_MIN_X = 4;
const MARK_MIN_Y = 0;

const LAVENDER_PATH =
  "M8 44 C 18 44 22 34 32 34 C 43 34 47 46 58 46 C 67 46 72 38 78 33";
const NAVY_PATH =
  "M6 36 C 16 36 21 26 31 26 C 42 26 46 39 57 39 C 66 39 72 31 77 26 C 81 21 84 14 84 10 C 84 5 88 2 95 2 C 110 2 120 14 113 27 C 109 35 99 39 91 34 C 89 33 87.5 31 87.5 31 L 116 58";

/** Eyes — keep in sync with components/ResonaleBrand.tsx */
const EYES = [
  { cx: 97.4, cy: 24.2, rx: 2.15, ry: 3.7, rotate: -19 },
  { cx: 104.8, cy: 21.6, rx: 2.15, ry: 3.7, rotate: -19 },
];

function eyesSvg() {
  return EYES.map(
    (e) =>
      `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" fill="${NAVY}" transform="rotate(${e.rotate} ${e.cx} ${e.cy})"/>`
  ).join("\n    ");
}

function markGroup({ navyStroke, lavStroke }) {
  return `
    <path d="${LAVENDER_PATH}" fill="none" stroke="${LAVENDER}" stroke-width="${lavStroke}" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="${NAVY_PATH}" fill="none" stroke="${NAVY}" stroke-width="${navyStroke}" stroke-linecap="round" stroke-linejoin="round"/>
    ${eyesSvg()}`;
}

function iconSvg(size, { strokeScale = 1 } = {}) {
  const pad = size * 0.18;
  const avail = size - pad * 2;
  const scale = Math.min(avail / MARK_W, avail / MARK_H);
  const drawW = MARK_W * scale;
  const drawH = MARK_H * scale;
  const tx = (size - drawW) / 2 - MARK_MIN_X * scale;
  const ty = (size - drawH) / 2 - MARK_MIN_Y * scale;
  const navyStroke = 4.35 * strokeScale;
  const lavStroke = 2.8 * strokeScale;

  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <g transform="translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${scale.toFixed(5)})">
    ${markGroup({ navyStroke, lavStroke })}
  </g>
</svg>`);
}

function lockupSvgFragment() {
  return `
    ${markGroup({ navyStroke: 4.35, lavStroke: 2.8 })}
    <text x="122" y="35" fill="${NAVY}"
      font-family="ui-sans-serif, system-ui, -apple-system, Helvetica, Arial, sans-serif"
      font-size="33.6" font-weight="500" letter-spacing="-0.02em">esonale</text>
    <text x="184" y="58" fill="${LAVENDER}"
      font-family="ui-sans-serif, system-ui, -apple-system, Helvetica, Arial, sans-serif"
      font-size="16" font-weight="600" letter-spacing="0.22em">GUIDE</text>`;
}

/** Match live header lockup + tagline (1200×630). */
function ogSvg() {
  const W = 1200;
  const H = 630;
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <g transform="translate(160, 255) scale(2.1)">
    ${lockupSvgFragment()}
  </g>
  <text x="560" y="318" fill="${NAVY}" fill-opacity="0.78"
    font-family="ui-sans-serif, system-ui, -apple-system, Helvetica, Arial, sans-serif"
    font-size="42" font-weight="500" letter-spacing="-0.02em">Indie &amp; Festival Animation</text>
</svg>`);
}

function encodeIco(entries) {
  const count = entries.length;
  const headerSize = 6 + count * 16;
  let offset = headerSize;
  const dirs = [];
  for (const e of entries) {
    const s = e.size >= 256 ? 0 : e.size;
    dirs.push({ width: s, height: s, bytes: e.png.length, offset });
    offset += e.png.length;
  }
  const buf = Buffer.alloc(offset);
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2);
  buf.writeUInt16LE(count, 4);
  let o = 6;
  for (const d of dirs) {
    buf.writeUInt8(d.width, o);
    buf.writeUInt8(d.height, o + 1);
    buf.writeUInt8(0, o + 2);
    buf.writeUInt8(0, o + 3);
    buf.writeUInt16LE(1, o + 4);
    buf.writeUInt16LE(32, o + 6);
    buf.writeUInt32LE(d.bytes, o + 8);
    buf.writeUInt32LE(d.offset, o + 12);
    o += 16;
  }
  for (let i = 0; i < entries.length; i++) {
    entries[i].png.copy(buf, dirs[i].offset);
  }
  return buf;
}

async function main() {
  const specs = [
    { file: "public/icon-512.png", size: 512, strokeScale: 1.15 },
    { file: "public/icon-192.png", size: 192, strokeScale: 1.25 },
    { file: "public/apple-touch-icon.png", size: 180, strokeScale: 1.25 },
  ];

  for (const s of specs) {
    const out = path.join(root, s.file);
    const buf = await sharp(iconSvg(s.size, { strokeScale: s.strokeScale }))
      .png()
      .toBuffer();
    fs.writeFileSync(out, buf);
    console.log("wrote", s.file);
  }

  const favEntries = [];
  for (const size of [16, 32, 48]) {
    const strokeScale = size <= 16 ? 1.9 : size <= 32 ? 1.55 : 1.4;
    const png = await sharp(iconSvg(size, { strokeScale })).png().toBuffer();
    favEntries.push({ size, png });
  }
  fs.writeFileSync(path.join(root, "app/favicon.ico"), encodeIco(favEntries));
  console.log("wrote app/favicon.ico");

  await sharp(ogSvg()).png().toFile(path.join(root, "public/og.png"));
  console.log("wrote public/og.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
