import { chromium } from "playwright";
import { mapLimit } from "./concurrency.js";
import { log } from "./logger.js";
import type { RelevantJob } from "../types.js";

/**
 * Visits the URLs of the provided jobs to determine if the job is truly active.
 * Some ATS platforms (like Ashby) leave jobs in their API but render a "Page not found"
 * message on the frontend. This function uses Playwright to detect these cases.
 * 
 * @param jobs The list of relevant jobs to validate
 * @param concurrency Maximum number of concurrent browser tabs to use
 * @returns Array containing only the jobs whose URLs are valid and active
 */
export async function validateJobUrls(jobs: RelevantJob[], concurrency: number = 3): Promise<RelevantJob[]> {
  if (jobs.length === 0) return [];
  
  log.step(`\n🕵️  Validating URLs for ${jobs.length} relevant jobs (concurrency=${concurrency})...`);
  const browser = await chromium.launch({ headless: true });
  
  let validCount = 0;
  let invalidCount = 0;
  
  try {
    const results = await mapLimit(jobs, concurrency, async (job) => {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      let isValid = true;
      let reason = '';
      
      try {
        const response = await page.goto(job.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const status = response?.status() || 0;
        
        if (status >= 400 && status !== 403) {
          isValid = false;
          reason = `HTTP ${status}`;
        } else {
          await page.waitForTimeout(2000);
          const text = await page.locator('body').innerText();
          const lowerText = text.toLowerCase();
          
          if (
            lowerText.includes('this job is no longer available') ||
            lowerText.includes('this position has been filled') ||
            lowerText.includes('job not found') ||
            lowerText.includes('page not found') ||
            lowerText.includes('this job posting is closed')
          ) {
            isValid = false;
            reason = 'Closed/expired page content';
          }
        }
      } catch (e: any) {
        isValid = false;
        reason = e.message;
      } finally {
        await context.close();
      }
      
      if (isValid) {
        validCount++;
      } else {
        invalidCount++;
        log.info(`   ❌ Invalid URL stripped: ${job.company} - ${job.title} (${reason})`);
      }
      
      return { job, isValid };
    });
    
    log.step(`✅ URL validation complete: ${validCount} valid, ${invalidCount} invalid dropped.`);
    return results.filter(r => r.isValid).map(r => r.job);
  } finally {
    await browser.close();
  }
}
