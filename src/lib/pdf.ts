import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

import { paths } from "./paths.js";

export type PdfFormat = "a4" | "letter";

export interface PdfResult {
  outputPath: string;
  pageCount: number;
  size: number;
}

/**
 * Render an HTML file to a PDF using headless Chromium. Self-hosted fonts
 * referenced via `./fonts/` are rewritten to absolute `file://` URLs so they
 * load correctly during rendering.
 */
export async function generatePdf(opts: {
  inputPath: string;
  outputPath: string;
  format?: PdfFormat;
  fontsDir?: string;
}): Promise<PdfResult> {
  const inputPath = resolve(opts.inputPath);
  const outputPath = resolve(opts.outputPath);
  const format = opts.format ?? "a4";
  const fontsDir = opts.fontsDir ?? paths.fontsDir;

  let html = await readFile(inputPath, "utf-8");
  html = html.replace(/url\(['"]?\.\/fonts\//g, `url('file://${fontsDir}/`);
  html = html.replace(/file:\/\/([^'")]+)\.woff2['"]\)/g, `file://$1.woff2')`);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    const pdfBuffer = await page.pdf({
      format,
      printBackground: true,
      margin: { top: "0.6in", right: "0.6in", bottom: "0.6in", left: "0.6in" },
      preferCSSPageSize: false,
    });

    await writeFile(outputPath, pdfBuffer);

    const pdfString = pdfBuffer.toString("latin1");
    const pageCount = (pdfString.match(/\/Type\s*\/Page[^s]/g) || []).length;
    return { outputPath, pageCount, size: pdfBuffer.length };
  } finally {
    await browser.close();
  }
}
