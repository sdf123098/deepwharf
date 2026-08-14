// Generate build/icon.ico from the official DeepSeek Harness favicon.
// Blue rounded-square background + white DeepSeek whale mark.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const favicon = readFileSync(
  join("resources", "harness", "node_modules", "@deepseek-ai", "dsh-web-frontend", "dist", "favicon.svg"),
  "utf8",
);

// Force the white variant (the SVG toggles to white under prefers-color-scheme).
const whiteMark = favicon.replace('fill="#000"', 'fill="#fff"').replaceAll("#000", "#fff");

const SIZE = 1024;
const MARK = Math.round(SIZE * 0.5);
const blue = { r: 77, g: 107, b: 254, alpha: 1 }; // DeepSeek brand blue #4D6BFE

// Rasterize the mark at native vector resolution (crisp), scaled to ~50%.
const markSvg = whiteMark
  .replace('width="50.000000"', `width="${MARK}"`)
  .replace('height="50.000000"', `height="${MARK}"`);
const mark = await sharp(Buffer.from(markSvg)).png().toBuffer();

const background = await sharp({
  create: {
    width: SIZE,
    height: SIZE,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    {
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">
           <rect width="${SIZE}" height="${SIZE}" rx="${SIZE * 0.225}" fill="#4D6BFE"/>
         </svg>`,
      ),
    },
    {
      input: mark,
      left: Math.round(SIZE * 0.25),
      top: Math.round(SIZE * 0.25),
    },
  ])
  .png()
  .toBuffer();

const sizes = [16, 24, 32, 48, 64, 128, 256];
const pages = await Promise.all(
  sizes.map((s) => sharp(background).resize(s, s).png().toBuffer()),
);

mkdirSync("build", { recursive: true });
const ico = await pngToIco(pages);
writeFileSync(join("build", "icon.ico"), ico);
await sharp(background).resize(256, 256).png().toFile(".tmp-icon-preview.png");
console.log("build/icon.ico written:", sizes.join(","));
