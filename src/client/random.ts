// Uniform integer in [0, n) from the browser's crypto source.
export function randomInt(n: number): number {
  const [value = 0] = crypto.getRandomValues(new Uint32Array(1));
  return value % n;
}
