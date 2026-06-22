/**
 * Minimal leveled logger. All output goes through process.stderr.write()
 * so it flushes immediately even when stdout is piped (e.g. when the web
 * dashboard's pipeline runner spawns the CLI as a child process).
 *
 * console.log() / process.stdout.write() are block-buffered (~4 KB) when
 * stdout is a pipe, which prevents the pipeline runner from streaming output
 * in real time. process.stderr.write() flushes per-call in Node.
 */
export const log = {
  info(message = ""): void {
    process.stderr.write(message + "\n");
  },
  warn(message: string): void {
    process.stderr.write(message + "\n");
  },
  error(message: string): void {
    process.stderr.write(message + "\n");
  },
  /**
   * Progress/diagnostic line written to stderr with a timestamp. Kept off
   * stdout so it never corrupts machine-readable (JSON) stdout output, while
   * still streaming live to terminals and the web pipeline runner.
   */
  step(message: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    process.stderr.write(`[${ts}] ${message}\n`);
  },
  /** Print a horizontal rule of the given character/length. */
  rule(char = "─", length = 60): void {
    process.stderr.write(char.repeat(length) + "\n");
  },
};
