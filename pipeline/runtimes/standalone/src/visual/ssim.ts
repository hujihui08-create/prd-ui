const C1 = (0.01 * 255) ** 2;
const C2 = (0.03 * 255) ** 2;
const WINDOW = 8;

function grayAt(buffer: Buffer, width: number, x: number, y: number): number {
  const index = (y * width + x) * 4;
  const r = buffer[index] ?? 0;
  const g = buffer[index + 1] ?? 0;
  const b = buffer[index + 2] ?? 0;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Mean SSIM over non-overlapping 8x8 luminance windows. Pure and dependency
 * free so parity stays reproducible; returns 1 when the image is smaller than
 * one window (no comparable signal).
 */
export function computeSsim(a: Buffer, b: Buffer, width: number, height: number): number {
  let total = 0;
  let windows = 0;
  for (let y = 0; y + WINDOW <= height; y += WINDOW) {
    for (let x = 0; x + WINDOW <= width; x += WINDOW) {
      let sumA = 0;
      let sumB = 0;
      let sumAA = 0;
      let sumBB = 0;
      let sumAB = 0;
      const count = WINDOW * WINDOW;
      for (let dy = 0; dy < WINDOW; dy += 1) {
        for (let dx = 0; dx < WINDOW; dx += 1) {
          const va = grayAt(a, width, x + dx, y + dy);
          const vb = grayAt(b, width, x + dx, y + dy);
          sumA += va;
          sumB += vb;
          sumAA += va * va;
          sumBB += vb * vb;
          sumAB += va * vb;
        }
      }
      const meanA = sumA / count;
      const meanB = sumB / count;
      const varA = sumAA / count - meanA * meanA;
      const varB = sumBB / count - meanB * meanB;
      const cov = sumAB / count - meanA * meanB;
      const numerator = (2 * meanA * meanB + C1) * (2 * cov + C2);
      const denominator = (meanA * meanA + meanB * meanB + C1) * (varA + varB + C2);
      total += denominator === 0 ? 1 : numerator / denominator;
      windows += 1;
    }
  }
  return windows === 0 ? 1 : total / windows;
}
