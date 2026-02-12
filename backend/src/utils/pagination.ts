/**
 * Safely parse a query-string value into a positive integer.
 * Returns `undefined` when the input is absent, empty, or not a valid integer.
 */
export function parsePageInt(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 1) return undefined;
  return num;
}
