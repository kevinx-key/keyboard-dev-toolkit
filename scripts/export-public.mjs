#!/usr/bin/env node

/**
 * export-public — 生成公开仓快照（GitHub 主干用）
 *
 * 用法:
 *   node scripts/export-public.mjs                 # 导出到 ../keyboard-editor-public
 *   node scripts/export-public.mjs --out <dir>     # 指定输出目录
 *
 * 安全设计（双重防线）:
 * 1. 白名单复制 —— 只拷贝明确列出的目录/文件，内部文档、AI 配置、工作产物天然排除
 * 2. 强制 stub 覆盖 —— 无论工作区当前是真实 Pro 源码还是占位文件，
 *    导出后一律用 pro-stub/ 覆盖 Pro 路径，专有代码零泄露
 *
 * 导出产物可直接作为孤儿分支内容推送到公开仓。
 */

import { existsSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(join(__dirname, '..'));

const outArgIdx = process.argv.indexOf('--out');
const OUT =
  outArgIdx > -1 && process.argv[outArgIdx + 1]
    ? resolve(process.argv[outArgIdx + 1])
    : resolve(ROOT, '../keyboard-editor-public');

/** 白名单：目录（整体复制，除 exclude 内子项） */
const DIRS = ['src', 'tests', 'e2e', 'scripts', 'public', 'pro-stub'];
/** 白名单：目录（带排除项） */
const DIRS_WITH_EXCLUDE = [
  { path: 'src-tauri', exclude: ['target', 'gen'] },
  {
    path: '.github',
    exclude: ['skills', 'copilot-instructions.md', 'copilot-setup-steps.yml'],
  },
];
/** 白名单：根文件 */
const FILES = [
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'next.config.ts',
  'eslint.config.mjs',
  'vitest.config.ts',
  'postcss.config.mjs',
  'components.json',
  '.nvmrc',
  '.gitignore',
  'README.md',
  'LICENSE',
];

/** 防线一：即使走白名单也绝不复制的路径（相对 ROOT） */
const NEVER = [
  'src/plugins/qmk-export',
  'src/lib/kicad-export.ts',
  'src/lib/kicad-types.ts',
  'src/lib/lceda-export.ts',
  'tests/qmk-export.test.ts',
  'tests/kicad-export.test.ts',
];

function isNever(relPath) {
  const p = relPath.replaceAll('\\', '/');
  return NEVER.some((n) => p === n || p.startsWith(n + '/'));
}

function copyDir(src, dest, relBase = '', applyNever = true) {
  if (!existsSync(dest)) mkdirSync(dest, { recursive: true });
  for (const name of readdirSync(src)) {
    const s = join(src, name);
    const d = join(dest, name);
    const rel = join(relBase, name);
    if (applyNever && isNever(rel)) continue;
    if (statSync(s).isDirectory()) {
      copyDir(s, d, rel, applyNever);
    } else {
      cpSync(s, d);
    }
  }
}

/* ============ 主流程 ============ */

console.log(`[export-public] 输出目录: ${OUT}`);
if (existsSync(OUT)) {
  // 保留 .git（快照目录可反复 commit/push），只清空工作内容
  for (const entry of readdirSync(OUT)) {
    if (entry === '.git') continue;
    rmSync(join(OUT, entry), { recursive: true, force: true });
  }
  console.log('[export-public] 已清空旧快照（保留 .git）');
}
mkdirSync(OUT, { recursive: true });

for (const dir of DIRS) {
  const from = join(ROOT, dir);
  if (!existsSync(from)) continue;
  copyDir(from, join(OUT, dir), dir);
  console.log(`  + ${dir}/`);
}

for (const { path, exclude } of DIRS_WITH_EXCLUDE) {
  const from = join(ROOT, path);
  if (!existsSync(from)) continue;
  mkdirSync(join(OUT, path), { recursive: true });
  for (const name of readdirSync(from)) {
    if (exclude.includes(name)) continue;
    cpSync(join(from, name), join(OUT, path, name), { recursive: true });
  }
  console.log(`  + ${path}/ (-${exclude.length} 项)`);
}

for (const file of FILES) {
  const from = join(ROOT, file);
  if (!existsSync(from)) {
    console.warn(`  ! 缺少 ${file}，跳过`);
    continue;
  }
  cpSync(from, join(OUT, file));
  console.log(`  + ${file}`);
}

/* 防线二：强制以 pro-stub 覆盖 Pro 路径（overlay 不受 NEVER 过滤） */
console.log('[export-public] 强制注入社区版占位...');
copyDir(join(ROOT, 'pro-stub/src'), join(OUT, 'src'), 'src', false);

/* 终检：确认导出树中不存在任何真实 Pro 实现特征 */
const leakProbe = [
  join(OUT, 'src/plugins/qmk-export/matrix-generator.ts'),
  join(OUT, 'src/lib/kicad-types.ts'),
  join(OUT, 'tests/qmk-export.test.ts'),
];
for (const f of leakProbe) {
  if (existsSync(f)) {
    console.error(`[export-public] ❌ 泄露风险！检测到不应存在的文件: ${f}`);
    process.exit(1);
  }
}
const stubProbe = join(OUT, 'src/lib/kicad-export.ts');
if (!existsSync(stubProbe)) {
  console.error('[export-public] ❌ stub 未就位，导出不完整');
  process.exit(1);
}

console.log(`[export-public] ✅ 完成。共检查泄露探针 ${leakProbe.length + 1} 项，全部通过。`);
console.log('[export-public] 下一步: 在导出目录 git init → 孤儿分支推送 GitHub');
