#!/usr/bin/env node
/**
 * career-ops pdf — render an HTML CV to an ATS-friendly PDF via Chromium.
 *
 * Usage:
 *   career-ops-pdf <input.html> <output.pdf> [--format=letter|a4]
 */
import { Args } from "../lib/args.js";
import { log } from "../lib/logger.js";
import { generatePdf, type PdfFormat } from "../lib/pdf.js";

const VALID_FORMATS: PdfFormat[] = ["a4", "letter"];

async function main(): Promise<void> {
  const args = new Args();

  let format: string = "a4";
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--format=")) format = (arg.split("=")[1] || "").toLowerCase();
  }

  const positionals = args.positionals();
  const [inputPath, outputPath] = positionals;

  if (!inputPath || !outputPath) {
    log.error("Usage: career-ops-pdf <input.html> <output.pdf> [--format=letter|a4]");
    process.exit(1);
  }

  if (!VALID_FORMATS.includes(format as PdfFormat)) {
    log.error(`Invalid format "${format}". Use: ${VALID_FORMATS.join(", ")}`);
    process.exit(1);
  }

  log.info(`📄 Input:  ${inputPath}`);
  log.info(`📁 Output: ${outputPath}`);
  log.info(`📏 Format: ${format.toUpperCase()}`);

  const result = await generatePdf({ inputPath, outputPath, format: format as PdfFormat });

  log.info(`✅ PDF generated: ${result.outputPath}`);
  log.info(`📊 Pages: ${result.pageCount}`);
  log.info(`📦 Size: ${(result.size / 1024).toFixed(1)} KB`);
}

main().catch((err: unknown) => {
  log.error(`❌ PDF generation failed: ${(err as Error).message}`);
  process.exit(1);
});
