// Generate Tauri updater manifest (latest.json) from installer artifacts
// Used by .github/workflows/release.yml after collecting installers/*.sig
import fs from "fs";
import path from "path";

const dir = "installers";
const repo = process.env.GITHUB_REPOSITORY || "";
const tag = process.env.GITHUB_REF_NAME || "";
const version = tag.replace(/^v/, "");
const base = `https://github.com/${repo}/releases/download/${tag}`;

const files = fs.readdirSync(dir);

// 平台匹配规则（exe 优先于 msi，后出现的同名平台会被跳过）
// macOS 自动更新用 .app.tar.gz（dmg 不可被 updater 应用），由 release.yml 重命名带上架构
const rules = [
  { key: "windows-x86_64", re: /_x64-setup\.exe$/ },
  { key: "windows-x86_64", re: /\.msi$/ },
  { key: "darwin-x86_64", re: /_x64\.app\.tar\.gz$/ },
  { key: "darwin-aarch64", re: /_aarch64\.app\.tar\.gz$/ },
  { key: "linux-x86_64", re: /\.AppImage$/ },
];

const platforms = {};
for (const f of files) {
  const rule = rules.find((r) => r.re.test(f));
  if (!rule) continue;
  if (platforms[rule.key]) continue; // 已有更高优先级的包
  const sigPath = path.join(dir, f + ".sig");
  if (!fs.existsSync(sigPath)) {
    console.error(`Missing signature for ${f}, skipping`);
    continue;
  }
  platforms[rule.key] = {
    signature: fs.readFileSync(sigPath, "utf8").trim(),
    url: `${base}/${encodeURIComponent(f)}`,
  };
}

const keys = Object.keys(platforms);
if (keys.length === 0) {
  console.error("No signed platforms found");
  process.exit(1);
}

const manifest = {
  version,
  notes: `Keyboard Dev Toolkit ${version}`,
  pub_date: new Date().toISOString(),
  platforms,
};

fs.writeFileSync("latest.json", JSON.stringify(manifest, null, 2));
console.log(`latest.json generated for ${version}: ${keys.join(", ")}`);

// ── 绿色版（portable）自更新清单 ─────────────────────────────────────────────
// Windows 绿色版点「检查更新」时，App 用这个清单（Rust 侧自定义 endpoint）下载
// *-portable.exe 并原地替换；安装版仍走上面的 latest.json（NSIS 安装流程）。
const portable = files.find((f) => /_x64-portable\.exe$/.test(f));
if (portable) {
  const sigPath = path.join(dir, portable + ".sig");
  if (fs.existsSync(sigPath)) {
    const portableManifest = {
      version,
      notes: `Keyboard Dev Toolkit ${version} (portable)`,
      pub_date: new Date().toISOString(),
      platforms: {
        "windows-x86_64": {
          signature: fs.readFileSync(sigPath, "utf8").trim(),
          url: `${base}/${encodeURIComponent(portable)}`,
        },
      },
    };
    fs.writeFileSync(path.join(dir, "latest-portable.json"), JSON.stringify(portableManifest, null, 2));
    console.log(`latest-portable.json generated for ${version}`);
  } else {
    console.error(`Missing signature for ${portable}, skipping portable manifest`);
  }
} else {
  console.log("No portable exe found, skipping portable manifest");
}
