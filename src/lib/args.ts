/** Lightweight argv parsing helpers (no external dependency). */
export class Args {
  private readonly argv: string[];

  constructor(argv: string[] = process.argv.slice(2)) {
    this.argv = argv;
  }

  /** Whether a boolean flag (e.g. `--dry-run`) is present. */
  has(flag: string): boolean {
    return this.argv.includes(flag);
  }

  /** The string value following `--name`, or undefined. */
  get(name: string): string | undefined {
    const i = this.argv.indexOf(name);
    if (i === -1) return undefined;
    return this.argv[i + 1];
  }

  /** The numeric value following `--name`, or the provided fallback. */
  number(name: string, fallback: number): number {
    const value = this.get(name);
    if (value === undefined) return fallback;
    const n = Number(value);
    return Number.isNaN(n) ? fallback : n;
  }

  /** The string value following `--name`, or the provided fallback. */
  string(name: string, fallback: string): string {
    return this.get(name) ?? fallback;
  }

  /** Positional (non-flag, non-option-value) arguments. */
  positionals(optionNames: string[] = []): string[] {
    const out: string[] = [];
    for (let i = 0; i < this.argv.length; i += 1) {
      const arg = this.argv[i] as string;
      if (arg.startsWith("--")) {
        if (optionNames.includes(arg)) i += 1; // skip its value
        continue;
      }
      out.push(arg);
    }
    return out;
  }
}
