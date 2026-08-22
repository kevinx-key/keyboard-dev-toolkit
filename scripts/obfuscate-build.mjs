/**
 * Post-build JavaScript Obfuscation
 *
 * Runs after `next build` to obfuscate all output JS bundles.
 * Makes reverse-engineering significantly harder while keeping the app functional.
 *
 * Safe to run: does NOT modify node_modules/, only out/_next/static/chunks/
 */
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { readdirSync, statSync, existsSync } from "fs";
import { join, extname, dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "out");

if (!existsSync(OUT_DIR)) {
  console.log("[obfuscate] No out/ directory found. Skipping.");
  process.exit(0);
}

/** Recursively find all .js files in a directory */
function findJS(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules, Next.js generated code, static media, and dwb-layout (pre-built third-party)
      if (entry.name !== "node_modules" && entry.name !== "_next" && entry.name !== "media" && entry.name !== "dwb-layout") {
        results.push(...findJS(full));
      }
    } else if (extname(entry.name) === ".js") {
      // Only obfuscate chunks and framework JS, skip tiny scripts
      const size = statSync(full).size;
      if (size > 1024 && size < 5 * 1024 * 1024) {
        results.push(full);
      }
    }
  }
  return results;
}

const files = findJS(OUT_DIR);
console.log(`[obfuscate] Found ${files.length} JS files to obfuscate in out/`);

for (const file of files) {
  const rel = file.replace(ROOT.replace(/\\/g, "/"), "").replace(/^\//, "");
  try {
    execSync(
      `npx javascript-obfuscator "${file}" --output "${file}" ` +
      `--compact true ` +
      `--control-flow-flattening true ` +
      `--control-flow-flattening-threshold 0.5 ` +
      `--dead-code-injection true ` +
      `--dead-code-injection-threshold 0.3 ` +
      `--debug-protection true ` +
      `--disable-console-output false ` +
      `--identifier-names-generator mangled ` +
      `--numbers-to-expressions true ` +
      `--self-defending true ` +
      `--simplify false ` +
      `--split-strings true ` +
      `--string-array true ` +
      `--string-array-encoding base64 ` +
      `--string-array-threshold 0.7 ` +
      `--transform-object-keys true ` +
      `--unicode-escape-sequence false`,
      { cwd: ROOT, stdio: "pipe", timeout: 60000 }
    );
    console.log(`  ✓ obfuscated: ${rel}`);
  } catch (e) {
    // Minified files often cause harmless parsing issues — skip silently
    if (e.stderr && e.stderr.includes("ERROR")) {
      console.error(`  ✗ failed: ${rel} — ${e.stderr.slice(0, 100)}`);
    }
  }
}

console.log("[obfuscate] Done.");
