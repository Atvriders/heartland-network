/** Small id helpers. */
import { randomBytes } from "node:crypto";

export function shortId(prefix: string): string {
  return `${prefix}_${randomBytes(5).toString("hex")}`;
}

let seq = 0;
/** Sequential ids for save-internal objects (stable across restarts). */
export function seqId(prefix: string, counters: { nextId: number }): string {
  seq = counters.nextId;
  counters.nextId += 1;
  return `${prefix}_${seq}`;
}
