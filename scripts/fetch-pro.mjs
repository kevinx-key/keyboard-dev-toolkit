#!/usr/bin/env node

/**
 * fetch-pro — Pro 私有源码同步脚本
 *
 * 三种模式:
 *   node scripts/fetch-pro.mjs            # 从私有仓拉取真实 Pro 源码，覆盖工作区
 *   node scripts/fetch-pro.mjs --stub     # 用 pro-stub/ 占位文件还原公开仓状态
 *   node scripts/fetch-pro.mjs --sync-stub # 把工作区的 types.ts 回写 pro-stub/（契约同步）
 *
 * 环境变量（拉取模式可选）:
 *   PRO_REPO_TOKEN  Gitee 私人令牌（read-only 即可）；缺省时使用本机 git 凭据管理器
 *   PRO_REPO_URL    默认 https://gitee.com/kevinxu93/keyboard-editor-pro.git
 *   PRO_REF         默认 master
 *
 * 设计要点:
 * - 公开仓 clone 后 postinstall 自动执行 --stub，零配置可构建
 * - --stub 只补缺不覆盖，不会破坏本地已注入的真实 Pro 源码（--force 强制覆盖）
 * - 所有 Pro 路径均在 .gitignore 中，杜绝真实源码误提交到公开仓
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, cpSync, rmSync, readdirSync, statSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(join(__dirname, '..'));

/** Pro 源清单：私有仓路径 → 主仓目标路径 */
const PRO_MAP = [
  { from: 'qmk-export', to: join(ROOT, 'src/plugins/qmk-export') },
  { from: 'kicad-export', to: join(ROOT, 'src/lib'), flatFiles: true },
  { from: 'lceda-export', to: join(ROOT, 'src/lib'), flatFiles: true },
  { from: 'keyboard-lceda-helper', to: join(ROOT, 'plugins/keyboard-lceda-helper') },
  { from: 'tests', to: join(ROOT, 'tests'), flatFiles: true },
];

function copyMissing(srcDir, destDir, { force = false, flatFiles = false } = {}) {
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    const src = join(srcDir, name);
    const dest = flatFiles ? join(destDir, name) : join(destDir, name);
    if (statSync(src).isDirectory()) {
      copyMissing(src, dest, { force });
    } else if (force || !existsSync(dest)) {
      cpSync(src, dest);
      console.log(`  + ${dest.replace(ROOT, '')}`);
    }
  }
}

function runStub({ force = false } = {}) {
  console.log(`\n[fetch-pro] 注入占位文件 (${force ? '强制覆盖' : '仅补缺'})...`);
  copyMissing(join(ROOT, 'pro-stub/src'), join(ROOT, 'src'), { force });
  console.log('[fetch-pro] stub 完成。公开仓状态就绪。\n');
}

function runSync() {
  const src = join(ROOT, 'src/plugins/qmk-export/types.ts');
  const dest = join(ROOT, 'pro-stub/src/plugins/qmk-export/types.ts');
  if (!existsSync(src)) {
    console.error('[fetch-pro] 找不到工作区 types.ts，请先 fetch 真实源码');
    process.exit(1);
  }
  cpSync(src, dest);
  console.log(`[fetch-pro] 契约已回写: ${dest.replace(ROOT, '')}\n`);
}

function runFetch() {
  const token = process.env.PRO_REPO_TOKEN;
  const repoUrl = process.env.PRO_REPO_URL || 'https://gitee.com/kevinxu93/keyboard-editor-pro.git';
  const ref = process.env.PRO_REF || 'master';

  // 有 token 走 oauth2 注入；无 token 则依赖本机 git 凭据管理器（已存储 Gitee 凭证时可用）
  const authedUrl = token
    ? repoUrl.replace('https://', `https://oauth2:${token}@`)
    : repoUrl;

  const tmp = join(tmpdir(), `kle-pro-${Date.now()}`);

  console.log(`\n[fetch-pro] 克隆私有仓 (${ref})${token ? '' : ' [使用本机 git 凭据]'}...`);
  try {
    execSync(`git clone --depth 1 --branch ${ref} ${authedUrl} "${tmp}"`, { stdio: 'pipe' });

    console.log('[fetch-pro] 注入 Pro 源码...');
    for (const m of PRO_MAP) {
      const src = join(tmp, m.from);
      if (!existsSync(src)) {
        console.warn(`  ! 私有仓缺少 ${m.from}，跳过`);
        continue;
      }
      if (m.flatFiles) {
        copyMissing(src, m.to, { force: true, flatFiles: true });
      } else {
        rmSync(m.to, { recursive: true, force: true });
        copyMissing(src, m.to, { force: true });
      }
    }
    console.log('[fetch-pro] Pro 源码注入完成。Pro 构建就绪。\n');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/* ============ 主入口 ============ */

const args = process.argv.slice(2);
if (args.includes('--stub')) {
  runStub({ force: args.includes('--force') });
} else if (args.includes('--sync-stub')) {
  runSync();
} else {
  runFetch();
}
