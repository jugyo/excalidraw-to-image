import arg from "arg";
import { CLI_USAGE } from "./constants";
import type { CliOptions } from "./types";

export class CliUsageError extends Error {}

export function parseCliArgs(argv: string[]): CliOptions {
  let parsed: arg.Result<{
    "--in": string;
    "--out": string;
    "--padding": number;
    "--scale": number;
    "--print-licenses": boolean;
    "--help": boolean;
    "-h": "--help";
  }>;

  try {
    parsed = arg(
      {
        "--in": String,
        "--out": String,
        "--padding": Number,
        "--scale": Number,
        "--print-licenses": Boolean,
        "--help": Boolean,
        "-h": "--help",
      },
      {
        argv: argv.slice(2),
      },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CliUsageError(message);
  }

  if (parsed["--help"]) {
    throw new CliUsageError("");
  }

  const args: CliOptions = {
    in: parsed["--in"] ?? "",
    out: parsed["--out"] ?? "",
    padding: parsed["--padding"] ?? 24,
    scale: parsed["--scale"] ?? 1,
    printLicenses: Boolean(parsed["--print-licenses"] ?? false),
  };

  if (!Number.isFinite(args.padding) || args.padding < 0) {
    throw new CliUsageError("--padding must be a number >= 0");
  }
  if (!Number.isFinite(args.scale) || args.scale <= 0) {
    throw new CliUsageError("--scale must be a number > 0");
  }
  if (!args.printLicenses && (!args.in || !args.out)) {
    throw new CliUsageError("--in and --out are required unless --print-licenses is used");
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
