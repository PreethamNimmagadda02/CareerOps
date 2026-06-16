import type { Browser } from "playwright";

const PAGE_TIMEOUT_MS = 30_000;
const MAX_JD_CHARS = 8000;

/**
 * Fetch and extract the visible text of a job description page. Returns a
 * `(...)`-prefixed sentinel string on failure so callers can detect it.
 */
export async function fetchJD(browser: Browser, url: string): Promise<string> {
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: PAGE_TIMEOUT_MS });
    await page.waitForTimeout(2500);
    const text = await page.evaluate((maxChars: number) => {
      for (const el of document.querySelectorAll("script,style,nav,header,footer")) el.remove();
      return (document.body?.innerText || "")
        .replace(/\s{3,}/g, "\n\n")
        .trim()
        .slice(0, maxChars);
    }, MAX_JD_CHARS);
    return text || "(Could not extract text)";
  } catch (err) {
    return `(JD fetch failed: ${(err as Error).message})`;
  } finally {
    await page.close().catch(() => {});
  }
}

/** Whether a `fetchJD` result represents a real extraction (not a sentinel). */
export function isJdOk(jdText: string): boolean {
  return !jdText.startsWith("(");
}
