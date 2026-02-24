import { CLI_USAGE } from "./constants";
import type { CliOptions } from "./types";

export class CliUsageError extends Error {}

export function parseCliArgs(argv: string[]): CliOptions {
  const args: CliOptions = {
    in: "",
    out: "",
    padding: 24,
    scale: 1,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--in") {
      args.in = argv[++i] ?? "";
      continue;
    }
    if (token === "--out") {
      args.out = argv[++i] ?? "";
      continue;
    }
    if (token === "--padding") {
      args.padding = Number(argv[++i]);
      continue;
    }
    if (token === "--scale") {
      args.scale = Number(argv[++i]);
      continue;
    }
    if (token === "--help" || token === "-h") {
      throw new CliUsageError("");
    }
    throw new CliUsageError(`Unknown argument: ${token}`);
  }

  if (!args.in || !args.out) {
    throw new CliUsageError("--in and --out are required");
  }
  if (!Number.isFinite(args.padding) || args.padding < 0) {
    throw new CliUsageError("--padding must be a number >= 0");
  }
  if (!Number.isFinite(args.scale) || args.scale <= 0) {
    throw new CliUsageError("--scale must be a number > 0");
  }

  return args;
}

export function printUsage(stream: "stdout" | "stderr", usage = CLI_USAGE): void {
  if (stream === "stdout") {
    console.log(usage);
    return;
  }
  console.error(usage);
}
