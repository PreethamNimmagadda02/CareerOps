// Shapes returned by GET/PATCH /api/profile. Kept loose on purpose: the
// profile and CV are partly filled in by résumé extraction, so any field may
// be missing.

export interface UserData {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  resumeKey: string | null;
  resumeUpdatedAt: string | null;
}

export interface MatchingData {
  role_domains?: string[];
  role_nouns?: string[];
  include_titles?: string[];
  exclude_titles?: string[];
  strong_titles?: string[];
  seniority_exclusions?: string[];
  preferred_locations?: string[];
  remote_ok?: boolean;
  eligible_locations?: string[];
}

export interface ProfileData {
  candidate?: {
    full_name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    portfolio_url?: string;
    github?: string;
    twitter?: string;
  };
  target_roles?: {
    primary?: string[];
    archetypes?: Array<{ name: string; level: string; fit: string }>;
    avoid?: string[];
  };
  narrative?: {
    headline?: string;
    exit_story?: string;
    superpowers?: string[];
    proof_points?: Array<{ name: string; url?: string; hero_metric: string }>;
  };
  compensation?: {
    target_range?: string;
    currency?: string;
    minimum?: string;
    location_flexibility?: string;
  };
  location?: {
    city?: string;
    country?: string;
    timezone?: string;
    visa_status?: string;
    onsite_availability?: string;
  };
  matching?: MatchingData;
}

export interface CvData {
  summary?: string;
  skills?: Array<{ category: string; items: string[] }>;
  experience?: Array<{ company: string; role: string; location: string; period: string; highlights: string[] }>;
  education?: Array<{ institution: string; degree: string; field: string; period: string; details: string }>;
  certifications?: Array<{ name: string; issuer: string; year: string }>;
  projects?: Array<{ name: string; description: string; url: string; highlights: string[] }>;
  languages?: Array<{ language: string; proficiency: string }>;
}

export type Archetype = { name: string; level: string; fit: string };
export type ProofPoint = { name: string; url: string; hero_metric: string };
export type Experience = { company: string; role: string; location: string; period: string; highlights: string[] };
export type SkillGroup = { category: string; items: string[] };
export type Education = { institution: string; degree: string; field: string; period: string; details: string };
export type Certification = { name: string; issuer: string; year: string };
export type Project = { name: string; description: string; url: string; highlights: string[] };
export type Language = { language: string; proficiency: string };

/**
 * Keys for per-section edit / saving / error state (one PATCH each).
 * "matching" is the "What you're looking for" section (it also saves the pay
 * details that used to be their own "Pay & location" section); "career" is
 * "Your story".
 */
export type SectionKey =
  | "account"
  | "personal"
  | "career"
  | "matching"
  | "experience"
  | "skills"
  | "education"
  | "projects";

/** What was saved, in words, for the "Saved" toast ("We saved your story."). */
export const SECTION_LABEL: Record<SectionKey, string> = {
  account: "your name",
  personal: "your details",
  career: "your story",
  matching: "what you're looking for",
  experience: "your work history",
  skills: "your skills and languages",
  education: "your education",
  projects: "your projects",
};
