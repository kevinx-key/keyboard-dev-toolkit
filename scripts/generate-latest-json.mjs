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
const rules = [
  { key: "windows-x86_64", re: /_x64-setup\.exe$/ },
  { key: "windows-x86_64", re: /\.msi$/ },
  { key: "darwin-x86_64", re: /_x64\.dmg$/ },
  { key: "darwin-aarch64", re: /_aarch64\.dmg$/ },
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
    url: `${base}/${f}`,
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
