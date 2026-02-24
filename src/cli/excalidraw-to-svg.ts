#!/usr/bin/env bun

import { CLI_USAGE } from "../lib/constants";
import { loadSceneOrExit, parseArgsOrExit, writeOutputOrExit } from "../lib/cli";
import { buildSvg } from "../lib/svg";

async function main(): Promise<void> {
  const args = parseArgsOrExit(process.argv, CLI_USAGE);
  const scene = await loadSceneOrExit(args.in);
  const svg = buildSvg(scene, args);
  await writeOutputOrExit(args.out, svg, "SVG");
  console.log(`Generated ${args.out}`);
}

void main();
