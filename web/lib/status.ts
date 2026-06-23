import { AppStatus } from "@prisma/client";

/**
 * Status normalization + presentation. Kept in sync with the Go dashboard's
 * NormalizeStatus / StatusPriority (which mirror templates/states.yml).
 */

export const STATUS_OPTIONS = [
  AppStatus.Evaluated,
  AppStatus.Applied,
  AppStatus.Responded,
  AppStatus.Interview,
  AppStatus.Offer,
  AppStatus.Rejected,
  AppStatus.Discarded,
  AppStatus.SKIP,
] as const;

export const STATUS_GROUP_ORDER = [
  "interview",
  "offer",
  "responded",
  "applied",
  "evaluated",
  "skip",
  "rejected",
  "discarded",
] as const;

export function normalizeStatus(raw: string): string {
  let s = raw.replace(/\*\*/g, "");
  s = s.trim().toLowerCase();
  const dateIdx = s.indexOf(" 202");
  if (dateIdx > 0) s = s.slice(0, dateIdx).trim();

  if (s.includes("no aplicar") || s.includes("no_aplicar") || s === "skip" || s.includes("geo blocker"))
    return "skip";
  if (s.includes("interview") || s.includes("entrevista")) return "interview";
  if (s === "offer" || s.includes("oferta")) return "offer";
  if (s.includes("responded") || s.includes("respondido")) return "responded";
  if (
    s.includes("applied") ||
    s.includes("aplicado") ||
    s === "enviada" ||
    s === "aplicada" ||
    s === "sent"
  )
    return "applied";
  if (s.includes("rejected") || s.includes("rechazado") || s === "rechazada") return "rejected";
  if (
    s.includes("discarded") ||
    s.includes("descartado") ||
    s === "descartada" ||
    s === "cerrada" ||
    s === "cancelada" ||
    s.startsWith("duplicado") ||
    s.startsWith("dup")
  )
    return "discarded";
  if (
    s.includes("evaluated") ||
    s.includes("evaluada") ||
    s === "condicional" ||
    s === "hold" ||
    s === "monitor" ||
    s === "evaluar" ||
    s === "verificar"
  )
    return "evaluated";
  return s;
}

export function statusPriority(status: string): number {
  switch (normalizeStatus(status)) {
    case "interview":
      return 0;
    case "offer":
      return 1;
    case "responded":
      return 2;
    case "applied":
      return 3;
    case "evaluated":
      return 4;
    case "skip":
      return 5;
    case "rejected":
      return 6;
    case "discarded":
      return 7;
    default:
      return 8;
  }
}

export function statusLabel(norm: string): string {
  return norm.charAt(0).toUpperCase() + norm.slice(1);
}
