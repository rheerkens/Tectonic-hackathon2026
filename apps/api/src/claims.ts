import type { ExtractedClaim } from '@tectonic/shared';

/** Free text to `{topic, country, claim}[]`: one claim per sentence, no topic or country. */
export async function extractClaims(text: string): Promise<ExtractedClaim[]> {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 3)
    .map((claim) => ({ topic: null, country: null, claim }));
}
