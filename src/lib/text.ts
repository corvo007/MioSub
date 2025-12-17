/**
 * Count Chinese/CJK characters in a string
 * Covers CJK Unified Ideographs and Extension A/B/C/D/E/F blocks
 */
export const countCJKCharacters = (text: string): number => {
  if (!text) return 0;
  const cjkRegex =
    /[\u4e00-\u9fff\u3400-\u4dbf\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}]/gu;
  const matches = text.match(cjkRegex);
  return matches ? matches.length : 0;
};
