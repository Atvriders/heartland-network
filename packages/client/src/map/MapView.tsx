/** Interactive SVG map: terrain, roads, sites, links, coverage, incidents. */
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as RPointerEvent, MouseEvent as RMouseEvent, ReactNode } from "react";
import type { District, Link, LiveState, MapData, Site, Town } from "@heartland/shared";
import { CABINET_TIERS, CO_TIERS, FIBER_TIERS, MICROWAVE_TIERS, RADIO_TIERS } from "@heartland/shared";
import { useSnapshot, useStore, type TierOption, type Tool } from "../game/store.js";
import { screenToWorld, worldToScreen, type ViewTransform } from "../game/geometry.js";
import { LINK_COLORS, POWER_MODE_COLORS, STATUS_COLORS, utilClass } from "../game/format.js";

interface Projected<T> {
  item: T;
  sx: number;
  sy: number;
}

function terrainColor(e: number): string {
  if (e < 200) return "#16251a";
  if (e < 250) return "#182818";
  if (e < 300) return "#23321c";
  if (e < 360) return "#3a4325";
  if (e < 440) return "#54492b";
  if (e < 520) return "#64543a";
  return "#5d5d68";
}

function useTerrainImage(map: MapData | null): string | null {
  return useMemo(() => {
    if (!map) return null;
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = map.gridCols * scale;
    canvas.height = map.gridRows * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    for (let r = 0; r < map.gridRows; r++) {
      for (let c = 0; c < map.gridCols; c++) {
        const e = map.elevation[r * map.gridCols + c] ?? 120;
        ctx.fillStyle = terrainColor(e);
        ctx.fillRect(c * scale, r * scale, scale, scale);
      }
    }
    return canvas.toDataURL();
  }, [map]);
}

const SITE_HIT_RADIUS = 14;
const TOWN_HIT_RADIUS = 12;

export function MapView(): ReactNode {
  const snap = useSnapshot();
  const store = useStore();
  const map = snap.staticMap;
  const state = snap.state;
  const view = snap.view;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ moved: boolean }>({ moved: false });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
      store.setViewport(rect.width, rect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [store]);

  // Native wheel listener (React's is passive and can't preventDefault).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      store.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [store]);

  const terrain = useTerrainImage(map);
  const t: ViewTransform = { ...view, width: size.w, height: size.h };

  const proj = useMemo(() => {
    if (!map || !state) return null;
    const toS = (x: number, y: number) => worldToScreen(t, x, y);
    const sites = state.sites.map((s) => {
      const p = toS(s.x, s.y);
      return { item: s, sx: p.x, sy: p.y };
    });
    const towns = map.towns.map((tw) => {
      const p = toS(tw.x, tw.y);
      return { item: tw, sx: p.x, sy: p.y };
    });
    const districts = map.districts.map((d) => {
      const p = toS(d.x, d.y);
      return { item: d, sx: p.x, sy: p.y };
    });
    const links = state.links.map((l) => ({
      item: l,
      pts: l.path.map((p) => toS(p.x, p.y)),
    }));
    const siteById = new Map(sites.map((s) => [s.item.id, s]));
    return { sites, towns, districts, links, siteById };
  }, [map, state, view.cx, view.cy, view.scale, size.w, size.h]);

  const pointerDown = (e: RPointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragRef.current = { moved: false };
  };

  const pointerMove = (e: RPointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      return;
    }
    if (pointers.current.size === 2) {
      // Pinch zoom.
      const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
      const o = others[0]?.[1];
      if (o) {
        const rect = wrapRef.current!.getBoundingClientRect();
        const dPrev = Math.hypot(prev.x - o.x, prev.y - o.y);
        const dNow = Math.hypot(e.clientX - o.x, e.clientY - o.y);
        if (dPrev > 0 && dNow > 0) {
          store.zoomAt(e.clientX - rect.left, e.clientY - rect.top, dNow / dPrev);
        }
      }
    } else {
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.hypot(dx, dy) > 3) dragRef.current.moved = true;
      store.pan(dx, dy);
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };

  const pointerUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (dragRef.current.moved || pointers.current.size > 0) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    handleClick(sx, sy);
  };

  const handleClick = (sx: number, sy: number) => {
    if (!proj) return;
    const world = screenToWorld(t, sx, sy);
    if (snap.tool === "select") {
      const hit = hitTest(proj, sx, sy);
      if (hit?.kind === "site") store.select({ kind: "site", id: hit.item.id });
      else if (hit?.kind === "town") store.select({ kind: "town", id: hit.item.id });
      else if (hit?.kind === "district") store.select({ kind: "district", id: hit.item.id });
      else if (hit?.kind === "link") store.select({ kind: "link", id: hit.item.id });
      else store.select(null);
      return;
    }
    handleToolClick(snap.tool, sx, sy, world);
  };

  const openContextMenu = (sx: number, sy: number) => {
    if (!proj) return;
    const hit = hitTest(proj, sx, sy);
    const items: { label: string; danger?: boolean; onClick: () => void; disabled?: boolean }[] = [];
    if (hit?.kind === "site") {
      const s = hit.item;
      items.push(
        { label: "Inspect", onClick: () => store.select({ kind: "site", id: s.id }) },
        { label: "---", onClick: () => {} },
        {
          label: "Start fiber from here",
          onClick: () => {
            store.setTool("fiber");
            store.setBuildSource(s.id);
          },
          disabled: s.kind === "cabinet",
        },
        {
          label: "Start microwave from here",
          onClick: () => {
            store.setTool("microwave");
            store.setBuildSource(s.id);
          },
          disabled: s.kind !== "tower",
        },
        { label: "---", onClick: () => {} },
        {
          label: "Decommission",
          danger: true,
          onClick: () =>
            store.confirm(
              `Decommission ${s.name}?`,
              "Connected customers will lose service and churn immediately. A partial scrap refund will be paid.",
              () => void store.send({ cmd: "decommission", siteId: s.id }),
              { danger: true, confirmLabel: "Decommission" },
            ),
        },
      );
    } else if (hit?.kind === "town") {
      const tw = hit.item;
      items.push(
        {
          label: `Build office in ${tw.name}`,
          onClick: () => {
            store.setTool("co");
            store.setBuildSource(tw.id);
          },
        },
        { label: "Inspect town", onClick: () => store.select({ kind: "town", id: tw.id }) },
      );
    } else if (hit?.kind === "district") {
      items.push({
        label: `Build cabinet in ${hit.item.name}`,
        onClick: () => {
          store.setTool("cabinet");
          store.setBuildSource(hit.item.id);
        },
      });
    } else if (hit?.kind === "link") {
      const l = hit.item;
      items.push(
        { label: "Inspect link", onClick: () => store.select({ kind: "link", id: l.id }) },
        { label: "---", onClick: () => {} },
        {
          label: "Remove link",
          danger: true,
          onClick: () =>
            store.confirm(
              `Remove ${l.name}?`,
              "Traffic will reroute automatically if redundancy exists. There is no refund.",
              () => void store.send({ cmd: "removeLink", linkId: l.id }),
              { danger: true, confirmLabel: "Remove" },
            ),
        },
      );
    } else {
      items.push(
        { label: "Build tower here", onClick: () => store.setTool("tower") },
        { label: "Run storm drill here", onClick: () => stormDrillHere(sx, sy) },
        { label: "Reset view", onClick: () => store.resetView() },
      );
    }
    store.setContextMenu({ x: sx, y: sy, items });
  };

  const stormDrillHere = (sx: number, sy: number) => {
    const w = screenToWorld(t, sx, sy);
    store.confirm(
      "Run storm drill",
      "This simulates a severe storm at this location. Exposed sites and links may be damaged — repair crews will be needed.",
      () =>
        void store.send({
          cmd: "stormExercise",
          severity: 2,
          x: Math.round(w.x),
          y: Math.round(w.y),
          radiusKm: 55,
        }),
      { danger: true, confirmLabel: "Run drill" },
    );
  };

  const handleToolClick = (tool: Tool, sx: number, sy: number, world: { x: number; y: number }) => {
    if (!proj || !state) return;
    const day = state.meta.gameDay;
    if (tool === "tower") {
      const tiers: TierOption[] = RADIO_TIERS.map((r) => ({
        tier: r.tier,
        label: `${r.name}`,
        cost: r.structureCost + r.equipCost,
        days: r.days,
      }));
      void store.estimate({
        title: "New tower site",
        tierOptions: tiers,
        makeArgs: (tier) => ({
          cmd: "startProject",
          type: "tower",
          tier,
          x: Math.round(world.x * 10) / 10,
          y: Math.round(world.y * 10) / 10,
        }),
        apply: (tier) =>
          void store.send({
            cmd: "startProject",
            type: "tower",
            tier,
            x: Math.round(world.x * 10) / 10,
            y: Math.round(world.y * 10) / 10,
          }),
      });
      return;
    }
    if (tool === "co") {
      const town = nearestTown(proj, world);
      if (!town) {
        store.toast("warning", "Click on a town to site a central office.", day);
        return;
      }
      const tiers: TierOption[] = CO_TIERS.map((c) => ({
        tier: c.tier,
        label: `${c.name}`,
        cost: c.cost,
        days: c.days,
      }));
      void store.estimate({
        title: `${town.item.name} — Central Office`,
        tierOptions: tiers,
        makeArgs: (tier) => ({ cmd: "startProject", type: "co", tier, townId: town.item.id }),
        apply: (tier) => void store.send({ cmd: "startProject", type: "co", tier, townId: town.item.id }),
      });
      return;
    }
    if (tool === "cabinet") {
      const d = nearestDistrict(proj, world);
      if (!d) {
        store.toast("warning", "Click on a district dot (zoom in) to site a cabinet.", day);
        return;
      }
      const tiers: TierOption[] = CABINET_TIERS.map((c) => ({
        tier: c.tier,
        label: `${c.name}`,
        cost: c.cost,
        days: c.days,
      }));
      void store.estimate({
        title: `${d.item.name} — Cabinet`,
        tierOptions: tiers,
        makeArgs: (tier) => ({ cmd: "startProject", type: "cabinet", tier, districtId: d.item.id }),
        apply: (tier) =>
          void store.send({ cmd: "startProject", type: "cabinet", tier, districtId: d.item.id }),
      });
      return;
    }
    if (tool === "fiber" || tool === "microwave") {
      const hit = hitTest(proj, sx, sy);
      const site = hit?.kind === "site" ? hit.item : null;
      if (!site) {
        store.toast("info", "Click a site to choose each end of the link.", day);
        return;
      }
      if (tool === "microwave" && site.kind !== "tower") {
        store.toast("warning", "Microwave links connect two towers.", day);
        return;
      }
      const src = snap.buildSource;
      if (!src) {
        store.setBuildSource(site.id);
        return;
      }
      if (src === site.id) {
        store.setBuildSource(null);
        return;
      }
      const tiers: TierOption[] =
        tool === "fiber"
          ? FIBER_TIERS.map((f) => ({
              tier: f.tier,
              label: `${f.name} (${f.capacityMbps} Mbps)`,
              cost: Math.round(f.costPerKm),
              days: Math.round(f.daysPerKm),
            }))
          : MICROWAVE_TIERS.map((m) => ({
              tier: m.tier,
              label: `${m.name} (${m.capacityMbps} Mbps)`,
              cost: m.cost,
              days: m.days,
            }));
      void store.estimate({
        title: tool === "fiber" ? "Fiber trunk link" : "Microwave backhaul",
        tierOptions: tiers,
        makeArgs: (tier) => ({ cmd: "startProject", type: tool, tier, fromSiteId: src, toSiteId: site.id }),
        apply: (tier) => {
          void store.send({ cmd: "startProject", type: tool, tier, fromSiteId: src, toSiteId: site.id });
          store.setBuildSource(null);
        },
      });
      return;
    }
    if (
      tool === "battery" ||
      tool === "generator" ||
      tool === "solar" ||
      tool === "renovate" ||
      tool === "upgrade"
    ) {
      const hit = hitTest(proj, sx, sy);
      const site = hit?.kind === "site" ? hit.item : null;
      if (!site) {
        store.toast("info", "Click a site to apply this improvement.", day);
        return;
      }
      store.select({ kind: "site", id: site.id });
      return;
    }
  };

  const onContextMenu = (e: RMouseEvent) => {
    e.preventDefault();
    const rect = wrapRef.current!.getBoundingClientRect();
    openContextMenu(e.clientX - rect.left, e.clientY - rect.top);
  };

  const onMouseMove = (e: RMouseEvent) => {
    if (!proj) return;
    const rect = wrapRef.current!.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const hit = hitTest(proj, sx, sy);
    if (!hit) {
      if (store.getSnapshot().tooltip) store.setTooltip(null);
      return;
    }
    const tt = tooltipFor(hit.item, hit.kind, state);
    if (tt) {
      const cur = store.getSnapshot().tooltip;
      if (!cur || cur.title !== tt.title)
        store.setTooltip({ x: e.clientX, y: e.clientY, title: tt.title, lines: tt.lines });
    } else if (store.getSnapshot().tooltip) store.setTooltip(null);
  };

  if (!map) {
    return (
      <div ref={wrapRef} style={{ position: "absolute", inset: 0 }}>
        <div className="empty-state" style={{ marginTop: 80 }}>
          {snap.loading ? "Loading map…" : (snap.error ?? "No map data")}
        </div>
      </div>
    );
  }

  const sel = snap.selection;
  const buildSource = snap.buildSource;
  const tool = snap.tool;
  const showDistricts = view.scale > 1.15;
  const showTownLabels = view.scale > 0.6;
  const strokeScale = 1 / Math.sqrt(Math.max(0.6, view.scale));
  const w0 = worldToScreen(t, 0, 0);
  const w1 = worldToScreen(t, map.widthKm, map.heightKm);

  return (
    <div
      ref={wrapRef}
      className="map-canvas"
      style={{ position: "absolute", inset: 0, overflow: "hidden" }}
      onPointerDown={pointerDown}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onContextMenu={onContextMenu}
      onMouseMove={onMouseMove}
      onMouseLeave={() => store.setTooltip(null)}
      data-testid="map"
    >
      <svg width={size.w} height={size.h} style={{ display: "block" }}>
        {terrain && snap.layers.terrain && (
          <image href={terrain} x={w0.x} y={w0.y} width={w1.x - w0.x} height={w1.y - w0.y} />
        )}

        {snap.layers.terrain &&
          map.landmarks.map((lm) => {
            const p0 = worldToScreen(t, lm.x, lm.y);
            return (
              <g key={lm.id} opacity={0.85} pointerEvents="none">
                <circle
                  cx={p0.x}
                  cy={p0.y}
                  r={lm.radiusKm * view.scale}
                  fill={lm.kind === "lake" ? "rgba(70,120,190,0.16)" : "rgba(40,90,60,0.20)"}
                  stroke="rgba(120,160,210,0.25)"
                />
                {showTownLabels && (
                  <text x={p0.x} y={p0.y} textAnchor="middle" fontSize={11} fill="#7c93b8" fontStyle="italic">
                    {lm.name}
                  </text>
                )}
              </g>
            );
          })}

        {snap.layers.roads &&
          map.roads.map((r) => {
            const pts = r.points.map((p) => worldToScreen(t, p.x, p.y));
            const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
            return (
              <path
                key={r.id}
                d={d}
                fill="none"
                stroke={r.class === 2 ? "#4a5c7a" : "#394a66"}
                strokeWidth={Math.max(0.6, (r.class === 2 ? 2.2 : 1.4) * strokeScale)}
                strokeLinecap="round"
              />
            );
          })}

        {showDistricts &&
          proj?.districts.map((d) => {
            const dm = state?.districtsMarket[d.item.id];
            const served =
              (dm?.subs.fiber.hh ?? 0) +
                (dm?.subs.fiber.biz ?? 0) +
                (dm?.subs.wireless.hh ?? 0) +
                (dm?.subs.wireless.biz ?? 0) >
              0;
            return (
              <circle
                key={d.item.id}
                cx={d.sx}
                cy={d.sy}
                r={4.2}
                fill={served ? "#2fa86c" : "#435371"}
                stroke="#0b1220"
                strokeWidth={1}
                opacity={0.9}
                data-testid={`district-${d.item.id}`}
              />
            );
          })}

        {snap.layers.coverage &&
          state?.sites
            .filter((s) => s.kind === "tower" && s.status === "online" && s.radios?.length)
            .map((s) => {
              const range = RADIO_TIERS[s.tier - 1]?.maxRangeKm ?? 18;
              const p0 = worldToScreen(t, s.x, s.y);
              return (
                <g key={`cov-${s.id}`} pointerEvents="none">
                  <circle
                    cx={p0.x}
                    cy={p0.y}
                    r={range * view.scale}
                    fill="rgba(53,208,189,0.05)"
                    stroke="rgba(53,208,189,0.35)"
                    strokeWidth={1}
                    strokeDasharray="3 5"
                  />
                </g>
              );
            })}

        {snap.layers.incidents &&
          state?.incidents
            .filter((i) => i.status === "active" && i.radiusKm && i.x !== undefined && i.y !== undefined)
            .map((i) => {
              const p0 = worldToScreen(t, i.x!, i.y!);
              return (
                <g key={i.id} pointerEvents="none" data-testid={`incident-${i.id}`}>
                  <ellipse
                    cx={p0.x}
                    cy={p0.y}
                    rx={(i.radiusKm ?? 40) * view.scale}
                    ry={(i.radiusKm ?? 40) * view.scale * 0.72}
                    fill="rgba(255,95,102,0.08)"
                    stroke="rgba(255,95,102,0.55)"
                    strokeWidth={1.5}
                    className="pulse"
                  />
                  {showTownLabels && (
                    <text
                      x={p0.x}
                      y={p0.y - 8}
                      textAnchor="middle"
                      fontSize={11}
                      fill="#ff9aa0"
                      fontWeight={700}
                    >
                      {i.name}
                    </text>
                  )}
                </g>
              );
            })}

        {snap.layers.competitors &&
          proj?.towns.map((tw) => {
            const rival = state?.rivals.find((r) => (r.footprint[tw.item.id]?.share ?? 0) > 0.2);
            if (!rival) return null;
            return (
              <circle
                key={`rival-${tw.item.id}`}
                cx={tw.sx}
                cy={tw.sy}
                r={Math.max(8, (Math.sqrt(tw.item.pop) / 26) * 4)}
                fill="none"
                stroke={rival.color}
                strokeWidth={2}
                strokeDasharray="4 4"
                opacity={0.8}
                pointerEvents="none"
              />
            );
          })}

        {proj?.links.map((l) => {
          const pts = l.pts;
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
          const color = LINK_COLORS[l.item.status];
          const building = l.item.status === "building";
          const selL = sel?.kind === "link" && sel.id === l.item.id;
          const flow = l.item.flowMbps;
          const util = utilClass(l.item.usedMbps, l.item.capacityMbps);
          const width = Math.max(1.2, (l.item.kind === "fiber" ? 2.6 : 2.0) * strokeScale);
          return (
            <g key={l.item.id} data-testid={`link-${l.item.id}`}>
              {building && (
                <path
                  d={d}
                  fill="none"
                  stroke="#f2b84b"
                  strokeWidth={width + 2}
                  strokeDasharray="7 7"
                  opacity={0.9}
                  className="flow"
                />
              )}
              <path
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={selL ? width + 2.5 : width}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={building ? 0.35 : 0.9}
                strokeDasharray={l.item.kind === "microwave" && !building ? "6 5" : undefined}
              />
              {flow > 0 && l.item.status === "online" && snap.layers.traffic && (
                <path
                  d={d}
                  fill="none"
                  stroke={util.color}
                  strokeWidth={Math.max(1.2, width * 0.7)}
                  strokeLinecap="round"
                  className={`flow ${flow > 800 ? "veryfast" : flow > 250 ? "fast" : ""}`}
                  opacity={0.85}
                />
              )}
            </g>
          );
        })}

        {buildSource && (tool === "fiber" || tool === "microwave") && proj && (
          <g pointerEvents="none">
            {(() => {
              const src = proj.siteById.get(buildSource);
              if (!src) return null;
              return (
                <circle
                  cx={src.sx}
                  cy={src.sy}
                  r={12}
                  fill="none"
                  stroke="#5ba7ff"
                  strokeWidth={2.5}
                  className="pulse"
                />
              );
            })()}
          </g>
        )}

        {proj?.towns.map((tw) => {
          const ts = state?.townStats.find((x) => x.townId === tw.item.id);
          const served = ts ? ts.servedPct : 0;
          const r = Math.max(7, (Math.sqrt(tw.item.pop) / 26) * 4);
          const p0 = worldToScreen(t, tw.item.x, tw.item.y);
          const selected = sel?.kind === "town" && sel.id === tw.item.id;
          const ringColor = served >= 60 ? "#37d67a" : served > 0 ? "#f2b84b" : "#7183a5";
          return (
            <g key={tw.item.id} data-testid={`town-${tw.item.id}`} pointerEvents="visiblePainted">
              <circle
                cx={p0.x}
                cy={p0.y}
                r={r}
                fill="#0d1830"
                stroke={ringColor}
                strokeWidth={selected ? 3 : 2}
              />
              <circle
                cx={p0.x}
                cy={p0.y}
                r={r * Math.max(0.18, served / 100)}
                fill={ringColor}
                opacity={0.5}
                pointerEvents="none"
              />
              {showTownLabels && (
                <text
                  x={p0.x}
                  y={p0.y - r - 4}
                  textAnchor="middle"
                  fontSize={tw.item.kind === "capital" || tw.item.kind === "city" ? 13 : 11.5}
                  fontWeight={tw.item.kind === "capital" ? 800 : tw.item.kind === "city" ? 700 : 500}
                  fill={tw.item.kind === "capital" ? "#ffd894" : "#c6d4ea"}
                  pointerEvents="none"
                >
                  {tw.item.name}
                </text>
              )}
            </g>
          );
        })}

        {proj?.sites.map((s) => {
          const site = s.item;
          if (site.status === "decommissioned") return null;
          const color = STATUS_COLORS[site.status];
          const selected = sel?.kind === "site" && sel.id === site.id;
          const isSource = buildSource === site.id;
          const r = site.kind === "co" ? 13 : site.kind === "tower" ? 11 : 8;
          const building = site.status === "building";
          return (
            <g key={site.id} data-testid={`site-${site.id}`}>
              {(selected || isSource) && (
                <circle
                  cx={s.sx}
                  cy={s.sy}
                  r={r + 7}
                  fill="none"
                  stroke="#5ba7ff"
                  strokeWidth={2}
                  className={selected ? "" : "pulse"}
                />
              )}
              {building && (
                <circle
                  cx={s.sx}
                  cy={s.sy}
                  r={r + 5}
                  fill="none"
                  stroke="#f2b84b"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  className="flow"
                />
              )}
              <circle cx={s.sx} cy={s.sy} r={r} fill="#0e1a30" stroke={color} strokeWidth={2.4} />
              {site.kind === "co" && (
                <g transform={`translate(${s.sx - 7}, ${s.sy - 7})`} fill={color} pointerEvents="none">
                  <rect x={0} y={3} width={14} height={11} rx={1} />
                  <rect x={4.5} y={1} width={5} height={2} />
                </g>
              )}
              {site.kind === "tower" && (
                <path
                  d={`M${s.sx},${s.sy - 7} L${s.sx + 6},${s.sy + 6} L${s.sx - 6},${s.sy + 6} Z`}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.8}
                  pointerEvents="none"
                />
              )}
              {site.kind === "cabinet" && (
                <g fill={color} pointerEvents="none">
                  <circle cx={s.sx - 3} cy={s.sy} r={1.7} />
                  <circle cx={s.sx + 3} cy={s.sy} r={1.7} />
                  <circle cx={s.sx} cy={s.sy} r={1.7} />
                </g>
              )}
              {site.status === "unpowered" && (
                <text
                  x={s.sx + r + 3}
                  y={s.sy - r - 2}
                  fontSize={10}
                  fill={POWER_MODE_COLORS[site.power.mode]}
                  pointerEvents="none"
                >
                  ⚡
                </text>
              )}
              {site.power.mode === "battery" && site.status === "online" && (
                <circle
                  cx={s.sx}
                  cy={s.sy}
                  r={r + 4}
                  fill="none"
                  stroke={POWER_MODE_COLORS.battery}
                  strokeWidth={1.5}
                  strokeDasharray="2 3"
                  className="pulse"
                  pointerEvents="none"
                />
              )}
              {site.status === "failed" && (
                <text
                  x={s.sx + r + 2}
                  y={s.sy - r}
                  fontSize={12}
                  fill="#ff5f66"
                  fontWeight={800}
                  pointerEvents="none"
                >
                  !
                </text>
              )}
              {showTownLabels && site.kind === "co" && (
                <text
                  x={s.sx}
                  y={s.sy + r + 12}
                  textAnchor="middle"
                  fontSize={10.5}
                  fill="#9fc7d8"
                  pointerEvents="none"
                >
                  {site.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hit testing & tooltips
// ---------------------------------------------------------------------------

interface Proj {
  sites: Projected<Site>[];
  towns: Projected<Town>[];
  districts: Projected<District>[];
  links: { item: Link; pts: { x: number; y: number }[] }[];
  siteById: Map<string, Projected<Site>>;
}

function hitTest(
  p: Proj,
  sx: number,
  sy: number,
): { kind: "site" | "town" | "district" | "link"; item: Site | Town | District | Link } | null {
  for (const s of p.sites) {
    if (Math.hypot(s.sx - sx, s.sy - sy) <= SITE_HIT_RADIUS) return { kind: "site", item: s.item };
  }
  for (const tw of p.towns) {
    const r = Math.max(TOWN_HIT_RADIUS, (Math.sqrt(tw.item.pop) / 26) * 4);
    if (Math.hypot(tw.sx - sx, tw.sy - sy) <= r) return { kind: "town", item: tw.item };
  }
  for (const d of p.districts) {
    if (Math.hypot(d.sx - sx, d.sy - sy) <= 8) return { kind: "district", item: d.item };
  }
  let best: { item: Link; d: number } | null = null;
  for (const l of p.links) {
    for (let i = 1; i < l.pts.length; i++) {
      const d = distToSegment(sx, sy, l.pts[i - 1]!, l.pts[i]!);
      if (d < 7 && (!best || d < best.d)) best = { item: l.item, d };
    }
  }
  if (best) return { kind: "link", item: best.item };
  return null;
}

function distToSegment(
  px: number,
  py: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const tt = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
  const cx = a.x + tt * dx;
  const cy = a.y + tt * dy;
  return Math.hypot(px - cx, py - cy);
}

function nearestTown(p: Proj, world: { x: number; y: number }): Projected<Town> | null {
  let best: Projected<Town> | null = null;
  let bestD = Infinity;
  for (const tw of p.towns) {
    const d = Math.hypot(tw.item.x - world.x, tw.item.y - world.y);
    if (d < bestD) {
      bestD = d;
      best = tw;
    }
  }
  return best;
}

function nearestDistrict(p: Proj, world: { x: number; y: number }): Projected<District> | null {
  let best: Projected<District> | null = null;
  let bestD = Infinity;
  for (const d of p.districts) {
    const dist = Math.hypot(d.item.x - world.x, d.item.y - world.y);
    if (dist < bestD) {
      bestD = dist;
      best = d;
    }
  }
  if (!best || bestD > 14) return null;
  return best;
}

function tooltipFor(
  item: Site | Town | District | Link,
  kind: "site" | "town" | "district" | "link",
  state: LiveState | null,
): { title: string; lines: string[] } | null {
  if (kind === "site") {
    const s = item as Site;
    const dm = s.districtId ? state?.districtsMarket[s.districtId] : undefined;
    const subs = dm
      ? dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz
      : undefined;
    return {
      title: s.name,
      lines: [
        `${s.kind === "co" ? "Central office" : s.kind === "tower" ? "Tower" : "Cabinet"} · Tier ${s.tier}`,
        `Status: ${s.status} · Power: ${s.power.mode}`,
        subs !== undefined ? `Subscribers: ${subs.toLocaleString()}` : "",
      ].filter(Boolean),
    };
  }
  if (kind === "town") {
    const tw = item as Town;
    const ts = state?.townStats.find((x) => x.townId === tw.id);
    return {
      title: tw.name,
      lines: [
        `Population ${tw.pop.toLocaleString()}`,
        ts ? `Served: ${ts.servedPct}% · ${ts.subs.toLocaleString()} subs` : "No service yet",
        ts ? `Uplink: ${ts.uplinkUsedMbps}/${ts.uplinkMbps} Mbps` : "",
      ].filter(Boolean),
    };
  }
  if (kind === "district") {
    const d = item as District;
    const dm = state?.districtsMarket[d.id];
    const subs = dm ? dm.subs.fiber.hh + dm.subs.fiber.biz + dm.subs.wireless.hh + dm.subs.wireless.biz : 0;
    return {
      title: d.name,
      lines: [
        `${d.households.toLocaleString()} homes · ${d.businesses} businesses`,
        `Subscribers: ${subs.toLocaleString()}`,
        `Satisfaction: ${Math.round(dm?.satisfaction ?? 0)}%`,
      ],
    };
  }
  if (kind === "link") {
    const l = item as Link;
    const util = utilClass(l.usedMbps, l.capacityMbps);
    return {
      title: l.name,
      lines: [
        `${l.kind === "fiber" ? "Fiber" : "Microwave"} · ${l.lengthKm.toFixed(0)} km · Tier ${l.tier}${l.dwdm ? " + DWDM" : ""}`,
        `Status: ${l.status}`,
        `Traffic: ${l.usedMbps}/${l.capacityMbps} Mbps (${util.label})`,
      ],
    };
  }
  return null;
}
