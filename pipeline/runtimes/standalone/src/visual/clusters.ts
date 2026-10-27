/**
 * Largest 4-connected component of changed pixels in an RGBA diff buffer
 * (pixelmatch `diffMask` output: alpha 255 marks a counted difference, alpha 0
 * marks an unchanged/excluded pixel).
 *
 * A global pixel ratio hides small but structural changes such as a removed
 * 1px button border; the largest connected cluster surfaces them even when the
 * total diff stays under the global threshold.
 */
export function maxDiffCluster(diff: Buffer, width: number, height: number): number {
  const pixels = width * height;
  if (width <= 0 || height <= 0) return 0;

  const changed = new Uint8Array(pixels);
  for (let index = 0; index < pixels; index += 1) {
    changed[index] = (diff[index * 4 + 3] ?? 0) > 0 ? 1 : 0;
  }

  const visited = new Uint8Array(pixels);
  const stack = new Int32Array(pixels);
  let best = 0;

  for (let start = 0; start < pixels; start += 1) {
    if (changed[start] === 0 || visited[start] === 1) continue;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    while (top > 0) {
      const index = stack[--top]!;
      size += 1;
      const x = index % width;
      const y = (index - x) / width;
      if (x > 0 && changed[index - 1] === 1 && visited[index - 1] === 0) {
        visited[index - 1] = 1;
        stack[top++] = index - 1;
      }
      if (x + 1 < width && changed[index + 1] === 1 && visited[index + 1] === 0) {
        visited[index + 1] = 1;
        stack[top++] = index + 1;
      }
      if (y > 0 && changed[index - width] === 1 && visited[index - width] === 0) {
        visited[index - width] = 1;
        stack[top++] = index - width;
      }
      if (y + 1 < height && changed[index + width] === 1 && visited[index + width] === 0) {
        visited[index + width] = 1;
        stack[top++] = index + width;
      }
    }
    if (size > best) best = size;
  }
  return best;
}
