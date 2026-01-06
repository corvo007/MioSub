#!/usr/bin/env node
/**
 * Skill Activation Prompt Hook for Windows
 * Suggests relevant skills based on user prompt keywords
 */

const fs = require('fs');
const path = require('path');

// Get project directory
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Read input from stdin
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('readable', () => {
  let chunk;
  while ((chunk = process.stdin.read()) !== null) {
    input += chunk;
  }
});

process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input);
    const prompt = (data.prompt || '').toLowerCase();

    // Load skill rules
    const rulesPath = path.join(projectDir, '.claude', 'skills', 'skill-rules.json');

    if (!fs.existsSync(rulesPath)) {
      process.exit(0);
    }

    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
    const matchedSkills = [];

    // Check each skill for matches
    for (const [skillName, config] of Object.entries(rules.skills)) {
      const triggers = config.promptTriggers;
      if (!triggers) continue;

      // Keyword matching
      if (triggers.keywords) {
        const keywordMatch = triggers.keywords.some(kw =>
          prompt.includes(kw.toLowerCase())
        );
        if (keywordMatch) {
          matchedSkills.push({ name: skillName, matchType: 'keyword', config });
          continue;
        }
      }

      // Intent pattern matching
      if (triggers.intentPatterns) {
        const intentMatch = triggers.intentPatterns.some(pattern => {
          try {
            const regex = new RegExp(pattern, 'i');
            return regex.test(prompt);
          } catch {
            return false;
          }
        });
        if (intentMatch) {
          matchedSkills.push({ name: skillName, matchType: 'intent', config });
        }
      }
    }

    // Generate output if matches found
    if (matchedSkills.length > 0) {
      let output = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
      output += '🎯 SKILL ACTIVATION CHECK\n';
      output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

      const critical = matchedSkills.filter(s => s.config.priority === 'critical');
      const high = matchedSkills.filter(s => s.config.priority === 'high');
      const medium = matchedSkills.filter(s => s.config.priority === 'medium');
      const low = matchedSkills.filter(s => s.config.priority === 'low');

      if (critical.length > 0) {
        output += '⚠️ CRITICAL SKILLS (REQUIRED):\n';
        critical.forEach(s => output += `  → ${s.name}\n`);
        output += '\n';
      }

      if (high.length > 0) {
        output += '📚 RECOMMENDED SKILLS:\n';
        high.forEach(s => output += `  → ${s.name}\n`);
        output += '\n';
      }

      if (medium.length > 0) {
        output += '💡 SUGGESTED SKILLS:\n';
        medium.forEach(s => output += `  → ${s.name}\n`);
        output += '\n';
      }

      if (low.length > 0) {
        output += '📌 OPTIONAL SKILLS:\n';
        low.forEach(s => output += `  → ${s.name}\n`);
        output += '\n';
      }

      output += 'ACTION: Use Skill tool BEFORE responding\n';
      output += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

      console.log(output);
    }

    process.exit(0);
  } catch (err) {
    // Silent exit on errors
    process.exit(0);
  }
});
