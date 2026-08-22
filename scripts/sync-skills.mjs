#!/usr/bin/env node

/**
 * Generates custom-key-pcb-tool command/skill files for all supported AI coding platforms.
 * Source of truth: .claude/skills/custom-key-pcb-tool/SKILL.md
 *
 * Usage: node scripts/sync-skills.mjs
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, '.claude', 'skills', 'custom-key-pcb-tool', 'SKILL.md');

// --- Parse source skill ---

let raw;
try {
  raw = readFileSync(SOURCE, 'utf8').replace(/\r\n/g, '\n');
} catch {
  console.error(`Error: Source skill not found at .claude/skills/custom-key-pcb-tool/SKILL.md`);
  process.exit(1);
}

const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
if (!match) {
  console.error('Error: Could not parse SKILL.md frontmatter');
  process.exit(1);
}

const body = match[2];
const shortDesc = 'Keyboard Dev Toolkit — 自定义键盘 PCB 设计工具 (Keyboard Dev Toolkit)';

// --- Helpers ---

function write(relPath, content) {
  const full = join(ROOT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content, 'utf8');
  console.log(`  \u2713 ${relPath}`);
}

const HEADER =
  '<!-- AUTO-GENERATED from .claude/skills/custom-key-pcb-tool/SKILL.md \u2014 do not edit directly.\n' +
  '     Run `node scripts/sync-skills.mjs` to regenerate. -->\n\n';

const noArgs = (text) => text;  // No argument substitution needed

// --- Generate ---

console.log('Syncing custom-key-pcb-tool skill to all platforms...');
console.log(`  Source: .claude/skills/custom-key-pcb-tool/SKILL.md\n`);

// 1. Codex CLI — same SKILL.md format, same $ARGUMENTS syntax
write('.codex/skills/custom-key-pcb-tool/SKILL.md', raw);

// 2. GitHub Copilot — same SKILL.md format
write('.github/skills/custom-key-pcb-tool/SKILL.md', raw);

// 3. Cursor — plain markdown, no argument substitution support
write('.cursor/commands/custom-key-pcb-tool.md', HEADER + noArgs(body));

// 4. Windsurf — markdown workflow
write('.windsurf/workflows/custom-key-pcb-tool.md', HEADER + noArgs(body));

// 5. Gemini CLI — TOML format, {{args}} for arguments
const geminiBody = body.replace(/\$ARGUMENTS/g, '{{args}}');
write(
  '.gemini/commands/custom-key-pcb-tool.toml',
  `# AUTO-GENERATED from .claude/skills/custom-key-pcb-tool/SKILL.md\n` +
    `# Run \`node scripts/sync-skills.mjs\` to regenerate.\n\n` +
    `description = "${shortDesc}"\n` +
    `name = "custom-key-pcb-tool"\n\n` +
    `prompt = '''\n${geminiBody}\n'''\n`
);

// 6. OpenCode — markdown + YAML frontmatter, $ARGUMENTS works natively
write(
  '.opencode/commands/custom-key-pcb-tool.md',
  `---\ndescription: "${shortDesc}"\n---\n${HEADER}${body}`
);

// 7. Augment Code — markdown + YAML frontmatter
write(
  '.augment/commands/custom-key-pcb-tool.md',
  `---\ndescription: "${shortDesc}"\nargument-hint: "<url>"\n---\n${HEADER}${body}`
);

// 8. Continue — prompt file with invokable: true
write(
  '.continue/commands/custom-key-pcb-tool.md',
  `---\nname: custom-key-pcb-tool\ndescription: "${shortDesc}"\ninvokable: true\n---\n${HEADER}${body}`
);

// 9. Amazon Q — JSON agent definition
write(
  '.amazonq/cli-agents/custom-key-pcb-tool.json',
  JSON.stringify(
    {
      name: 'custom-key-pcb-tool',
      description: shortDesc,
      prompt: noArgs(body),
      fileContext: ['智能体配置.md', 'docs/research/**'],
    },
    null,
    2
  ) + '\n'
);

console.log('\nDone! 9 platform command files generated from source skill.');
