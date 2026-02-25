import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { VIRGIL_TTF_FILE_RELATIVE_PATH } from "./constants";

function resolveFontFiles(): string[] {
  const virgilPath = path.resolve(import.meta.dir, VIRGIL_TTF_FILE_RELATIVE_PATH);
  return fs.existsSync(virgilPath) ? [virgilPath] : [];
}

export function svgToPng(svg: string): Uint8Array {
  const fontFiles = resolveFontFiles();
  const resvg = new Resvg(svg, {
    background: "rgba(255, 255, 255, 0)",
    font: {
      fontFiles,
      loadSystemFonts: true,
      defaultFontFamily: "Virgil",
    },
  });
  const rendered = resvg.render();
  return rendered.asPng();
}
