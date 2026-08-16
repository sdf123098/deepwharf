// Generate build/icon.ico (Windows app icon) + resources/brand-logo.png
// (title bar / splash <img>).
//
// Source resolution, first match wins:
//   1. CLI argument            — node scripts/make-icon.mjs path/to/art.png
//   2. build/brand-icon.png    — the repo's committed brand artwork
//   3. the official DeepSeek Harness favicon (historical default)
//
// A PNG source is expected to be finished square artwork with transparency;
// it is center-cropped to square and used as-is. The favicon path composites
// the white whale mark on the blue rounded plate as before.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const SIZE = 1024;
const ICON_SIZES = [16, 24, 32, 48, 64, 128, 256];

const cliSource = process.argv[2];
const brandSource = join("build", "brand-icon.png");
const faviconPath = join(
  "resources", "harness", "node_modules", "@deepseek-ai", "dsh-web-frontend", "dist", "favicon.svg",
);

async function squarePng(input) {
  // Center-crop to square (PNG sources should already be square; guard anyway).
  const meta = await sharp(input).metadata();
  const side = Math.min(meta.width ?? 0, meta.height ?? 0);
  let img = sharp(input);
  if ((meta.width ?? 0) !== (meta.height ?? 0)) {
    img = img.extract({
      left: Math.floor(((meta.width ?? side) - side) / 2),
      top: Math.floor(((meta.height ?? side) - side) / 2),
      width: side,
      height: side,
    });
  }
  return img.resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

/**
 * Brand artwork is mostly dark line art — invisible on the dark title bar and
 * a dark Windows taskbar. Mount it on a white rounded plate with a hairline
 * border (the artwork reads clearly on light ground), leaving a small margin
 * so the plate reads as a tile at 16px.
 */
async function onWhitePlate(square) {
  const INSET = Math.round(SIZE * 0.06);
  const RADIUS = Math.round(SIZE * 0.225);
  const art = await sharp(square)
    .resize(SIZE - INSET * 2, SIZE - INSET * 2, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
             <rect x="1" y="1" width="${SIZE - 2}" height="${SIZE - 2}" rx="${RADIUS}" fill="#ffffff" stroke="rgba(0,0,0,0.12)" stroke-width="2"/>
           </svg>`,
        ),
      },
      { input: art, left: INSET, top: INSET },
    ])
    .png()
    .toBuffer();
}

async function fromPng(input) {
  console.log("icon source (png):", input);
  return onWhitePlate(await squarePng(input));
}

async function fromFavicon() {
  console.log("icon source: official DeepSeek favicon (no brand png found)");
  const favicon = readFileSync(faviconPath, "utf8");
  // Force the white variant (the SVG toggles to white under prefers-color-scheme).
  const whiteMark = favicon.replace('fill="#000"', 'fill="#fff"').replaceAll("#000", "#fff");
  const MARK = Math.round(SIZE * 0.5);
  const markSvg = whiteMark
    .replace('width="50.000000"', `width="${MARK}"`)
    .replace('height="50.000000"', `height="${MARK}"`);
  const mark = await sharp(Buffer.from(markSvg)).png().toBuffer();
  return sharp({
    create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: Buffer.from(
          `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
             <rect width="${SIZE}" height="${SIZE}" rx="${SIZE * 0.225}" fill="#4D6BFE"/>
           </svg>`,
        ),
      },
      { input: mark, left: Math.round(SIZE * 0.25), top: Math.round(SIZE * 0.25) },
    ])
    .png()
    .toBuffer();
}

const source = cliSource
  ? await fromPng(cliSource)
  : existsSync(brandSource)
    ? await fromPng(brandSource)
    : await fromFavicon();

// A CLI-supplied brand png becomes the repo default so later rebuilds reproduce it.
if (cliSource && cliSource !== brandSource) {
  mkdirSync("build", { recursive: true });
  copyFileSync(cliSource, brandSource);
  console.log("brand source saved:", brandSource);
}

const pages = await Promise.all(
  ICON_SIZES.map((s) => sharp(source).resize(s, s).png().toBuffer()),
);

mkdirSync("build", { recursive: true });
writeFileSync(join("build", "icon.ico"), await pngToIco(pages));

// Shell UI logo (title bar 20px / splash 84px render sizes; 256 is plenty).
await sharp(source).resize(256, 256).png().toFile(join("resources", "brand-logo.png"));

await sharp(source).resize(256, 256).png().toFile(".tmp-icon-preview.png");
console.log("build/icon.ico written:", ICON_SIZES.join(","));
console.log("resources/brand-logo.png written: 256");
