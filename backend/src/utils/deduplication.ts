import { createHash } from 'crypto';

/**
 * Generates a deterministic deduplication key for a signal event.
 *
 * Format: "<sourceType>:<actorId>:<signalType>:<metadataHash>"
 * The metadata hash is the first 8 characters of the SHA-256 digest of the
 * JSON-serialised metadata object (keys sorted for stability).
 *
 * When actorId is absent the literal "anonymous" is used so keys remain
 * comparable across anonymous events with the same fingerprint in metadata.
 */
export function generateDeduplicationKey(
  sourceType: string,
  actorId: string | null | undefined,
  signalType: string,
  metadata: Record<string, unknown>,
): string {
  const metadataHash = hashMetadata(metadata);
  const actor = actorId || 'anonymous';
  return `${sourceType}:${actor}:${signalType}:${metadataHash}`;
}

/**
 * Produces the first 8 hex characters of the SHA-256 hash of a
 * deterministically serialised metadata object.
 */
function hashMetadata(metadata: Record<string, unknown>): string {
  const sorted = stableStringify(metadata);
  return createHash('sha256').update(sorted).digest('hex').slice(0, 8);
}

/**
 * JSON.stringify with sorted keys so that object property order
 * does not affect the hash.
 */
function stableStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  return (
    '{' +
    keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify((obj as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}
