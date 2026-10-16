/** Status labels, colors, and utilization classification shared by the UI. */
import type { LinkStatus, PowerMode, SiteStatus } from "@heartland/shared";

export const STATUS_COLORS: Record<SiteStatus, string> = {
  planned: "#7183a5",
  building: "#f2b84b",
  online: "#37d67a",
  offline: "#8a97ad",
  unpowered: "#b58cff",
  failed: "#ff5f66",
  decommissioned: "#3a4560",
};

export const STATUS_LABELS: Record<SiteStatus, string> = {
  planned: "Planned",
  building: "Under construction",
  online: "Healthy",
  offline: "Offline",
  unpowered: "Unpowered",
  failed: "Failed",
  decommissioned: "Decommissioned",
};

export const LINK_COLORS: Record<LinkStatus, string> = {
  planned: "#7183a5",
  building: "#f2b84b",
  online: "#35d0bd",
  offline: "#8a97ad",
  failed: "#ff5f66",
  cut: "#ff5f66",
};

export const LINK_LABELS: Record<LinkStatus, string> = {
  planned: "Planned",
  building: "Building",
  online: "Online",
  offline: "Offline",
  failed: "Failed",
  cut: "Cut",
};

export const POWER_MODE_LABELS: Record<PowerMode, string> = {
  grid: "On grid power",
  battery: "On battery",
  generator: "On generator",
  down: "Power down",
};

export const POWER_MODE_COLORS: Record<PowerMode, string> = {
  grid: "#37d67a",
  battery: "#f2b84b",
  generator: "#ff9c4a",
  down: "#ff5f66",
};

export interface UtilClass {
  label: string;
  cls: string;
  color: string;
}

/** Classify utilization 0..1 for a progress bar. */
export function utilClass(used: number, capacity: number): UtilClass {
  if (capacity <= 0) return { label: "n/a", cls: "util-ok", color: "#8a97ad" };
  const u = used / capacity;
  if (u < 0.6) return { label: "Healthy", cls: "util-ok", color: "#37d67a" };
  if (u < 0.85) return { label: "Elevated", cls: "util-high", color: "#b9d84f" };
  if (u < 1.0) return { label: "Congested", cls: "util-congested", color: "#f2b84b" };
  return { label: "Critical", cls: "util-critical", color: "#ff5f66" };
}

export function fmtMoney(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}$${(abs / 1_000).toFixed(1)}K`;
  return `${sign}$${Math.round(abs).toLocaleString("en-US")}`;
}

export function fmtInt(v: number): string {
  return Math.round(v).toLocaleString("en-US");
}

export function fmtDate(day: number): string {
  // Day 1 = January 1, Year 1. 30-day months.
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const d = Math.max(0, day - 1);
  const year = 2026 + Math.floor(d / 360);
  const dayInYear = d % 360;
  const month = Math.floor(dayInYear / 30);
  const dom = (dayInYear % 30) + 1;
  return `${months[month]} ${dom}, ${year}`;
}

export function fmtMbps(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)} Gbps`;
  return `${Math.round(v)} Mbps`;
}
