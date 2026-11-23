"use client";

import * as React from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Icon } from "@astryxdesign/core/Icon";
import { Link } from "@astryxdesign/core/Link";
import { MetadataList, MetadataListItem } from "@astryxdesign/core/MetadataList";
import { RadioList } from "@astryxdesign/core/RadioList";
import { Selector, type SelectorOptionData } from "@astryxdesign/core/Selector";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@astryxdesign/core/TextArea";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Token } from "@astryxdesign/core/Token";
import { Tokenizer, type TokenizerHandle } from "@astryxdesign/core/Tokenizer";
import type { SearchableItem, SearchSource } from "@astryxdesign/core/Typeahead";
import { VStack } from "@astryxdesign/core/VStack";

// ── Section card ─────────────────────────────────────────────────────────────

/**
 * One profile section: heading, one sentence of context and an "Edit" button.
 * In edit mode the Save / Cancel buttons sit at the bottom, after the fields.
 */
export function SectionCard({
  id,
  title,
  description,
  editing,
  saving,
  error,
  onEdit,
  onSave,
  onCancel,
  children,
}: {
  id: string;
  title: string;
  description: string;
  editing: boolean;
  saving: boolean;
  error?: string | null;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card id={id} className="scroll-mt-24">
      <VStack gap={5}>
        <HStack gap={3} hAlign="between" vAlign="start" wrap="wrap">
          <VStack gap={1} className="min-w-0 flex-1">
            <Heading level={2}>{title}</Heading>
            <Text color="secondary" textWrap="pretty">
              {description}
            </Text>
          </VStack>
          {!editing ? <Button label="Edit" icon={<Icon icon={Pencil} />} onClick={onEdit} /> : null}
        </HStack>

        {error ? <Banner status="error" title="We couldn't save your changes" description={error} /> : null}

        {children}

        {editing ? (
          <HStack gap={3} wrap="wrap">
            <Button variant="primary" size="lg" label="Save changes" onClick={onSave} isLoading={saving} />
            <Button variant="secondary" size="lg" label="Cancel" onClick={onCancel} isDisabled={saving} />
          </HStack>
        ) : null}
      </VStack>
    </Card>
  );
}

// ── View mode ────────────────────────────────────────────────────────────────

export function NotAdded() {
  return <Text color="secondary">Not added yet</Text>;
}

function isUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** A saved value as plain text (links open in a new tab), or "Not added yet". */
export function ValueText({ value, multiline = false }: { value?: string | null; multiline?: boolean }) {
  const v = value?.trim();
  if (!v) return <NotAdded />;
  if (isUrl(v)) {
    return (
      <span className="min-w-0 [overflow-wrap:anywhere]">
        {/* At least 44px tall, so the link is easy to hit. */}
        <Link href={v} isExternalLink className="inline-flex min-h-11 items-center">
          {v}
        </Link>
      </span>
    );
  }
  return (
    <span className={multiline ? "whitespace-pre-line [overflow-wrap:anywhere]" : "[overflow-wrap:anywhere]"}>
      <Text textWrap="pretty">{v}</Text>
    </span>
  );
}

/** A list of saved words or phrases, or "Not added yet". */
export function TagView({ values }: { values: string[] }) {
  if (values.length === 0) return <NotAdded />;
  return (
    // Token text defaults to below our 16px floor; read it at body size.
    <HStack gap={2} wrap="wrap" className="[&_.astryx-token]:[font-size:var(--text-body-size)]">
      {values.map((v, i) => (
        <Token key={`${v}-${i}`} label={v} />
      ))}
    </HStack>
  );
}

/** Label / value rows for view mode. `multi` puts short values side by side on wide screens. */
export function InfoList({ columns = "multi", children }: { columns?: "multi" | "single"; children: React.ReactNode }) {
  return (
    <MetadataList
      columns={columns}
      label={{ position: "top" }}
      // Narrower minimum than the default 280px track so very small phones never scroll sideways.
      className={
        columns === "multi" ? "[&>dl]:[grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))]" : undefined
      }
    >
      {children}
    </MetadataList>
  );
}

export function InfoItem({ label, value, multiline }: { label: string; value?: string | null; multiline?: boolean }) {
  return (
    <MetadataListItem label={label}>
      <ValueText value={value} multiline={multiline} />
    </MetadataListItem>
  );
}

export function TagItem({ label, values }: { label: string; values: string[] }) {
  return (
    <MetadataListItem label={label}>
      <TagView values={values} />
    </MetadataListItem>
  );
}

// ── Edit mode ────────────────────────────────────────────────────────────────

/** Two columns of inputs on wide screens, one column on phones. */
export function FieldGrid({ children }: { children: React.ReactNode }) {
  return (
    <Grid columns={{ minWidth: 240, max: 2 }} gap={4}>
      {children}
    </Grid>
  );
}

/**
 * A field with a hint under it at normal reading size. Astryx's own
 * `description` (and its "Optional" marker) render below our 16px floor, so
 * hints go here instead — linked to the input with `aria-describedby` — and
 * optional fields say "(optional)" in their label.
 */
function WithHint({
  hint,
  children,
}: {
  hint?: React.ReactNode;
  children: (describedBy: string | undefined) => React.ReactNode;
}) {
  const id = React.useId();
  if (!hint) return <>{children(undefined)}</>;
  return (
    <VStack gap={1.5} className="min-w-0">
      {children(id)}
      <Text id={id} color="secondary" textWrap="pretty">
        {hint}
      </Text>
    </VStack>
  );
}

type TextInputProps = Omit<React.ComponentProps<typeof TextInput>, "description" | "isOptional">;
type TextAreaProps = Omit<React.ComponentProps<typeof TextArea>, "description" | "isOptional">;

/** A one-line text box with an optional hint underneath. */
export function TextField({ hint, ...props }: TextInputProps & { hint?: React.ReactNode }) {
  return <WithHint hint={hint}>{(describedBy) => <TextInput {...props} aria-describedby={describedBy} />}</WithHint>;
}

/** A multi-line text box with an optional hint underneath. */
export function TextAreaField({ hint, ...props }: TextAreaProps & { hint?: React.ReactNode }) {
  return <WithHint hint={hint}>{(describedBy) => <TextArea {...props} aria-describedby={describedBy} />}</WithHint>;
}

/**
 * A short set of choices (radio buttons). The whole row is the tap target;
 * rows are kept at least 44px tall and 12px apart.
 */
export function ChoiceList(props: React.ComponentProps<typeof RadioList>) {
  return (
    <div className="min-w-0 [&_.astryx-radio-list-item]:min-h-11 [&_.astryx-radio-list]:gap-3">
      <RadioList {...props} />
    </div>
  );
}

/**
 * Extra, optional fields behind a door labelled with what's inside
 * ("Other links (optional)"), closed until the person opens it. Set off by
 * lines above and below, not a box, since it already sits inside a card.
 */
export function MoreDetails({
  label,
  isOpen,
  onOpenChange,
  children,
}: {
  label: string;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-y border-border py-1">
      <Collapsible
        // The trigger row is the tap target — keep it at least 44px tall.
        trigger={
          <span className="flex min-h-11 items-center">
            <Text weight="semibold">{label}</Text>
          </span>
        }
        defaultIsOpen={false}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
      >
        <div className="pb-4 pt-2">{children}</div>
      </Collapsible>
    </div>
  );
}

/** Maps a `TagField` autocomplete source to its API route. */
const AUTOCOMPLETE_ENDPOINTS = {
  locations: "/api/locations",
  "job-titles": "/api/job-titles",
} as const;

export type AutocompleteSource = keyof typeof AUTOCOMPLETE_ENDPOINTS;

function toItems(values: string[]): SearchableItem[] {
  return [...new Set(values)].map((v) => ({ id: v, label: v }));
}

/**
 * Suggestions for a `TagField`. With `autocomplete` set, fetches from the
 * matching public-data API route once the user has typed 2+ characters (the
 * Tokenizer debounces keystrokes); otherwise suggests nothing and the user
 * simply adds what they type.
 */
function useSuggestionSource(autocomplete?: AutocompleteSource): SearchSource {
  return React.useMemo<SearchSource>(() => {
    if (!autocomplete) return { search: () => [], bootstrap: () => [] };
    const endpoint = AUTOCOMPLETE_ENDPOINTS[autocomplete];
    let controller: AbortController | null = null;
    return {
      cancel() {
        controller?.abort();
        controller = null;
      },
      async search(query: string) {
        const q = query.trim();
        if (q.length < 2) return [];
        controller?.abort();
        const current = new AbortController();
        controller = current;
        try {
          const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`, { signal: current.signal });
          if (!res.ok) return [];
          const data = (await res.json()) as string[] | null;
          return Array.isArray(data) ? toItems(data) : [];
        } catch {
          return [];
        }
      },
      bootstrap: () => [],
    };
  }, [autocomplete]);
}

/**
 * A list of short words or phrases (job titles, places, skills). Type, then
 * press Add (or Enter) to add your own; with `autocomplete`, matching
 * suggestions appear as you type.
 */
export function TagField({
  label,
  hint,
  values,
  onChange,
  placeholder,
  autocomplete,
}: {
  label: string;
  hint?: React.ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  autocomplete?: AutocompleteSource;
}) {
  const source = useSuggestionSource(autocomplete);
  const items = React.useMemo(() => toItems(values), [values]);
  // What's typed but not added yet. Enter is hard to find on many touch
  // keyboards, so an "Add" button beside the box does the same thing.
  const [query, setQuery] = React.useState("");
  // The box can't be emptied from outside, so after "Add" it starts afresh
  // (new key) and gets the focus back for the next word.
  const [round, setRound] = React.useState(0);
  const handleRef = React.useRef<TokenizerHandle>(null);
  const refocusRef = React.useRef(false);
  React.useEffect(() => {
    if (!refocusRef.current) return;
    refocusRef.current = false;
    handleRef.current?.focus();
  }, [round]);

  function addTyped() {
    const text = query.trim();
    if (!text) return;
    if (!values.some((v) => v.toLowerCase() === text.toLowerCase())) onChange([...values, text]);
    setQuery("");
    refocusRef.current = true;
    setRound((r) => r + 1);
  }

  return (
    <WithHint hint={hint}>
      {(describedBy) => (
        <HStack gap={3} vAlign="end" className="min-w-0">
          {/* Each saved word is a token with an "×" to remove it. Out of the box
              the token text is below our 16px floor and the "×" is a 16px target,
              so: body-size text, and a 44px square "×". */}
          <div className="min-w-0 flex-1 [&_.astryx-token]:[font-size:var(--text-body-size)] [&_[data-astryx-token-remove]]:inline-flex [&_[data-astryx-token-remove]]:min-h-11 [&_[data-astryx-token-remove]]:min-w-11 [&_[data-astryx-token-remove]]:items-center [&_[data-astryx-token-remove]]:justify-center">
            <Tokenizer
              key={round}
              handleRef={handleRef}
              label={label}
              aria-describedby={describedBy}
              searchSource={source}
              value={items}
              onChange={(next) => onChange(next.map((item) => item.label))}
              onChangeQuery={setQuery}
              placeholder={placeholder ?? "Type here"}
              hasCreate
              debounceMs={autocomplete ? 200 : 0}
              // Always the box on the page (not a pop-up sheet on phones), so
              // the "Add" button can sit beside it.
              presentation="popover"
              size="lg"
              width="100%"
            />
          </div>
          {query.trim() ? <Button label="Add" icon={<Icon icon={Plus} />} onClick={addTyped} /> : null}
        </HStack>
      )}
    </WithHint>
  );
}

// ── Time zone and currency ───────────────────────────────────────────────────
//
// Both are saved as codes (an IANA time zone id like "America/Chicago", an
// ISO currency code like "USD"), but people pick and read plain names.

/** Used when the browser can't list every time zone itself. */
const FALLBACK_TIME_ZONES = [
  "Pacific/Honolulu",
  "America/Anchorage",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Denver",
  "America/Phoenix",
  "America/Chicago",
  "America/Mexico_City",
  "America/New_York",
  "America/Toronto",
  "America/Halifax",
  "America/Bogota",
  "America/Sao_Paulo",
  "America/Argentina/Buenos_Aires",
  "Europe/London",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Amsterdam",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "Europe/Moscow",
  "Africa/Lagos",
  "Africa/Accra",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Nairobi",
  "Asia/Dubai",
  "Asia/Karachi",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Asia/Bangkok",
  "Asia/Jakarta",
  "Asia/Singapore",
  "Asia/Manila",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Perth",
  "Australia/Sydney",
  "Pacific/Auckland",
  "UTC",
];

/** The browser's own time zone, e.g. "America/Chicago" ("" if it can't tell). */
export function detectTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

const timeZoneLabels = new Map<string, string>();

/** "America/Chicago" → "Central Time — Chicago". Unknown ids come back as saved. */
export function timeZoneLabel(id?: string | null): string {
  const v = id?.trim();
  if (!v) return "";
  const cached = timeZoneLabels.get(v);
  if (cached) return cached;
  let name = "";
  // "longGeneric" ("Central Time") is newer; fall back to "long" where it's missing.
  for (const style of ["longGeneric", "long"] as const) {
    try {
      name =
        new Intl.DateTimeFormat("en-US", { timeZone: v, timeZoneName: style })
          .formatToParts(new Date())
          .find((part) => part.type === "timeZoneName")?.value ?? "";
    } catch {
      name = "";
    }
    if (name) break;
  }
  const place = (v.split("/").pop() ?? v).replace(/_/g, " ");
  const label = !name ? v : name === place ? name : `${name} — ${place}`;
  timeZoneLabels.set(v, label);
  return label;
}

let timeZoneOptionsCache: SelectorOptionData[] | null = null;

function timeZoneOptions(): SelectorOptionData[] {
  if (timeZoneOptionsCache) return timeZoneOptionsCache;
  let ids = FALLBACK_TIME_ZONES;
  try {
    const all = Intl.supportedValuesOf("timeZone");
    if (all.length > 0) ids = all;
  } catch {
    // Older browsers: keep the short list.
  }
  // Leave out the "Etc/GMT+5"-style ids: they read backwards to most people.
  const kept = ids.filter((id) => id.includes("/") && !id.startsWith("Etc/"));
  if (!kept.includes("UTC")) kept.push("UTC");
  timeZoneOptionsCache = kept
    .map((id) => ({ value: id, label: timeZoneLabel(id) }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return timeZoneOptionsCache;
}

/** Keeps a saved value that isn't in the list selectable, under its own name. */
function withSavedValue(
  options: SelectorOptionData[],
  value: string,
  label: (v: string) => string,
): SelectorOptionData[] {
  return value && !options.some((o) => o.value === value) ? [{ value, label: label(value) || value }, ...options] : options;
}

/** A time zone, picked by its plain name and searchable by city. */
export function TimeZoneField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = React.useMemo(() => withSavedValue(timeZoneOptions(), value, timeZoneLabel), [value]);
  return (
    <WithHint hint={hint}>
      {(describedBy) => (
        <Selector
          label={label}
          aria-describedby={describedBy}
          options={options}
          value={value || undefined}
          onChange={onChange}
          placeholder="Choose your time zone"
          hasSearch
          searchPlaceholder="Type a city, like Chicago"
          emptySearchText="No time zone matches that. Try a big city near you."
          presentation="adaptive"
          width="100%"
        />
      )}
    </WithHint>
  );
}

/** The currencies offered; any other saved code stays selectable too. */
const COMMON_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "INR",
  "CAD",
  "AUD",
  "NZD",
  "NGN",
  "GHS",
  "KES",
  "ZAR",
  "EGP",
  "SGD",
  "AED",
  "SAR",
  "PKR",
  "BDT",
  "PHP",
  "IDR",
  "MYR",
  "CNY",
  "HKD",
  "JPY",
  "KRW",
  "CHF",
  "SEK",
  "PLN",
  "BRL",
  "MXN",
  "COP",
];

/** "USD" → "US Dollar (USD)". Anything that isn't a currency code comes back as saved. */
export function currencyLabel(code?: string | null): string {
  const v = code?.trim();
  if (!v) return "";
  const upper = v.toUpperCase();
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(upper);
    if (name && name.toUpperCase() !== upper) return `${name} (${upper})`;
  } catch {
    // Not a currency code (e.g. "$" or "dollars"): show it as written.
  }
  return v;
}

let currencyOptionsCache: SelectorOptionData[] | null = null;

function currencyOptions(): SelectorOptionData[] {
  currencyOptionsCache ??= COMMON_CURRENCIES.map((code) => ({ value: code, label: currencyLabel(code) })).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  return currencyOptionsCache;
}

/** A currency, picked by its name. */
export function CurrencyField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
}) {
  const options = React.useMemo(() => withSavedValue(currencyOptions(), value, currencyLabel), [value]);
  return (
    <WithHint hint={hint}>
      {(describedBy) => (
        <Selector
          label={label}
          aria-describedby={describedBy}
          options={options}
          value={value || undefined}
          onChange={onChange}
          placeholder="Choose a currency"
          presentation="adaptive"
          width="100%"
        />
      )}
    </WithHint>
  );
}

function parseLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Bullet points (e.g. job highlights) as a plain text box, one point per line.
 * Saves as a list of strings, same as before.
 */
export function LinesField({
  label,
  hint = "Put each point on its own line.",
  values,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: React.ReactNode;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = React.useState(() => values.join("\n"));
  const [seen, setSeen] = React.useState(values);
  if (values !== seen) {
    // The list changed from outside (e.g. an entry above this one was removed,
    // so this box now belongs to a different entry) — show its lines instead.
    setSeen(values);
    if (!sameList(parseLines(text), values)) setText(values.join("\n"));
  }
  return (
    <TextAreaField
      label={label}
      hint={hint}
      value={text}
      placeholder={placeholder}
      rows={Math.min(10, Math.max(3, text.split("\n").length + 1))}
      onChange={(next) => {
        setText(next);
        const lines = parseLines(next);
        setSeen(lines);
        onChange(lines);
      }}
    />
  );
}

// ── Lists of entries (jobs, schools, projects…) ─────────────────────────────

/**
 * One entry, set off from the one before by a line (not a box: it already
 * sits inside a card). In edit mode it gets a Remove button.
 */
export function EntryBlock({
  editing,
  removeLabel,
  onRemove,
  children,
}: {
  editing: boolean;
  removeLabel: string;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <VStack gap={4} className="min-w-0 border-t border-border pt-4">
      {children}
      {editing ? (
        <HStack hAlign="end">
          <Button variant="ghost" label={removeLabel} icon={<Icon icon={Trash2} />} onClick={onRemove} />
        </HStack>
      ) : null}
    </VStack>
  );
}

/** A titled group of entries with "Not added yet" when empty and an "Add …" button in edit mode. */
export function EntryGroup({
  title,
  description,
  editing,
  isEmpty,
  addLabel,
  onAdd,
  children,
}: {
  title?: string;
  description?: string;
  editing: boolean;
  isEmpty: boolean;
  addLabel: string;
  onAdd: () => void;
  children: React.ReactNode;
}) {
  return (
    <VStack gap={4}>
      {title ? (
        <VStack gap={0.5}>
          <Heading level={3}>{title}</Heading>
          {description ? <Text color="secondary">{description}</Text> : null}
        </VStack>
      ) : null}
      {children}
      {!editing && isEmpty ? <NotAdded /> : null}
      {editing ? (
        <HStack>
          <Button variant="secondary" label={addLabel} icon={<Icon icon={Plus} />} onClick={onAdd} />
        </HStack>
      ) : null}
    </VStack>
  );
}

/** Bullet points in view mode. */
export function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((h, i) => (
        <li key={i} className="[overflow-wrap:anywhere]">
          <Text>{h}</Text>
        </li>
      ))}
    </ul>
  );
}
