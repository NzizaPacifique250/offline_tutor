// Regenerates every logo and icon file from the master logo,
// docs/brand/offline-tutor-logo.png: a white mark on a navy rounded tile, on
// a white square. Run from admin/: npm run icons
//
// The tile and the mark are measured from the master and drawn again at each
// size, so no icon carries the master's white background. sharp is installed
// with Next.js.
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dirname, "..", "..");
const master = join(root, "docs", "brand", "offline-tutor-logo.png");
const NAVY = "#14467E";
const WHITE = "#FFFFFF";

const { data, info } = await sharp(master).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const red = (x, y) => data[(y * W + x) * 4];

// The tile: every pixel darker than the white background.
let x0 = W, x1 = 0, y0 = W, y1 = 0;
for (let y = 0; y < info.height; y++) {
  for (let x = 0; x < W; x++) {
    if (red(x, y) < 128) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
}
const tile = x1 - x0 + 1;
let radius = 0;
while (red(x0 + radius, y0 + 1) >= 128) radius++;
const navyRed = red(x0 + Math.round(radius / 2), y0 + (tile >> 1));

// The mark, as coverage: 0 on navy, 255 on white, in between on its edges.
// Pixels near the tile's corners are left out, where the master's white
// background shows outside the rounded tile.
const inset = Math.ceil(radius / 2);
const coverage = Buffer.alloc(tile * tile);
let far = 0;
for (let y = inset; y < tile - inset; y++) {
  for (let x = inset; x < tile - inset; x++) {
    const v = Math.round(((red(x0 + x, y0 + y) - navyRed) / (255 - navyRed)) * 255);
    coverage[y * tile + x] = Math.max(0, Math.min(255, v));
    if (v > 128) far = Math.max(far, Math.hypot(x - tile / 2, y - tile / 2));
  }
}
const cornerRatio = radius / tile;
// How far the mark reaches from the tile's centre, as a share of the tile.
const reach = far / tile;

// The mark in one colour on a transparent square of the tile's proportions.
function mark(color, size) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const rgba = Buffer.alloc(tile * tile * 4);
  for (let i = 0; i < tile * tile; i++) {
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = coverage[i];
  }
  return sharp(rgba, { raw: { width: tile, height: tile, channels: 4 } }).resize(size, size, { kernel: "lanczos3" }).png().toBuffer();
}

// A shape (rounded square, square or circle) of `shapeSize`, centred on a
// transparent canvas, with the mark scaled so that it reaches `reachPx`
// from the centre.
async function icon({ canvas, shapeSize = canvas, shape = "rounded", bg, fg, reachPx }) {
  const offset = (canvas - shapeSize) / 2;
  const svgShape =
    shape === "circle"
      ? `<circle cx="${canvas / 2}" cy="${canvas / 2}" r="${shapeSize / 2}" fill="${bg}"/>`
      : `<rect x="${offset}" y="${offset}" width="${shapeSize}" height="${shapeSize}" rx="${shape === "rounded" ? shapeSize * cornerRatio : 0}" fill="${bg}"/>`;
  const layers = [];
  const markSize = Math.round((reachPx ?? (shapeSize * reach)) / reach);
  layers.push({ input: await mark(fg, markSize), left: Math.round((canvas - markSize) / 2), top: Math.round((canvas - markSize) / 2) });
  const base = bg
    ? sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}">${svgShape}</svg>`))
    : sharp({ create: { width: canvas, height: canvas, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
  return base.composite(layers).png({ compressionLevel: 9 }).toBuffer();
}

async function write(path, buffer) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  await sharp(buffer).toFile(file);
  console.log(path);
}

// Android launcher. Adaptive icon (Android 8 and later): a navy background
// colour and this white mark on a 108 dp layer, kept inside the 66 dp circle
// every launcher mask shows; the same layer is the themed (monochrome) icon.
// Before Android 8: a rounded tile and a circle, 44 dp of the 48 dp icon.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const res = "app/android/app/src/main/res";
for (const [name, scale] of Object.entries(densities)) {
  const layer = 108 * scale;
  await write(`${res}/mipmap-${name}/ic_launcher_foreground.png`, await icon({ canvas: layer, fg: WHITE, reachPx: 31 * scale }));
  const legacy = 48 * scale;
  const shape = 44 * scale;
  await write(`${res}/mipmap-${name}/ic_launcher.png`, await icon({ canvas: legacy, shapeSize: shape, bg: NAVY, fg: WHITE }));
  await write(`${res}/mipmap-${name}/ic_launcher_round.png`, await icon({ canvas: legacy, shapeSize: shape, shape: "circle", bg: NAVY, fg: WHITE, reachPx: shape * 0.4 }));
}

// The app's header logo, 32 dp, at the three densities React Native picks from.
for (const [suffix, scale] of [["", 1], ["@2x", 2], ["@3x", 3]]) {
  await write(`app/src/assets/logo${suffix}.png`, await icon({ canvas: 32 * scale, bg: NAVY, fg: WHITE }));
}

// The portal: browser tab icon, phone home-screen icon (full square: iOS
// rounds it itself), and the mark for its navy sidebar and sign-in page,
// navy on a white tile.
await write("admin/app/icon.png", await icon({ canvas: 256, bg: NAVY, fg: WHITE }));
await write("admin/app/apple-icon.png", await icon({ canvas: 180, shape: "square", bg: NAVY, fg: WHITE, reachPx: 180 * reach }));
await write("admin/public/images/logo-mark.png", await icon({ canvas: 128, bg: WHITE, fg: NAVY }));

// The README.
await write("docs/images/logo.png", await icon({ canvas: 256, bg: NAVY, fg: WHITE }));

console.log(`master ${W} px: tile ${tile} px at (${x0}, ${y0}), corner ${radius} px, mark reaching ${(reach * 100).toFixed(1)}% of the tile from its centre`);
