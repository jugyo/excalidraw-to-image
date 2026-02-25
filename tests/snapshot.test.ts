import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import { svgToPng } from "../src/lib/png";
import { buildSvg } from "../src/lib/svg";
import type { CliOptions, RawExcalidrawScene } from "../src/lib/types";

const PROJECT_ROOT = path.resolve(import.meta.dir, "..");
const FIXTURES_ROOT = path.join(PROJECT_ROOT, "tests", "fixtures");
const SVG_GOLDEN_ROOT = path.join(PROJECT_ROOT, "tests", "output", "svg");
const PNG_GOLDEN_ROOT = path.join(PROJECT_ROOT, "tests", "output", "png");
const SUCCESS_LEVELS = ["l1", "l2", "l3", "l4"] as const;

const DEFAULT_OPTIONS_ARTIST: CliOptions = {
  in: "",
  out: "",
  padding: 24,
  scale: 1,
};

async function collectFixtureFiles(): Promise<string[]> {
  const files: string[] = [];
  for (const level of SUCCESS_LEVELS) {
    const dir = path.join(FIXTURES_ROOT, level);
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".json")) {
        files.push(path.join(dir, entry.name));
      }
    }
  }
  files.sort();
  return files;
}

async function loadScene(fixturePath: string): Promise<RawExcalidrawScene> {
  const raw = await fs.readFile(fixturePath, "utf8");
  return JSON.parse(raw) as RawExcalidrawScene;
}

describe("golden fixtures", async () => {
  const fixtures = await collectFixtureFiles();

  test("has at least one fixture", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fixturePath of fixtures) {
    const rel = path.relative(FIXTURES_ROOT, fixturePath);
    const stem = rel.replace(/\.json$/i, "");
    const svgGoldenPath = path.join(SVG_GOLDEN_ROOT, `${stem}.svg`);
    const pngGoldenPath = path.join(PNG_GOLDEN_ROOT, `${stem}.png`);

    test(`svg(Artist) matches golden: ${rel}`, async () => {
      const scene = await loadScene(fixturePath);
      const actualSvg = buildSvg(scene, DEFAULT_OPTIONS_ARTIST);
      const expectedSvg = await fs.readFile(svgGoldenPath, "utf8");
      expect(actualSvg).toBe(expectedSvg);
    });

    test(`png(Artist) matches golden: ${rel}`, async () => {
      const scene = await loadScene(fixturePath);
      const actualSvg = buildSvg(scene, DEFAULT_OPTIONS_ARTIST);
      const actualPng = svgToPng(actualSvg);
      const expectedPng = await fs.readFile(pngGoldenPath);
      expect(Buffer.from(actualPng)).toEqual(Buffer.from(expectedPng));
    });

    test(`svg(Artist) is deterministic: ${rel}`, async () => {
      const scene = await loadScene(fixturePath);
      const first = buildSvg(scene, DEFAULT_OPTIONS_ARTIST);
      const second = buildSvg(scene, DEFAULT_OPTIONS_ARTIST);
      expect(first).toBe(second);
    });

  }
});
