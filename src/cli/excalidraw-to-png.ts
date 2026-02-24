#!/usr/bin/env bun

import { loadSceneOrExit, parseArgsOrExit, writeOutputOrExit } from "../lib/cli";
import { PNG_CLI_USAGE } from "../lib/constants";
import { svgToPng } from "../lib/png";
import { buildSvg } from "../lib/svg";

async function main(): Promise<void> {
  const args = parseArgsOrExit(process.argv, PNG_CLI_USAGE);
  const scene = await loadSceneOrExit(args.in);
  const svg = buildSvg(scene, args);
  const png = svgToPng(svg);
  await writeOutputOrExit(args.out, png, "PNG");
  console.log(`Generated ${args.out}`);
}

void main();
