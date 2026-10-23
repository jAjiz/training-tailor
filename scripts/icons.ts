import { readFileSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { ImageResponse } from "next/og";

// Renders assets/icon.svg onto the app background at every size the app ships.
// Run with: pnpm exec tsx scripts/icons.ts
const BACKGROUND = "#0f172a";
const glyph = `data:image/svg+xml;base64,${readFileSync("assets/icon.svg").toString("base64")}`;

// glyphScale < 1 shrinks the glyph so maskable icons keep it inside the 80% safe zone.
async function render(size: number, glyphScale = 1): Promise<Buffer> {
  const glyphSize = Math.round(size * glyphScale);
  const image = new ImageResponse(
    createElement(
      "div",
      {
        style: {
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: BACKGROUND,
        },
      },
      createElement("img", { src: glyph, width: glyphSize, height: glyphSize }),
    ),
    { width: size, height: size },
  );
  return Buffer.from(await image.arrayBuffer());
}

// An .ico is a directory of embedded PNGs.
function ico(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size % 256, 0);
    entry.writeUInt8(size % 256, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main() {
  writeFileSync("public/icons/icon-192.png", await render(192));
  writeFileSync("public/icons/icon-512.png", await render(512));
  writeFileSync("public/icons/maskable-512.png", await render(512, 0.72));
  writeFileSync("src/app/apple-icon.png", await render(180, 0.86));
  const sizes = [16, 32, 48];
  writeFileSync(
    "src/app/favicon.ico",
    ico(await Promise.all(sizes.map(async (size) => ({ size, png: await render(size, 1.12) })))),
  );
  console.log("Icons written.");
}

main();
