import type { Pair } from "./draft";

/** Exact bounded packed layer; neither truncation nor unknown-to-feasible coercion. */
export function decodeArea(layer: { grid: { shape: Pair }; data: string }): Uint8Array {
  const [rows, cols] = layer.grid.shape;
  const size = rows * cols;
  if (![rows, cols].every((v) => Number.isInteger(v) && v > 0) || size > 2250000) throw new Error("Invalid area extent.");
  const bytes = Math.ceil(size / 2);
  if (layer.data.length !== 4 * Math.ceil(bytes / 3) || !/^[A-Za-z0-9+/]*={0,2}$/.test(layer.data)) throw new Error("Invalid packed area length.");
  const raw = atob(layer.data);
  if (raw.length !== bytes) throw new Error("Area byte count differs from its extent.");
  const result = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) {
    const value = raw.charCodeAt(i >> 1);
    result[i] = i % 2 ? value >> 4 : value & 15;
    if (result[i] > 6) throw new Error("Unknown area status code.");
  }
  if (size % 2 && raw.charCodeAt(bytes - 1) >> 4) throw new Error("Nonzero area padding.");
  return result;
}

/** Only homogeneous blocks are drawn, inset by a full analytical cell so texture
 * interpolation cannot expand green territory across a blocked/unknown boundary. */
export function conservativeBlocks(states: Uint8Array, shape: Pair, stride = 8) {
  const [rows, cols] = shape;
  const rectangles: { row: number; col: number; height: number; width: number; state: 4 | 5 }[] = [];
  for (let row = 0; row < rows; row += stride) for (let col = 0; col < cols; col += stride) {
    const height = Math.min(stride, rows - row), width = Math.min(stride, cols - col);
    const state = states[row * cols + col];
    if (state !== 4 && state !== 5 || height <= 2 || width <= 2) continue;
    let homogeneous = true;
    for (let r = row; r < row + height && homogeneous; r += 1) for (let c = col; c < col + width; c += 1) {
      if (states[r * cols + c] !== state) { homogeneous = false; break; }
    }
    if (homogeneous) rectangles.push({ row: row + 1, col: col + 1, height: height - 2, width: width - 2, state });
  }
  return rectangles;
}
