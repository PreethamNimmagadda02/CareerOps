import type { EngineeringMatch, Job, LocationMatch, TitleMatch } from "../types.js";
import { keywordMatch } from "./text.js";

/** Determine whether a title is relevant based on positive/negative keywords. */
export function titleMatches(title: string, positive: string[], negative: string[]): TitleMatch {
  const lower = title.toLowerCase();
  const pos = positive.find((kw) => keywordMatch(lower, kw));
  const neg = negative.find((kw) => keywordMatch(lower, kw));
  return { relevant: Boolean(pos) && !neg, positive: pos || "", negative: neg || "" };
}

/** Classify whether a title is an engineering role (and not an excluded role). */
export function engineeringMatch(title: string): EngineeringMatch {
  const lower = title.toLowerCase();
  const include =
    /\b(software|backend|frontend|front-end|fullstack|full-stack|platform|infrastructure|devops|sre|site reliability|security|data platform|systems|compute|distributed systems|mlops|llmops|machine learning|ml|ai|applied ai|forward deployed|deployed|solutions|solution|customer|implementation|integration|automation)\b/.test(
      lower,
    ) && /\b(engineer|engineering|architect|developer)\b/.test(lower);
  const explicitInclude =
    /\b(forward deployed engineer|forward deployed software engineer|deployed engineer|deployment engineer|solutions engineer|solution engineer|solutions architect|solution architect|customer engineer|implementation engineer|integration engineer|automation engineer|ai engineer|applied ai engineer|ml engineer|machine learning engineer|llm engineer|backend engineer|software engineer|platform engineer|infrastructure engineer|devops engineer|security engineer|fullstack engineer|full-stack engineer|frontend engineer|front-end engineer)\b/.test(
      lower,
    );
  const exclude =
    /\b(account executive|sales|pre-sales|presales|marketing|product marketing|growth marketing|recruiter|recruiting|talent|people|hr|legal|counsel|finance|accounting|trainer|assistant|compliance officer|program manager|project manager|product manager|strategist|strategy|researcher|research scientist|scientist|data scientist|analyst|customer success|support engineer|technical support|solutions consultant|solution consultant|consultant|evangelist|advocate|writer|designer|design engineer|field cto|cto|chief|operations|ops manager)\b/.test(
      lower,
    );
  return { engineering: (include || explicitInclude) && !exclude, excluded: exclude };
}

/** Determine India/remote eligibility from a location string. */
export function locationMatch(location: string | undefined): LocationMatch {
  const lower = String(location || "").toLowerCase();
  const india =
    /\b(india|bangalore|bengaluru|hyderabad|mumbai|pune|delhi|gurgaon|gurugram|noida|chennai|kolkata|ahmedabad|apac)\b/.test(
      lower,
    );
  const remote = /\b(remote|remote-first|work from home|wfh|distributed)\b/.test(lower);
  const foreignStrict =
    /\b(us|usa|united states|uk|united kingdom|canada|europe|eu|germany|france|spain|london|berlin|paris|amsterdam|sf|san francisco|new york|nyc|ca|ny|tx|wa|seattle|austin|boston|chicago|toronto|vancouver)\b/.test(
      lower,
    );
  const eligible = india || (remote && (!foreignStrict || india));
  return { eligible, india, remote };
}

/**
 * A job is "high signal" when it is an engineering role with a strong title,
 * no weak/non-target keywords, a friendly location, and not too senior for an
 * entry-level candidate.
 */
export function isHighSignal(job: Job): boolean {
  const strongTitle =
    /(forward deployed|deployed engineer|deployment engineer|solutions architect|solutions engineer|software engineer|backend engineer|platform engineer|full.?stack|machine learning|ml engineer|llm|agent|agentic|generative ai|ai engineer|automation)/i.test(
      job.title,
    );
  const weakTitle =
    /(account executive|sales|marketing|recruit|talent|legal|finance|trainer|assistant|compliance officer|program manager|product manager|data scientist|scientist|researcher)/i.test(
      job.title,
    );
  const friendlyLocation =
    /(remote|india|hyderabad|bengaluru|bangalore|mumbai|pune|delhi|gurgaon|noida|chennai|kolkata|ahmedabad|apac|singapore)/i.test(
      job.location || "",
    );
  const likelyTooSenior = /(staff|principal|lead|senior|manager|director|head)/i.test(job.title);
  return (
    engineeringMatch(job.title).engineering &&
    strongTitle &&
    !weakTitle &&
    friendlyLocation &&
    !likelyTooSenior
  );
}
