#!/usr/bin/env bun

import path from "node:path";
import { CLI_USAGE } from "../lib/constants";
import { loadSceneOrExit, parseArgsOrExit, writeOutputOrExit } from "../lib/cli";
import { svgToPng } from "../lib/png";
import { buildSvg } from "../lib/svg";

async function main(): Promise<void> {
  const args = parseArgsOrExit(process.argv, CLI_USAGE);
  const scene = await loadSceneOrExit(args.in);
  const svg = buildSvg(scene, args);
  const extension = path.extname(args.out).toLowerCase();

  if (extension === ".svg") {
    await writeOutputOrExit(args.out, svg, "SVG");
    console.log(`Generated ${args.out}`);
    return;
  }

  if (extension === ".png") {
    const png = svgToPng(svg);
    await writeOutputOrExit(args.out, png, "PNG");
    console.log(`Generated ${args.out}`);
    return;
  }

  console.error("Error: --out must end with .png or .svg");
  process.exit(1);
}

void main();
