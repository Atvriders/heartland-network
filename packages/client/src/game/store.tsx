/** Central client store: live game state + UI state, exposed via hooks. */
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { Command, GameEvent, LiveState, MapData, Site, Incident } from "@heartland/shared";
import { command as sendCmd, loadGame, openSocket, saveGame } from "../api.js";
import { fitView, type ViewTransform } from "./geometry.js";

export type Tool =
  | "select"
  | "co"
  | "tower"
  | "cabinet"
  | "fiber"
  | "microwave"
  | "battery"
  | "generator"
  | "solar"
  | "renovate"
  | "upgrade";

export type PanelId = "finance" | "customers" | "network" | "research" | "incidents" | "admin";

export interface Selection {
  kind: "site" | "link" | "town" | "district" | "incident";
  id: string;
}

export interface TierOption {
  tier: number;
  label: string;
  cost?: number;
  days?: number;
}

export interface BuildPreview {
  tool: Tool;
  title: string;
  detail: string;
  cost: number;
  days: number;
  error?: string;
  tier: number;
  tierOptions: TierOption[];
  makeArgs: (tier: number) => Extract<Command, { cmd: "startProject" }>;
  apply: (tier: number) => void;
  reestimate: (tier: number) => void;
  loading?: boolean;
}

export interface DialogState {
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
}

export interface Toast {
  id: number;
  severity: "info" | "warning" | "critical";
  message: string;
  day: number;
}

export interface FeedEntry extends Toast {}

export interface ContextMenuState {
  x: number;
  y: number;
  items: { label: string; icon?: string; danger?: boolean; onClick: () => void; disabled?: boolean }[];
}

export interface TooltipState {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

export interface Layers {
  terrain: boolean;
  roads: boolean;
  coverage: boolean;
  incidents: boolean;
  labels: boolean;
  traffic: boolean;
  competitors: boolean;
}

export interface StoreSnapshot {
  state: LiveState | null;
  staticMap: MapData | null;
  loading: boolean;
  error: string | null;
  wsConnected: boolean;
  tool: Tool;
  selection: Selection | null;
  buildSource: string | null;
  buildPreview: BuildPreview | null;
  view: ViewTransform;
  layers: Layers;
  panel: PanelId | null;
  dialog: DialogState | null;
  toasts: Toast[];
  feed: FeedEntry[];
  contextMenu: ContextMenuState | null;
  tooltip: TooltipState | null;
  savedDay: number | null;
  lastCommandError: string | null;
}

let seq = 1;

export class GameStore {
  gameId: string;
  private snap: StoreSnapshot;
  private listeners = new Set<() => void>();
  private ws: { close: () => void } | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(gameId: string) {
    this.gameId = gameId;
    this.snap = {
      state: null,
      staticMap: null,
      loading: true,
      error: null,
      wsConnected: false,
      tool: "select",
      selection: null,
      buildSource: null,
      buildPreview: null,
      view: { cx: 480, cy: 320, scale: 1, width: 1200, height: 800 },
      layers: {
        terrain: true,
        roads: true,
        coverage: true,
        incidents: true,
        labels: true,
        traffic: true,
        competitors: false,
      },
      panel: null,
      dialog: null,
      toasts: [],
      feed: [],
      contextMenu: null,
      tooltip: null,
      savedDay: null,
      lastCommandError: null,
    };
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): StoreSnapshot => this.snap;

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private set(patch: Partial<StoreSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    this.emit();
  }

  async init(): Promise<void> {
    try {
      const res = await loadGame(this.gameId);
      this.set({
        state: res.state,
        staticMap: res.staticMap,
        loading: false,
        view: {
          ...this.snap.view,
          ...fitView(res.staticMap.widthKm, res.staticMap.heightKm, window.innerWidth, window.innerHeight),
        },
      });
      this.connectWs();
    } catch (e) {
      this.set({ loading: false, error: (e as Error).message });
    }
  }

  private connectWs(): void {
    this.ws?.close();
    this.ws = openSocket(this.gameId, {
      onState: (state) => {
        this.set({ state, wsConnected: true });
      },
      onEvent: (m) => this.pushEvent(m.event),
      onSaved: (day) => this.set({ savedDay: day }),
      onClose: () => this.set({ wsConnected: false }),
    });
  }

  setViewport(width: number, height: number): void {
    if (Math.abs(width - this.snap.view.width) > 4 || Math.abs(height - this.snap.view.height) > 4) {
      this.set({ view: { ...this.snap.view, width, height } });
    }
  }

  pan(dx: number, dy: number): void {
    this.set({
      view: {
        ...this.snap.view,
        cx: this.snap.view.cx - dx / this.snap.view.scale,
        cy: this.snap.view.cy - dy / this.snap.view.scale,
      },
    });
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const v = this.snap.view;
    const newScale = Math.min(26, Math.max(0.35, v.scale * factor));
    // Keep the world point under the cursor fixed.
    const wx = (sx - v.width / 2) / v.scale + v.cx;
    const wy = (sy - v.height / 2) / v.scale + v.cy;
    const cx = wx - (sx - v.width / 2) / newScale;
    const cy = wy - (sy - v.height / 2) / newScale;
    this.set({ view: { ...v, scale: newScale, cx, cy } });
  }

  resetView(): void {
    const m = this.snap.staticMap;
    if (!m) return;
    this.set({
      view: {
        ...this.snap.view,
        ...fitView(m.widthKm, m.heightKm, this.snap.view.width, this.snap.view.height),
      },
    });
  }

  setTool(tool: Tool): void {
    this.set({ tool, buildSource: null, buildPreview: null });
  }

  setLayers(patch: Partial<Layers>): void {
    this.set({ layers: { ...this.snap.layers, ...patch } });
  }

  select(sel: Selection | null): void {
    this.set({ selection: sel });
  }

  setPanel(panel: PanelId | null): void {
    this.set({ panel });
  }

  setDialog(dialog: DialogState | null): void {
    this.set({ dialog });
  }

  setContextMenu(menu: ContextMenuState | null): void {
    this.set({ contextMenu: menu });
  }

  setTooltip(tt: TooltipState | null): void {
    this.set({ tooltip: tt });
  }

  setBuildSource(id: string | null): void {
    this.set({ buildSource: id });
  }

  setBuildPreview(p: BuildPreview | null): void {
    this.set({ buildPreview: p });
  }

  pushEvent(ev: GameEvent): void {
    const entry: FeedEntry = { id: seq++, severity: ev.severity, message: ev.message, day: ev.day };
    const feed = [entry, ...this.snap.feed].slice(0, 80);
    this.set({ feed });
    if (ev.type !== "info") this.toast(ev.severity, ev.message, ev.day);
  }

  toast(severity: Toast["severity"], message: string, day: number): void {
    const t: Toast = { id: seq++, severity, message, day };
    this.set({ toasts: [...this.snap.toasts.slice(-3), t] });
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.set({ toasts: this.snap.toasts.filter((x) => x.id !== t.id) });
    }, 6000);
  }

  async send(cmd: Command, opts?: { silent?: boolean }): Promise<boolean> {
    try {
      const res = await sendCmd(this.gameId, cmd);
      if (!res.ok) {
        this.toast("warning", res.error ?? "Command failed", this.snap.state?.meta.gameDay ?? 0);
        if (!opts?.silent) this.set({ lastCommandError: res.error ?? null });
        return false;
      }
      for (const ev of res.events) this.pushEvent(ev);
      this.set({ lastCommandError: null });
      return true;
    } catch (e) {
      this.toast("critical", `Server error: ${(e as Error).message}`, this.snap.state?.meta.gameDay ?? 0);
      return false;
    }
  }

  async saveNow(): Promise<void> {
    try {
      await saveGame(this.gameId);
      this.toast("info", "Game saved.", this.snap.state?.meta.gameDay ?? 0);
    } catch (e) {
      this.toast("critical", `Save failed: ${(e as Error).message}`, 0);
    }
  }

  /** Estimated cost preview helper for build tools (supports tier selection). */
  async estimate(opts: {
    title: string;
    tierOptions: TierOption[];
    makeArgs: (tier: number) => Extract<Command, { cmd: "startProject" }>;
    apply: (tier: number) => void;
    initialTier?: number;
  }): Promise<void> {
    const initialTier = opts.initialTier ?? opts.tierOptions[0]?.tier ?? 1;
    const mk = (loading: boolean): BuildPreview => ({
      tool: "select",
      title: opts.title,
      detail: loading ? "Estimating…" : "",
      cost: 0,
      days: 0,
      tier: initialTier,
      tierOptions: opts.tierOptions,
      makeArgs: opts.makeArgs,
      apply: opts.apply,
      reestimate: (tier) => void this.runEstimate(opts, tier),
      loading,
    });
    this.set({ buildPreview: mk(true) });
    await this.runEstimate(opts, initialTier);
  }

  private async runEstimate(
    opts: {
      title: string;
      tierOptions: TierOption[];
      makeArgs: (tier: number) => Extract<Command, { cmd: "startProject" }>;
      apply: (tier: number) => void;
    },
    tier: number,
  ): Promise<void> {
    const base = (loading: boolean): BuildPreview => ({
      tool: "select",
      title: opts.title,
      detail: loading ? "Estimating…" : "",
      cost: 0,
      days: 0,
      tier,
      tierOptions: opts.tierOptions,
      makeArgs: opts.makeArgs,
      apply: opts.apply,
      reestimate: (t) => void this.runEstimate(opts, t),
      loading,
    });
    this.set({ buildPreview: base(true) });
    try {
      const res = await fetch(`/api/games/${this.gameId}/estimate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(opts.makeArgs(tier)),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; cost?: number; days?: number };
      if (!data.ok) {
        this.set({
          buildPreview: {
            ...base(false),
            detail: data.error ?? "Cannot build here.",
            error: data.error,
          },
        });
        this.toast("warning", data.error ?? "Cannot build here.", this.snap.state?.meta.gameDay ?? 0);
        return;
      }
      this.set({
        buildPreview: {
          ...base(false),
          detail: `${data.days ?? 0} days · $${(data.cost ?? 0).toLocaleString("en-US")}`,
          cost: data.cost ?? 0,
          days: data.days ?? 0,
        },
      });
    } catch (e) {
      this.set({ buildPreview: null });
      this.toast("critical", `Estimate failed: ${(e as Error).message}`, 0);
    }
  }

  /** Quick confirm dialog for destructive actions. */
  confirm(
    title: string,
    body: string,
    onConfirm: () => void,
    opts?: { danger?: boolean; confirmLabel?: string },
  ): void {
    this.set({
      dialog: {
        title,
        body,
        confirmLabel: opts?.confirmLabel ?? "Confirm",
        danger: opts?.danger,
        onConfirm,
      },
    });
  }

  site(id: string): Site | undefined {
    return this.snap.state?.sites.find((s) => s.id === id);
  }

  incident(id: string): Incident | undefined {
    return this.snap.state?.incidents.find((i) => i.id === id);
  }
}

// ---------------------------------------------------------------------------
// React integration
// ---------------------------------------------------------------------------

const StoreContext = createContext<GameStore | null>(null);

export function StoreProvider({ store, children }: { store: GameStore; children: ReactNode }) {
  useEffect(() => {
    void store.init();
  }, [store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): GameStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error("StoreProvider missing");
  return s;
}

export function useSnapshot(): StoreSnapshot {
  const s = useStore();
  return useSyncExternalStore(s.subscribe, s.getSnapshot, s.getSnapshot);
}

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
