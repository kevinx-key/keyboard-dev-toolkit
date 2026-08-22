/**
 * 版本号同步脚本
 *
 * 每次构建前自动执行：
 * 1. package.json 的 version patch bump (+0.0.1)
 * 2. 同步到 src/lib/platform-bridge.ts (APP_VERSION)
 * 3. 同步到 src-tauri/tauri.conf.json (version)
 * 4. 同步到 src-tauri/Cargo.toml (version, Tauri 二进制实际版本号来源)
 *
 * 用法: node scripts/sync-version.mjs [--bump | --sync-only]
 *   --bump       先 bump patch 再同步（默认）
 *   --sync-only  只同步不 bump（用于构建后手动调版本时）
 */

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ─── Helpers ──────────────────────────────────────────────

function read(path) {
  return readFileSync(join(ROOT, path), "utf-8");
}

function write(path, content) {
  writeFileSync(join(ROOT, path), content, "utf-8");
  console.log(`  ✓ 已更新 ${path}`);
}

// ─── Main ─────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const doBump = !args.includes("--sync-only");

  // 1. Read package.json
  const pkg = JSON.parse(read("package.json"));
  let version = pkg.version;

  if (doBump) {
    // Bump patch: x.y.z → x.y.(z+1)
    const parts = version.split(".").map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      console.error(`错误: 无效版本号 "${version}"`);
      process.exit(1);
    }
    parts[2] += 1;
    version = parts.join(".");
    pkg.version = version;
    write("package.json", JSON.stringify(pkg, null, 2) + "\n");
    console.log(`  🔼 版本: ${version} (patch bump)`);
  } else {
    console.log(`  📌 版本: ${version} (仅同步)`);
  }

  // 2. Sync to platform-bridge.ts
  const bridgePath = "src/lib/platform-bridge.ts";
  let bridgeContent = read(bridgePath);
  bridgeContent = bridgeContent.replace(
    /export const APP_VERSION = "[^"]+";/,
    `export const APP_VERSION = "${version}";`,
  );
  write(bridgePath, bridgeContent);

  // 3. Sync to tauri.conf.json
  const tauriPath = "src-tauri/tauri.conf.json";
  let tauriContent = JSON.parse(read(tauriPath));
  if (tauriContent.version !== version) {
    tauriContent.version = version;
    write(tauriPath, JSON.stringify(tauriContent, null, 2) + "\n");
  } else {
    console.log(`  - tauri.conf.json 版本已一致，跳过`);
  }

  // 4. Sync to Cargo.toml (Tauri 二进制版本号来源)
  const cargoPath = "src-tauri/Cargo.toml";
  let cargoContent = read(cargoPath);
  const cargoVersionRegex = /^version = "(\d+\.\d+\.\d+)"/m;
  const cargoMatch = cargoContent.match(cargoVersionRegex);
  if (cargoMatch && cargoMatch[1] !== version) {
    cargoContent = cargoContent.replace(cargoVersionRegex, `version = "${version}"`);
    write(cargoPath, cargoContent);
  } else if (!cargoMatch) {
    console.error(`  ⚠️ 未找到 Cargo.toml 中的版本号字段`);
  } else {
    console.log(`  - Cargo.toml 版本已一致，跳过`);
  }

  // 4. Output version for shell piping
  console.log(`\nVERSION=${version}`);
}

main();
