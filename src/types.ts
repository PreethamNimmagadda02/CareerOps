import { AppStatus } from "@prisma/client";

/** Shared domain types for the CarrerOps pipeline. */

/** A scan target stored in the Postgres `Portal` table. */
export interface Company {
  name: string;
  careers_url?: string;
  /** Explicit API endpoint (Greenhouse-style) when auto-detection is not possible. */
  api?: string;
  /** When the string "false", the company is skipped. */
  enabled?: string;
  [key: string]: string | undefined;
}

/** Scan configuration loaded from Postgres (`Portal` + `FilterKeyword` tables). */
export interface PortalsConfig {
  positive: string[];
  negative: string[];
  companies: Company[];
}

/** A single job posting discovered during a scan. */
export interface Job {
  company: string;
  title: string;
  url: string;
  location: string;
  source: string;
}

/** Result of scanning a single company. */
export interface ScanResult {
  company: Company;
  method: "greenhouse" | "ashby" | "lever" | "browser" | "unsupported";
  jobs: Job[];
  error: string;
}

export interface TitleMatch {
  relevant: boolean;
  positive: string;
  negative: string;
}

export interface EngineeringMatch {
  engineering: boolean;
  excluded: boolean;
}

export interface LocationMatch {
  eligible: boolean;
  india: boolean;
  remote: boolean;
}

/** An evaluated/relevant job carrying its match metadata. */
export interface RelevantJob extends Job {
  match: TitleMatch;
  engineeringMatch?: EngineeringMatch;
  locationMatch?: LocationMatch;
}

/** The JSON summary written to the scan-results temp file. */
export interface ScanSummary {
  scannedAt: string;
  enabledCompanies: number;
  structuredCompanies: number;
  unsupportedCompanies: string[];
  browserFallbackCompanies: number;
  successfulCompanies: number;
  structuredFailures: FailureInfo[];
  browserFailures: FailureInfo[];
  failedCompanies: FailureInfo[];
  totalJobs: number;
  engineeringRelevant: number;
  relevantNew: number;
  relevantDuplicates: number;
  skippedTitle: number;
  skippedNonEngineering: number;
  skippedLocation: number;
  relevant: RelevantJob[];
  shortlist: RelevantJob[];
}

export interface FailureInfo {
  company: string;
  method: string;
  error: string;
}

/** An application row from the Postgres `Application` table. */
export interface ApplicationRow {
  /** UUID primary key (`Application.id`). */
  num: string;
  date: string;
  company: string;
  role: string;
  score: string;
  status: AppStatus;
  pdf: string;
  reportName: string;
  reportUrl: string | null;
  url: string | null;
}

/** A resolved LLM provider configuration. */
export interface ProviderConfig {
  baseURL: string;
  defaultModel: string;
  authEnvVar: string;
}
