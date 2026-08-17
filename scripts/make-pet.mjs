// Generate resources/pet/pet.png — the desktop-pet cutout.
//
// Source resolution, first match wins (same convention as make-icon.mjs):
//   1. CLI argument            — node scripts/make-pet.mjs path/to/art.png
//   2. build/pet-art.png       — the repo's committed mascot artwork
//
// The artwork is expected to be a character on a near-white background.
// Keying is border-connected flood fill, NOT a global white-key: only white
// pixels reachable from the image border become transparent, so whites inside
// the character (apron, highlights) survive. A short halo-erosion pass eats
// the anti-aliased fringe left at the silhouette. The result is trimmed to
// the content bounding box and written as RGBA PNG.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const KEY_MIN = 245; // flood-fill keyable: all channels >= this
const HALO_MIN = 215; // halo pass: adjacent-to-transparent keyable threshold
const HALO_PASSES = 2;
const PAD = 8; // transparent padding around the trimmed cutout (px)
const MAX_SIDE = 640; // cap the stored resolution (display is ~200px)

const cliSource = process.argv[2];
const committedSource = join("build", "pet-art.png");
const source = cliSource ?? (existsSync(committedSource) ? committedSource : undefined);
if (!source) {
  console.error("make-pet: no source — pass a png path or commit build/pet-art.png");
  process.exit(1);
}
// A CLI-supplied artwork becomes the repo default so later rebuilds reproduce it.
if (cliSource && cliSource !== committedSource) {
  mkdirSync("build", { recursive: true });
  copyFileSync(cliSource, committedSource);
  console.log("pet source saved:", committedSource);
}

const probe = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const data0 = probe.data;
const W0 = probe.info.width;
const H0 = probe.info.height;
// The committed artwork carries a caption line below the character
// ("DeepSeek harness 发布!"). Auto-detect it as the lowest row band whose
// non-white pixels are sparse (< 25% of width — glyphs, not dress) yet
// wide-spanning (> 30% of width), landing within 60px of the bottom edge;
// crop above it before keying. Fallback: keep the whole image.
let cropH = H0;
{
  const qualifies = (y) => {
    let count = 0;
    let xmin = W0;
    let xmax = -1;
    for (let x = 0; x < W0; x++) {
      const i = (y * W0 + x) * 4;
      const white = data0[i] >= 250 && data0[i + 1] >= 250 && data0[i + 2] >= 250;
      if (!white) {
        count++;
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
      }
    }
    return count > 8 && count < W0 * 0.25 && xmax - xmin > W0 * 0.3;
  };
  let runTop = -1;
  for (let y = H0 - 1; y >= Math.floor(H0 * 0.85); y--) {
    if (qualifies(y)) runTop = y;
    else if (runTop !== -1) break;
  }
  if (runTop !== -1 && H0 - runTop <= 60) cropH = runTop - 1;
}

const { data, info } = await sharp(source)
  .extract({ left: 0, top: 0, width: W0, height: cropH })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (cropH !== H0) console.log(`caption band cropped: ${H0} -> ${cropH} rows`);
const W = info.width;
const H = info.height;
const idx = (x, y) => (y * W + x) * 4;
const keyable = (x, y) => {
  const i = idx(x, y);
  return data[i] >= KEY_MIN && data[i + 1] >= KEY_MIN && data[i + 2] >= KEY_MIN;
};

// Border-connected flood fill over the keyable mask (stack BFS, no recursion).
const alpha = new Uint8Array(W * H).fill(255); // 0 = transparent
const queue = new Int32Array(W * H);
let qh = 0;
let qt = 0;
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const p = y * W + x;
  if (alpha[p] === 0 || !keyable(x, y)) return;
  alpha[p] = 0;
  queue[qt++] = p;
};
for (let x = 0; x < W; x++) {
  push(x, 0);
  push(x, H - 1);
}
for (let y = 0; y < H; y++) {
  push(0, y);
  push(W - 1, y);
}
const NEIGHBORS = [-1, 1, -W, W];
while (qh < qt) {
  const p = queue[qh++];
  for (const n of NEIGHBORS) {
    const q = p + n;
    // neighbor arithmetic is only valid inside the grid; row wraps are
    // rejected by the keyable() bounds check on the next line
    if (q < 0 || q >= W * H) continue;
    if (alpha[q] === 0) continue;
    const x = q % W;
    const y = (q - x) / W;
    if (!keyable(x, y)) continue;
    alpha[q] = 0;
    queue[qt++] = q;
  }
}

// Halo erosion: pixels just inside the silhouette that are still near-white
// and touch transparency keyed away, a few iterations deep.
for (let pass = 0; pass < HALO_PASSES; pass++) {
  const flipped = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (alpha[p] === 0) continue;
      const i = p * 4;
      if (data[i] < HALO_MIN || data[i + 1] < HALO_MIN || data[i + 2] < HALO_MIN) continue;
      const touches =
        (x > 0 && alpha[p - 1] === 0) ||
        (x < W - 1 && alpha[p + 1] === 0) ||
        (y > 0 && alpha[p - W] === 0) ||
        (y < H - 1 && alpha[p + W] === 0);
      if (touches) flipped.push(p);
    }
  }
  if (flipped.length === 0) break;
  for (const p of flipped) alpha[p] = 0;
}

// Keep only the largest opaque component — the maid herself. Floating
// companions (the little whales) and the caption glyphs sit on the same
// background and survive keying as separate islands; the pet is the main
// figure only. 4-connectivity, iterative scanline-safe BFS.
{
  const seen = new Uint8Array(W * H);
  const stack = new Int32Array(W * H);
  let best = { size: 0, pixels: null };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x;
      if (seen[p] || alpha[p] === 0) continue;
      let size = 0;
      const pixels = [];
      let top = 0;
      seen[p] = 1;
      stack[top++] = p;
      while (top > 0) {
        const c = stack[--top];
        size++;
        pixels.push(c);
        const cx = c % W;
        const neighbors =
          cx > 0 ? (cx < W - 1 ? [c - 1, c + 1, c - W, c + W] : [c - 1, c - W, c + W]) : [c + 1, c - W, c + W];
        for (const n of neighbors) {
          if (n < 0 || n >= W * H || seen[n] || alpha[n] === 0) continue;
          seen[n] = 1;
          stack[top++] = n;
        }
      }
      if (size > best.size) best = { size, pixels };
    }
  }
  if (best.pixels !== null) {
    // Zero FIRST, then keep only the best component — everything else still
    // carries the initial 255 and a "not 255 → 0" pass would leave it intact.
    alpha.fill(0);
    for (const p of best.pixels) alpha[p] = 255;
  }
  let keptCount = 0;
  for (let p = 0; p < W * H; p++) if (alpha[p] > 0) keptCount++;
  console.log(`largest component kept: ${best.size}px (of ${W * H}); opaque after filter: ${keptCount}`);
}

// Write alpha back into the raw buffer and trim to the content bbox.
let minX = W;
let minY = H;
let maxX = -1;
let maxY = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const p = y * W + x;
    data[p * 4 + 3] = alpha[p];
    if (alpha[p] > 0) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) {
  console.error("make-pet: cutout is empty — source has no content?");
  process.exit(1);
}
const left = Math.max(0, minX - PAD);
const top = Math.max(0, minY - PAD);
const width = Math.min(W, maxX + 1 + PAD) - left;
const height = Math.min(H, maxY + 1 + PAD) - top;

let img = sharp(data, { raw: { width: W, height: H, channels: 4 } }).extract({ left, top, width, height });
const longest = Math.max(width, height);
if (longest > MAX_SIDE) {
  img = img.resize(Math.round((width * MAX_SIDE) / longest), Math.round((height * MAX_SIDE) / longest));
}
mkdirSync(join("resources", "pet"), { recursive: true });
const outPath = join("resources", "pet", "pet.png");
await img.png().toFile(outPath);

// Preview composited on dark + light grounds for a quick eyeball check.
const previewMeta = await sharp(outPath).metadata();
const fit = Math.min(400, previewMeta.width ?? 400, previewMeta.height ?? 400);
const preview = await sharp(outPath)
  .resize({
    width: Math.round(((previewMeta.width ?? fit) * fit) / (previewMeta.height ?? fit)),
    height: fit,
  })
  .png()
  .toBuffer();
const ground = (r, g, b, file) =>
  sharp({ create: { width: 460, height: 460, channels: 4, background: { r, g, b, alpha: 1 } } })
    .composite([{ input: preview, gravity: "center" }])
    .png()
    .toFile(file);
await ground(24, 26, 32, ".tmp-pet-preview-dark.png");
await ground(245, 245, 245, ".tmp-pet-preview-light.png");

console.log(`cutout written: ${outPath} (${previewMeta.width}x${previewMeta.height}, bbox ${width}x${height}@${left},${top})`);
