/**
 * Seeded 2D value noise for terrain elevation.
 * Produces smooth rolling plains/hills suitable for a midwestern state.
 */
import type { RngState } from "./rng.js";
import { rngNext } from "./rng.js";

/** Smoothstep interpolation. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function generateElevationGrid(rng: RngState, cols: number, rows: number, scale = 0.055): number[] {
  // Lattice of random gradients at a coarse resolution, interpolated.
  const gCols = Math.ceil(cols * scale) + 2;
  const gRows = Math.ceil(rows * scale) + 2;
  const grads: number[] = new Array(gCols * gRows);
  for (let i = 0; i < grads.length; i++) grads[i] = rngNext(rng);

  const out: number[] = new Array(cols * rows);
  const stepX = 1 / scale;
  const stepY = 1 / scale;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const gx = c / stepX;
      const gy = r / stepY;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = smooth(gx - x0);
      const fy = smooth(gy - y0);
      const v00 = grads[y0 * gCols + x0] ?? 0;
      const v10 = grads[y0 * gCols + x0 + 1] ?? 0;
      const v01 = grads[(y0 + 1) * gCols + x0] ?? 0;
      const v11 = grads[(y0 + 1) * gCols + x0 + 1] ?? 0;
      const top = v00 + (v10 - v00) * fx;
      const bot = v01 + (v11 - v01) * fx;
      out[r * cols + c] = top + (bot - top) * fy;
    }
  }
  return out;
}

/** Terrain elevation in meters at a point, bilinear-interpolated from the grid. */
export function elevationAt(
  grid: number[],
  cols: number,
  rows: number,
  cellKm: number,
  xKm: number,
  yKm: number,
): number {
  const gx = Math.min(cols - 1.001, Math.max(0, xKm / cellKm));
  const gy = Math.min(rows - 1.001, Math.max(0, yKm / cellKm));
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const v00 = grid[y0 * cols + x0] ?? 0;
  const v10 = grid[y0 * cols + x0 + 1] ?? 0;
  const v01 = grid[(y0 + 1) * cols + x0] ?? 0;
  const v11 = grid[(y0 + 1) * cols + x0 + 1] ?? 0;
  const top = v00 + (v10 - v00) * fx;
  const bot = v01 + (v11 - v01) * fx;
  const raw = top + (bot - top) * fy;
  // Normalize to meters: [0..1] -> 120..720 m.
  return 120 + raw * 600;
}
