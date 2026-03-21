/**
 * Extract localized changelog content from a GitHub release body
 * that uses `<!-- changelog:{language} -->` markers.
 *
 * Fallback chain: requested language → en-US → full body (for pre-marker releases).
 */
export function extractChangelog(body: string, language: string): string {
  if (!body) return '';

  const markerRegex = /<!--\s*changelog:([\w-]+)\s*-->/g;
  const markers: { lang: string; markerStart: number; contentStart: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(body)) !== null) {
    markers.push({
      lang: match[1],
      markerStart: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  // No markers found — pre-marker release, return full body
  if (markers.length === 0) return body.trim();

  const extractSection = (lang: string): string | null => {
    const idx = markers.findIndex((m) => m.lang === lang);
    if (idx === -1) return null;
    const start = markers[idx].contentStart;
    const end = idx + 1 < markers.length ? markers[idx + 1].markerStart : body.length;
    return body.slice(start, end).trim();
  };

  // Fallback chain: requested → en-US → first available section → full body
  return (
    extractSection(language) ||
    extractSection('en-US') ||
    (markers.length > 0 ? extractSection(markers[0].lang) : null) ||
    body.trim()
  );
}
