/**
 * Test ELD (Efficient Language Detector) with Japanese text
 *
 * Reproduces MIOSUB-V issue: eld misidentifies Japanese as English
 *
 * Run: node scripts/test-eld-detection.mjs
 */

import eld from 'eld';

// Sample text from Sentry event MIOSUB-V
const testCases = [
  // From actual error
  'あのチビあっちからぶつかってきたのに',
  'すいません',
  '大丈夫?',
  // Combined (as in AlignmentStep - first 5 segments joined)
  'あのチビあっちからぶつかってきたのに すいません 大丈夫?',
  // More Japanese samples
  'こんにちは世界',
  'ありがとうございます',
  // Mixed content
  'Hello あのチビ world',
  // Pure hiragana
  'あいうえお',
  // Pure katakana
  'アイウエオ',
  // Kanji only
  '日本語',
  // Short text (edge case)
  'あ',
  // Empty/whitespace
  '',
  '   ',
];

async function main() {
  console.log('=== ELD Language Detection Test ===\n');
  console.log('Testing if eld library correctly detects Japanese text\n');

  // Check if eld needs initialization
  if (typeof eld.load === 'function') {
    console.log('Loading ELD database (medium)...');
    await eld.load('medium');
    console.log('ELD database loaded\n');
  }

  console.log('Results:\n');
  console.log('| Text (first 40 chars) | Detected | Expected | Match |');
  console.log('|----------------------|----------|----------|-------|');

  for (const text of testCases) {
    const displayText = text.substring(0, 40).padEnd(40);

    if (!text.trim()) {
      console.log(`| "${displayText}" | (empty) | - | - |`);
      continue;
    }

    try {
      const result = eld.detect(text);
      const detected = result.language || 'null';
      const expected = 'ja';
      const match = detected === expected ? '✅' : '❌';

      console.log(`| ${displayText} | ${detected.padEnd(8)} | ${expected.padEnd(8)} | ${match} |`);

      // Print full result for debugging
      if (detected !== expected) {
        console.log(`  └─ Full result: ${JSON.stringify(result)}`);
      }
    } catch (e) {
      console.log(`| ${displayText} | ERROR | ja | ❌ |`);
      console.log(`  └─ Error: ${e.message}`);
    }
  }

  console.log('\n=== Analysis ===\n');

  // Test the exact failing case
  const failingText = 'あのチビあっちからぶつかってきたのに すいません 大丈夫?';
  const result = eld.detect(failingText);

  console.log('Exact failing case from MIOSUB-V:');
  console.log(`  Text: "${failingText}"`);
  console.log(`  Result: ${JSON.stringify(result, null, 2)}`);

  if (result.language !== 'ja') {
    console.log('\n❌ REPRODUCED: eld incorrectly detected Japanese as:', result.language || 'null');
    console.log('   This confirms the root cause of MIOSUB-V');
  } else {
    console.log('\n✅ eld correctly detected Japanese');
    console.log('   The issue may be environment-specific or related to eld version/database');
  }
}

main().catch(console.error);
