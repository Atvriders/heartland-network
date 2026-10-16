/**
 * Network connectivity, routing, and traffic model.
 *
 * Roots are online central offices. A site is "reachable" if a path of online
 * links connects it to a root. Cabinets ride on their town's distribution
 * fiber and are online when the town is connected (CO or fiber-fed tower).
 */
import type { GameSave, Link, Site } from "@heartland/shared";

export interface SiteConnectivity {
  reachable: boolean;
  rootId?: string;
  /** Link ids along the path to the root, site-first. */
  pathLinkIds: string[];
  pathLengthKm: number;
}

export interface ConnectivityResult {
  sites: Map<string, SiteConnectivity>;
  /** Traffic in Mbps placed on each link by routing. */
  linkUsed: Map<string, number>;
  /** Districts whose serving anchor could not reach a root. */
  disconnectedDistricts: Set<string>;
  townConnected: Map<string, boolean>;
}

export function computeConnectivity(
  save: GameSave,
  districtTraffic: Map<string, number>,
  districtAnchor: Map<string, string>,
): ConnectivityResult {
  const sites = new Map<string, Site>();
  for (const s of save.sites) sites.set(s.id, s);
  const links = new Map<string, Link>();
  for (const l of save.links) links.set(l.id, l);

  // Adjacency over online links.
  const adj = new Map<string, { linkId: string; other: string; len: number }[]>();
  const addEdge = (l: Link) => {
    if (!sites.has(l.from) || !sites.has(l.to)) return;
    const a = adj.get(l.from) ?? [];
    const b = adj.get(l.to) ?? [];
    a.push({ linkId: l.id, other: l.to, len: l.lengthKm });
    b.push({ linkId: l.id, other: l.from, len: l.lengthKm });
    adj.set(l.from, a);
    adj.set(l.to, b);
  };
  for (const l of save.links) {
    if (l.status === "online") addEdge(l);
  }

  // Multi-source Dijkstra from all online COs.
  const roots = save.sites.filter((s) => s.kind === "co" && s.status === "online");
  const dist = new Map<string, number>();
  const parent = new Map<string, { site: string; linkId: string }>();
  const rootOf = new Map<string, string>();
  const pq: { id: string; d: number }[] = [];
  const push = (id: string, d: number) => {
    pq.push({ id, d });
    pq.sort((a, b) => b.d - a.d); // small priority queue via sort (n is tiny)
  };
  for (const r of roots) {
    dist.set(r.id, 0);
    rootOf.set(r.id, r.id);
    push(r.id, 0);
  }
  while (pq.length > 0) {
    const { id, d } = pq.pop()!;
    if ((dist.get(id) ?? Infinity) < d) continue;
    for (const e of adj.get(id) ?? []) {
      const nd = d + e.len;
      if (nd < (dist.get(e.other) ?? Infinity)) {
        dist.set(e.other, nd);
        parent.set(e.other, { site: id, linkId: e.linkId });
        rootOf.set(e.other, rootOf.get(id) ?? id);
        push(e.other, nd);
      }
    }
  }

  const siteConn = new Map<string, SiteConnectivity>();
  for (const s of save.sites) {
    const reachable = dist.has(s.id) && s.status === "online";
    const path: string[] = [];
    let len = 0;
    let cur = parent.get(s.id);
    while (cur) {
      path.push(cur.linkId);
      len += links.get(cur.linkId)?.lengthKm ?? 0;
      cur = parent.get(cur.site);
    }
    siteConn.set(s.id, {
      reachable,
      rootId: rootOf.get(s.id),
      pathLinkIds: path,
      pathLengthKm: len,
    });
  }

  // Town connectivity: any CO or tower in the town is reachable.
  const townConnected = new Map<string, boolean>();
  const townSites = new Map<string, Site[]>();
  for (const s of save.sites) {
    if (!s.townId) continue;
    const arr = townSites.get(s.townId) ?? [];
    arr.push(s);
    townSites.set(s.townId, arr);
  }
  for (const t of save.map.towns) {
    const anchors = (townSites.get(t.id) ?? []).filter(
      (s) => (s.kind === "co" || s.kind === "tower") && siteConn.get(s.id)?.reachable,
    );
    townConnected.set(t.id, anchors.length > 0);
  }

  // Route district traffic from its anchor to the root.
  const linkUsed = new Map<string, number>();
  const disconnectedDistricts = new Set<string>();
  for (const [districtId, traffic] of districtTraffic) {
    const anchorId = districtAnchor.get(districtId);
    if (!anchorId) {
      disconnectedDistricts.add(districtId);
      continue;
    }
    const conn = siteConn.get(anchorId);
    if (!conn || !conn.reachable || traffic <= 0) {
      if (!conn?.reachable) disconnectedDistricts.add(districtId);
      continue;
    }
    for (const linkId of conn.pathLinkIds) {
      linkUsed.set(linkId, (linkUsed.get(linkId) ?? 0) + traffic);
    }
  }

  return { sites: siteConn, linkUsed, disconnectedDistricts, townConnected };
}

/** True if a cabinet can be served from its town (CO or fiber-fed tower in town). */
export function cabinetTownServed(save: GameSave, cabinet: Site, conn: ConnectivityResult): boolean {
  if (!cabinet.townId) return false;
  const anchors = save.sites.filter(
    (s) => s.townId === cabinet.townId && s.kind === "co" && conn.sites.get(s.id)?.reachable,
  );
  if (anchors.length > 0) return true;
  const fiberFed = save.sites.filter(
    (s) => s.townId === cabinet.townId && s.kind === "tower" && s.fiberFed && conn.sites.get(s.id)?.reachable,
  );
  return fiberFed.length > 0;
}
