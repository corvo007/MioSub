/**
 * Test the CJK fallback detection logic
 *
 * Run: node scripts/test-cjk-fallback.mjs
 */

// Simulate the fallback function from language.ts
function detectLanguageFallback(text) {
  // Japanese: has hiragana or katakana
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return 'ja';
  }

  // Korean: has hangul
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(text)) {
    return 'ko';
  }

  // Chinese: has CJK ideographs (but no kana, already checked above)
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return 'zh';
  }

  // Default to English
  return 'en';
}

const testCases = [
  // Japanese (hiragana)
  { text: 'あのチビあっちからぶつかってきたのに', expected: 'ja', desc: 'Japanese hiragana' },
  { text: 'すいません', expected: 'ja', desc: 'Japanese hiragana' },
  { text: 'あいうえお', expected: 'ja', desc: 'Pure hiragana' },

  // Japanese (katakana)
  { text: 'アイウエオ', expected: 'ja', desc: 'Pure katakana' },
  { text: 'コンピューター', expected: 'ja', desc: 'Katakana word' },

  // Japanese (mixed with kanji)
  { text: '日本語を勉強しています', expected: 'ja', desc: 'Japanese with kanji and hiragana' },
  { text: '大丈夫?', expected: 'ja', desc: 'Kanji with punctuation (has no kana - should be zh)' },

  // Korean
  { text: '안녕하세요', expected: 'ko', desc: 'Korean hangul' },
  { text: '감사합니다', expected: 'ko', desc: 'Korean hangul' },
  { text: '한국어', expected: 'ko', desc: 'Korean word' },

  // Chinese (no kana)
  { text: '你好世界', expected: 'zh', desc: 'Chinese characters' },
  { text: '中文测试', expected: 'zh', desc: 'Chinese characters' },
  { text: '简体中文', expected: 'zh', desc: 'Simplified Chinese' },

  // English
  { text: 'Hello world', expected: 'en', desc: 'English' },
  { text: 'This is a test', expected: 'en', desc: 'English sentence' },

  // Mixed
  { text: 'Hello あいうえお world', expected: 'ja', desc: 'Mixed English/Japanese' },
  { text: '한국 Korea', expected: 'ko', desc: 'Mixed Korean/English' },

  // Edge cases
  { text: '', expected: 'en', desc: 'Empty string' },
  { text: '123456', expected: 'en', desc: 'Numbers only' },
  { text: '!@#$%', expected: 'en', desc: 'Symbols only' },
];

console.log('=== CJK Fallback Detection Test ===\n');
console.log('| Text (30 chars) | Expected | Detected | Match | Description |');
console.log('|-----------------|----------|----------|-------|-------------|');

let passed = 0;
let failed = 0;

for (const { text, expected, desc } of testCases) {
  const detected = detectLanguageFallback(text);
  const match = detected === expected ? '✅' : '❌';
  const displayText = text.substring(0, 30).padEnd(30);

  console.log(`| ${displayText} | ${expected.padEnd(8)} | ${detected.padEnd(8)} | ${match} | ${desc} |`);

  if (detected === expected) {
    passed++;
  } else {
    failed++;
  }
}

console.log('\n=== Summary ===');
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

if (failed > 0) {
  console.log('\n⚠️  Some tests failed. Review the fallback logic.');
  process.exit(1);
} else {
  console.log('\n✅ All tests passed!');
}
