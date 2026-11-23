"use client";

import * as React from "react";
import { CircleAlert, Pencil } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { Skeleton } from "@astryxdesign/core/Skeleton";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";

import { friendlyError } from "@/lib/errors";
import { deriveMatchingDefaults } from "@/lib/matching-defaults";

export type ProfilePatch = {
  name?: string;
  profile?: Record<string, unknown>;
  cv?: Record<string, unknown>;
};

const nonEmpty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
// `any`: the profile/CV are free-form LLM-extracted JSON.
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** "A, B, C and 4 more" — a plain-text list that never runs on forever. */
function listText(items: string[], max: number): string {
  const shown = items.slice(0, max).join(", ");
  const rest = items.length - max;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

/** "A, B, C" typed into one box → ["A", "B", "C"]. */
function splitList(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The readiness check's gaps ("Full name (Personal Info)", "At least one
 * skill", …) in the same words as the form's own field labels, so people can
 * see which boxes to fill. Gaps the form has no box for are left out.
 */
const MISSING_WORDS: [RegExp, string][] = [
  [/full name/i, "your name"],
  [/headline/i, "a headline"],
  [/target role/i, "the jobs you're looking for"],
  [/summary|experience/i, "a few words about you"],
  [/skill/i, "your skills"],
];

function missingText(missing: string[]): string | null {
  const words = MISSING_WORDS.filter(([re]) => missing.some((m) => re.test(m))).map(([, w]) => w);
  if (words.length === 0) return null;
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/** "Lead · Company, and 2 more" for the first entry of a résumé section. */
function firstEntryText(lead: string, total: number, noun: string): string {
  if (!nonEmpty(lead)) return `${total} ${noun}`;
  return total > 1 ? `${lead}, and ${total - 1} more` : lead;
}

/**
 * A field's helper sentence at full reading size, under the input and tied to
 * it with aria-describedby (field `description` props render too small).
 */
function Hint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <Text as="p" id={id} color="secondary">
      {children}
    </Text>
  );
}

/**
 * The profile we read from the résumé, as plain label/value rows, with a small
 * form to correct the handful of fields that matter most for the job search.
 */
export function ExtractedProfile({
  extracted,
  isLoading,
  onSave,
  onEditingChange,
  missing = [],
  isTypedIn = false,
  startInEditor = false,
  onCancelEmpty,
}: {
  extracted: Record<string, unknown> | null;
  /** True while a refresh is re-reading the saved profile. */
  isLoading: boolean;
  onSave: (patch: ProfilePatch) => Promise<void>;
  /** Told when the edit form opens/closes, so the page can hold its own main button meanwhile. */
  onEditingChange?: (editing: boolean) => void;
  /** What the profile still needs before the next step (the readiness check's list). */
  missing?: string[];
  /** The person is typing their details in, with no résumé file behind them. */
  isTypedIn?: boolean;
  /** Open straight into the form (once loading has finished). */
  startInEditor?: boolean;
  /** Called when the form is cancelled while there is still nothing to show. */
  onCancelEmpty?: () => void;
}) {
  // `any`: the profile/CV are free-form LLM-extracted JSON.
  const src = (extracted ?? {}) as { profile?: any; cv?: any };
  const p = src.profile ?? {};
  const c = src.cv ?? {};

  // Profile-side signal
  const name: string = p?.candidate?.full_name ?? "";
  const headline: string = p?.narrative?.headline ?? "";
  const titles: string[] = p?.matching?.include_titles?.length
    ? p.matching.include_titles
    : (p?.target_roles?.primary ?? []);
  // Read from `matching`, not `target_roles.avoid`: the former is what the scan
  // actually excludes, after `buildMatchingPrefs` drops any inferred keyword
  // that collided with one of the candidate's own target titles. Showing the
  // raw inference would promise an exclusion that isn't in effect.
  const avoid: string[] = arr(p?.matching?.exclude_titles);
  const level: string = p?.target_roles?.archetypes?.[0]?.level ?? "";
  const supers: string[] = arr(p?.narrative?.superpowers);
  const city: string = p?.location?.city || p?.candidate?.location || "";
  const visa: string = p?.location?.visa_status ?? "";
  const email: string = p?.candidate?.email ?? "";
  const phone: string = p?.candidate?.phone ?? "";
  const links: string[] = [
    nonEmpty(p?.candidate?.linkedin) && "LinkedIn",
    nonEmpty(p?.candidate?.github) && "GitHub",
    nonEmpty(p?.candidate?.portfolio_url) && "Portfolio",
  ].filter(Boolean) as string[];

  // CV-side signal
  const skills: string[] = arr(c?.skills).flatMap((g) => arr(g?.items));
  const experience = arr(c?.experience);
  const education = arr(c?.education);
  const certs = arr(c?.certifications);
  const projects = arr(c?.projects);
  const languages: string[] = arr(c?.languages)
    .map((l) => (typeof l === "string" ? l : l?.language))
    .filter(nonEmpty);
  const summary: string = p?.narrative?.exit_story || c?.summary || "";

  // Build only the rows we actually have data for — never a blank "—".
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string) => rows.push({ label, value });

  if (nonEmpty(name)) add("Name", name);
  if (nonEmpty(headline)) add("Headline", headline);
  if (titles.length) add("Jobs you're looking for", listText(titles, 4));
  if (nonEmpty(level)) add("Level", level);
  if (skills.length) add("Skills", listText(skills, 8));
  if (experience.length) {
    const top = experience[0] ?? {};
    const lead = [top.role, top.company].filter(Boolean).join(" · ");
    add("Experience", firstEntryText(lead, experience.length, "jobs"));
  }
  if (education.length) {
    const e = education[0] ?? {};
    const lead = [e.degree, e.institution].filter(Boolean).join(", ");
    add("Education", firstEntryText(lead, education.length, "qualifications"));
  }
  if (nonEmpty(city)) add("Location", city);
  if (avoid.length) add("Jobs we'll leave out", listText(avoid, 6));
  if (supers.length) add("Strengths", listText(supers, 3));
  if (projects.length) {
    const names = projects.map((x) => x?.name).filter(nonEmpty);
    add("Projects", names.length ? listText(names, 3) : `${projects.length} projects`);
  }
  if (certs.length) {
    const names = certs.map((x) => x?.name).filter(nonEmpty);
    add("Certificates", names.length ? listText(names, 3) : `${certs.length}`);
  }
  if (languages.length) add("Languages", listText(languages, 5));
  if (links.length) add("Online profiles", links.join(", "));
  if (nonEmpty(email)) add("Email", email);
  if (nonEmpty(phone)) add("Phone", phone);
  if (nonEmpty(visa)) add("Work permit or visa", visa);

  // ── editing ──
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [dName, setDName] = React.useState("");
  const [dHeadline, setDHeadline] = React.useState("");
  const [dTitles, setDTitles] = React.useState("");
  const [dCity, setDCity] = React.useState("");
  const [dVisa, setDVisa] = React.useState("");
  const [dSummary, setDSummary] = React.useState("");
  const [dSkills, setDSkills] = React.useState("");
  // Skills get their own box only when the CV has none yet (a typed-in profile,
  // or a résumé we couldn't read them from). Résumé skills keep their groups,
  // which a single box would flatten.
  const [askSkills, setAskSkills] = React.useState(false);
  const hintId = React.useId();

  React.useEffect(() => {
    onEditingChange?.(editing);
  }, [editing, onEditingChange]);
  // Leaving the page mid-edit must not hold the page's own main button back.
  React.useEffect(() => () => onEditingChange?.(false), [onEditingChange]);

  const beginEdit = () => {
    setErr(null);
    setDName(name);
    setDHeadline(headline);
    setDTitles(titles.join(", "));
    setDCity(city);
    setDVisa(visa);
    setDSummary(summary);
    setDSkills("");
    setAskSkills(skills.length === 0);
    setEditing(true);
  };

  // Open the form on arrival when asked to — once, and only after the saved
  // details have loaded, so it starts from them rather than from blanks.
  const startedInEditor = React.useRef(false);
  React.useEffect(() => {
    if (!startInEditor || isLoading || startedInEditor.current) return;
    startedInEditor.current = true;
    beginEdit();
  });

  const cancelEdit = () => {
    setEditing(false);
    if (rows.length === 0) onCancelEmpty?.();
  };

  const handleSave = async () => {
    setSaving(true);
    setErr(null);
    try {
      const primary = splitList(dTitles);
      const skillItems = askSkills ? splitList(dSkills) : [];

      // `any`: free-form profile JSON.
      const nextProfile: Record<string, any> = {
        candidate: { ...(p.candidate ?? {}), full_name: dName.trim() },
        narrative: { ...(p.narrative ?? {}), headline: dHeadline.trim(), exit_story: dSummary.trim() },
        target_roles: { ...(p.target_roles ?? {}), primary },
        location: { ...(p.location ?? {}), city: dCity.trim(), visa_status: dVisa.trim() },
      };
      // Keep the scan's matching prefs aligned with the edited titles/location.
      nextProfile.matching = deriveMatchingDefaults(nextProfile);
      const nextCv: Record<string, unknown> = { summary: dSummary.trim() };
      if (skillItems.length) nextCv.skills = [{ category: "Skills", items: skillItems }];
      await onSave({
        name: dName.trim(),
        profile: nextProfile,
        cv: nextCv,
      });
      setEditing(false);
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  let body: React.ReactNode;
  if (editing) {
    body = (
      <VStack gap={4}>
        <Grid columns={{ minWidth: 240 }} gap={4}>
          <TextInput
            label="Name"
            value={dName}
            onChange={setDName}
            placeholder="Your full name"
            autoComplete="name"
          />
          <VStack gap={1}>
            <TextInput
              label="Headline"
              aria-describedby={`${hintId}-headline`}
              value={dHeadline}
              onChange={setDHeadline}
              placeholder="Operations Manager"
            />
            <Hint id={`${hintId}-headline`}>A few words about the work you do</Hint>
          </VStack>
        </Grid>
        <VStack gap={1}>
          <TextInput
            label="Jobs you're looking for"
            aria-describedby={`${hintId}-titles`}
            value={dTitles}
            onChange={setDTitles}
            placeholder="Operations Manager, Project Coordinator"
          />
          <Hint id={`${hintId}-titles`}>Put a comma between each job title</Hint>
        </VStack>
        <Grid columns={{ minWidth: 240 }} gap={4}>
          <TextInput
            label="Location"
            isOptional
            value={dCity}
            onChange={setDCity}
            placeholder="Lagos, Nigeria"
          />
          <TextInput
            label="Work permit or visa"
            isOptional
            value={dVisa}
            onChange={setDVisa}
            placeholder="Citizen, or needs sponsorship"
          />
        </Grid>
        <VStack gap={1}>
          <TextArea
            label="About you"
            aria-describedby={`${hintId}-about`}
            value={dSummary}
            onChange={setDSummary}
            rows={4}
            placeholder="I've run warehouse operations for 12 years and want to move into project coordination."
          />
          <Hint id={`${hintId}-about`}>A few sentences about your background and the work you want next</Hint>
        </VStack>
        {askSkills && (
          <VStack gap={1}>
            <TextInput
              label="Your skills"
              aria-describedby={`${hintId}-skills`}
              value={dSkills}
              onChange={setDSkills}
              placeholder="Scheduling, Budgets, Customer service"
            />
            <Hint id={`${hintId}-skills`}>Put a comma between each skill</Hint>
          </VStack>
        )}

        {err && (
          <Banner status="error" title="We couldn't save your changes" collapsible={false} role="alert">
            <Text>{err}</Text>
          </Banner>
        )}

        <HStack gap={3} wrap="wrap" vAlign="center">
          <Button
            variant="primary"
            size="lg"
            label={rows.length ? "Save changes" : "Save my details"}
            isLoading={saving}
            onClick={() => void handleSave()}
          />
          <Button variant="ghost" label="Cancel" isDisabled={saving} onClick={cancelEdit} />
        </HStack>
        <Text color="secondary">
          {isTypedIn
            ? "You can add your work history and education any time in "
            : "Your skills, experience and education from the résumé are saved too. You can change them any time in "}
          <Link href="/profile">your full profile</Link>.
        </Text>
      </VStack>
    );
  } else if (isLoading && rows.length === 0) {
    body = (
      <VStack gap={3} aria-busy="true" aria-label="Loading your profile">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} index={i} height={20} width={i % 2 ? "60%" : "80%"} />
        ))}
      </VStack>
    );
  } else if (rows.length === 0) {
    body = (
      <VStack gap={3} hAlign="start">
        <Text>
          {isTypedIn
            ? "Nothing added yet."
            : "We read your résumé but couldn't pick out the details. You can add them yourself."}
        </Text>
        <Button variant="primary" size="lg" label="Add details" icon={<Icon icon={Pencil} />} onClick={beginEdit} />
      </VStack>
    );
  } else {
    const stillNeeds = missingText(missing);
    body = (
      <VStack gap={4}>
        <MetadataList maxNumOfItems={8} label={{ position: "start", width: "9rem" }}>
          {rows.map((r) => (
            <MetadataListItem key={r.label} label={r.label}>
              <Text className="break-words">{r.value}</Text>
            </MetadataListItem>
          ))}
        </MetadataList>
        <Text color="secondary">
          {isTypedIn
            ? "If anything is wrong, choose Edit."
            : "We filled this in from your résumé. If anything is wrong, choose Edit."}
        </Text>
        {missing.length > 0 && (
          <VStack gap={3} hAlign="start">
            <HStack gap={2} vAlign="start" role="status">
              <Icon icon={CircleAlert} color="warning" size="md" />
              <Text>
                {stillNeeds
                  ? `To continue, we still need ${stillNeeds}.`
                  : "To continue, your profile still needs a few more details."}
              </Text>
            </HStack>
            <Button
              variant="primary"
              size="lg"
              label="Add the missing details"
              icon={<Icon icon={Pencil} />}
              onClick={beginEdit}
            />
          </VStack>
        )}
      </VStack>
    );
  }

  return (
    <Card>
      <VStack gap={4}>
        <HStack gap={3} hAlign="between" vAlign="center" wrap="wrap">
          <Heading level={2}>{editing ? (rows.length ? "Edit your profile" : "Your details") : "Your profile"}</Heading>
          {!editing && rows.length > 0 && (
            <Button label="Edit" icon={<Icon icon={Pencil} />} onClick={beginEdit} />
          )}
        </HStack>
        {body}
      </VStack>
    </Card>
  );
}
