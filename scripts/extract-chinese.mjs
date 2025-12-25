/**
 * 自动提取硬编码中文字符串
 * 使用: node scripts/extract-chinese.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { globSync } from 'glob';

// 匹配中文字符的正则
const CHINESE_REGEX = /[\u4e00-\u9fa5]/;

// 匹配 JSX 中的文本模式
const PATTERNS = [
  // JSX 文本内容: >中文文本<
  { regex: />([^<]*[\u4e00-\u9fa5][^<]*)</g, type: 'jsx' },
  // 字符串属性: "中文" 或 '中文'
  { regex: /['"]([^'"]*[\u4e00-\u9fa5][^'"]*)['"](?=\s*[,)\}>;\n])/g, type: 'string' },
  // 模板字符串: `包含${var}中文`
  { regex: /`([^`]*[\u4e00-\u9fa5][^`]*)`/g, type: 'template' },
];

// 扫描的文件类型
const files = globSync('src/**/*.{tsx,ts}', {
  ignore: ['**/node_modules/**', '**/*.d.ts'],
});

const results = {};
let totalCount = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const matches = new Set();

  // 移除注释内容，避免误匹配
  const contentWithoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, '') // 多行注释
    .replace(/\/\/.*$/gm, ''); // 单行注释

  for (const { regex } of PATTERNS) {
    let match;
    while ((match = regex.exec(contentWithoutComments)) !== null) {
      const text = match[1]?.trim();
      if (text && CHINESE_REGEX.test(text)) {
        // 排除纯空白或太短的内容
        if (text.length > 0) {
          matches.add(text);
        }
      }
    }
    regex.lastIndex = 0; // 重置正则
  }

  if (matches.size > 0) {
    results[file] = Array.from(matches);
    totalCount += matches.size;
  }
}

// 生成报告
const report = {
  generatedAt: new Date().toISOString(),
  totalFiles: Object.keys(results).length,
  totalStrings: totalCount,
  files: results,
};

writeFileSync(
  'scripts/chinese-strings-report.json',
  JSON.stringify(report, null, 2),
  'utf-8'
);

console.log(`\n📊 提取完成！`);
console.log(`   文件数: ${report.totalFiles}`);
console.log(`   字符串数: ${report.totalStrings}`);
console.log(`   报告已保存至: scripts/chinese-strings-report.json\n`);

// 打印按文件分组的概览
console.log('📁 文件概览 (按字符串数量排序):');
Object.entries(results)
  .sort((a, b) => b[1].length - a[1].length)
  .slice(0, 15)
  .forEach(([file, strings]) => {
    const shortPath = file.replace(/\\/g, '/').replace('src/', '');
    console.log(`   ${shortPath}: ${strings.length} 处`);
  });

if (Object.keys(results).length > 15) {
  console.log(`   ... 还有 ${Object.keys(results).length - 15} 个文件`);
}
