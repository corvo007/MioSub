/* eslint-disable no-undef */
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
  { regex: />([^<\r\n]*[\u4e00-\u9fa5][^<\r\n]*)</g, type: 'jsx' },
  // 字符串属性: "中文" 或 '中文'
  { regex: /['"]([^'"\r\n]*[\u4e00-\u9fa5][^'"\r\n]*)['"]/g, type: 'string' },
  // 模板字符串: `包含${var}中文`
  { regex: /`([^`\r\n]*[\u4e00-\u9fa5][^`\r\n]*)`/g, type: 'template' },
];

// 扫描的文件类型
const files = globSync(['src/**/*.{tsx,ts}', 'electron/**/*.{ts,tsx}'], {
  ignore: [
    '**/node_modules/**',
    '**/*.d.ts',
    'src/services/api/gemini/core/prompts.ts',
  ],
});

const results = {};
let totalCount = 0;

for (const file of files) {
  const content = readFileSync(file, 'utf-8');
  const fileResults = [];

  // 移除注释内容但保留占位，以保持行号一致
  const contentWithoutComments = content
    .replace(/\/\*[\s\S]*?\*\//g, (match) => {
      // 将块注释内容替换为等长空格/换行，保持行号
      return match.replace(/[^\n]/g, ' ');
    })
    .replace(/\/\/.*$/gm, (match) => {
      // 将单行注释内容替换为等长空格
      return match.replace(/./g, ' ');
    });

  for (const { regex } of PATTERNS) {
    let match;
    while ((match = regex.exec(contentWithoutComments)) !== null) {
      const text = match[1]?.trim();
      if (text && CHINESE_REGEX.test(text)) {
        // 排除纯空白或太短的内容
        if (text.length > 0) {
          // 计算行号 (1-based)
          const lineNumber = content.slice(0, match.index).split(/\r\n|\r|\n/).length;

          fileResults.push({
            line: lineNumber,
            text: text,
          });
        }
      }
    }
    regex.lastIndex = 0; // 重置正则
  }

  if (fileResults.length > 0) {
    // 按行号排序
    fileResults.sort((a, b) => a.line - b.line);
    results[file] = fileResults;
    totalCount += fileResults.length;
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
