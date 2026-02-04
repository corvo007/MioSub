/**
 * Test ELD behavior WITHOUT loading database
 *
 * Tests if eld fails gracefully when database is not loaded
 *
 * Run: node scripts/test-eld-no-load.mjs
 */

import eld from 'eld';

const testText = 'あのチビあっちからぶつかってきたのに すいません 大丈夫?';

console.log('=== ELD Test WITHOUT Database Load ===\n');
console.log('Testing eld.detect() behavior when database is NOT loaded\n');

console.log('1. Testing WITHOUT loading database first:');
try {
  const result = eld.detect(testText);
  console.log(`   Text: "${testText}"`);
  console.log(`   Result: ${JSON.stringify(result)}`);
  console.log(`   Detected language: ${result.language || 'null/undefined'}`);
} catch (e) {
  console.log(`   ERROR: ${e.message}`);
}

console.log('\n2. Now loading database and testing again:');
if (typeof eld.load === 'function') {
  await eld.load('medium');
  console.log('   Database loaded.');

  const result = eld.detect(testText);
  console.log(`   Result: ${JSON.stringify(result)}`);
  console.log(`   Detected language: ${result.language || 'null/undefined'}`);
} else {
  console.log('   eld.load is not a function - using static version');
}

console.log('\n3. Testing empty/whitespace text:');
const emptyTests = ['', '   ', '\n\t'];
for (const text of emptyTests) {
  try {
    const result = eld.detect(text);
    console.log(`   "${text.replace(/\n/g, '\\n').replace(/\t/g, '\\t')}" => ${JSON.stringify(result)}`);
  } catch (e) {
    console.log(`   "${text}" => ERROR: ${e.message}`);
  }
}

console.log('\n=== Conclusion ===');
console.log('If detection fails without database load, that could explain MIOSUB-V');
