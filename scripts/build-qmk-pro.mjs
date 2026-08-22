#!/usr/bin/env node

/**
 * QMK Pro 构建脚本 — 生成带 QMK 导出模块的专业版安装包
 *
 * 用法:
 *   node scripts/build-qmk-pro.mjs          # 构建专业版
 *   node scripts/build-qmk-pro.mjs --free   # 构建免费版（不含 QMK）
 *
 * 环境变量:
 *   QMK_PLUGIN_ENABLED=true/false   (由本脚本自动设置)
 *
 * 输出:
 *   标准版: KeyboardEditor-v<version>-setup.exe
 *   专业版: KeyboardEditor-v<version>-pro-setup.exe
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TAURI_DIR = join(ROOT, 'src-tauri');

function readPackageJson() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));
  return pkg.version;
}

function readTauriConf() {
  const conf = JSON.parse(readFileSync(join(TAURI_DIR, 'tauri.conf.json'), 'utf-8'));
  return conf.version;
}

function build(isPro) {
  const variant = isPro ? 'pro' : 'free';
  const version = readPackageJson();
  const tauriVersion = readTauriConf();

  console.log(`\n========================================`);
  console.log(`  构建 ${variant.toUpperCase()} 版`);
  console.log(`  版本: v${version}`);
  console.log(`  Tauri: v${tauriVersion}`);
  console.log(`========================================\n`);

  // 设置环境变量
  process.env.QMK_PLUGIN_ENABLED = isPro ? 'true' : 'false';
  process.env.APP_VARIANT = variant;

  // 同步版本号
  execSync('node scripts/sync-version.mjs', { cwd: ROOT, stdio: 'inherit' });

  // 专业版：先拉取私有仓 Pro 源码
  if (isPro) {
    console.log('\n[0/3] 拉取 Pro 私有源码...');
    execSync('node scripts/fetch-pro.mjs', { cwd: ROOT, stdio: 'inherit' });
  }

  // 构建 Next.js 前端
  console.log('\n[1/3] 构建前端...');
  execSync('next build', { cwd: ROOT, stdio: 'inherit', env: { ...process.env } });

  // 混淆构建产物
  console.log('\n[2/3] 混淆...');
  execSync('node scripts/obfuscate-build.mjs', { cwd: ROOT, stdio: 'inherit' });

  // Tauri 构建
  console.log('\n[3/3] Tauri 打包...');
  try {
    execSync('npx tauri build', {
      cwd: ROOT,
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (e) {
    console.error('Tauri 构建失败:', e.message);
    process.exit(1);
  }

  // 重命名输出文件
  const msiDir = join(TAURI_DIR, 'target', 'release', 'bundle', 'msi');
  const outputName = `KeyboardEditor-v${version}`;
  const sourceName = 'Keyboard Dev Toolkit';

  // 查找生成的 MSI
  if (existsSync(join(msiDir, `${sourceName}_${version}_x64_zh-CN.msi`))) {
    const source = join(msiDir, `${sourceName}_${version}_x64_zh-CN.msi`);
    const target = join(msiDir, `${outputName}${isPro ? '-pro' : ''}-setup.exe`);
    copyFileSync(source, target);
    console.log(`\n✅ 输出: ${target}`);
  } else if (existsSync(join(msiDir, `${sourceName}.msi`))) {
    const source = join(msiDir, `${sourceName}.msi`);
    const target = join(msiDir, `${outputName}${isPro ? '-pro' : ''}-setup.exe`);
    copyFileSync(source, target);
    console.log(`\n✅ 输出: ${target}`);
  } else {
    console.log('\n⚠ MSI 文件路径与预期不同，请检查输出目录:');
    console.log(`  ${msiDir}`);
  }
}

/* ============ 主入口 ============ */

const isPro = !process.argv.includes('--free');

// 如果指定了 --both，同时构建两个版本
if (process.argv.includes('--both')) {
  console.log('\n🏗 构建双版本...\n');
  // 先构建专业版
  process.env.QMK_PLUGIN_ENABLED = 'true';
  build(true);
  // 清理缓存后构建免费版
  console.log('\n—— 转为标准版构建 ——\n');
  execSync('npx next clean', { cwd: ROOT, stdio: 'inherit' });
  process.env.QMK_PLUGIN_ENABLED = 'false';
  build(false);
  console.log('\n✅ 双版本构建完成');
} else {
  build(isPro);
}
