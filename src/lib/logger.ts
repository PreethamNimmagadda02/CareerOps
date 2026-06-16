/** Minimal leveled logger. Writes human-facing output to stdout/stderr. */
export const log = {
  info(message = ""): void {
    console.log(message);
  },
  warn(message: string): void {
    console.warn(message);
  },
  error(message: string): void {
    console.error(message);
  },
  /** Print a horizontal rule of the given character/length. */
  rule(char = "─", length = 60): void {
    console.log(char.repeat(length));
  },
};
