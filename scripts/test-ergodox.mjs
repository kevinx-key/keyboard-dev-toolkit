// Test ErgoDox parsing with the rewritten coordinate system
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const presetsCode = fs.readFileSync(path.join(root, "src/data/presets.ts"), "utf8");
const nameIdx = presetsCode.indexOf('name: "ErgoDox"');
const dataIdx = presetsCode.indexOf("data: [", nameIdx);
const dataStart = presetsCode.indexOf("[", dataIdx + 6);
let depth = 0, end = dataStart;
for (let i = dataStart; i < presetsCode.length; i++) {
  if (presetsCode[i] === "[") depth++;
  else if (presetsCode[i] === "]") { depth--; if (depth === 0) { end = i + 1; break; } }
}
const rawDataStr = presetsCode.substring(dataStart, end);
const ergoData = new Function(`return (${rawDataStr})`)();
console.log("Rows:", ergoData.length);

// Inline parser using same coordinate tracking as the new parseLayoutJSON
const DEF = { x: 0, y: 0, w: 1, h: 1, x2: 0, y2: 0, w2: 0, h2: 0, r: 0, rx: 0, ry: 0, c: "#ccc", t: "#000", d: false, g: false, l: false, n: false, sm: "", sb: "", st: "", p: "", labelSize: 3, f2: 0, fa: [], align: 4 };
const keys = [];
const current = { ...DEF };
const cluster = { rx: 0, ry: 0 };

for (const row of ergoData) {
  if (!Array.isArray(row)) continue;
  for (const item of row) {
    if (typeof item === "string") {
      const key = { ...DEF,
        x: Math.round(current.x * 100) / 100,
        y: Math.round(current.y * 100) / 100,
        w: current.w || 1, h: current.h || 1,
        x2: current.x2 || 0, y2: current.y2 || 0,
        w2: current.w2 || 0, h2: current.h2 || 0,
        r: current.r || 0, rx: current.rx || 0, ry: current.ry || 0,
      };
      keys.push(key);
      current.x = Math.round((current.x + key.w) * 100) / 100;
      current.w = 1; current.h = 1; current.x2 = 0; current.y2 = 0; current.w2 = 0; current.h2 = 0;
      current.n = false; current.l = false; current.d = false; current.g = false;
    } else if (typeof item === "object" && item) {
      const p = item;
      if (p.r !== undefined) current.r = p.r;
      if (p.rx !== undefined) { cluster.rx = p.rx; current.rx = cluster.rx; current.x = cluster.rx; current.y = cluster.ry; }
      if (p.ry !== undefined) { cluster.ry = p.ry; current.ry = cluster.ry; current.x = cluster.rx; current.y = cluster.ry; }
      if (p.x !== undefined) current.x += p.x;
      if (p.y !== undefined) current.y += p.y;
      if (p.w !== undefined) { current.w = p.w; }
      if (p.h !== undefined) { current.h = p.h; }
      if (p.w2 !== undefined) current.w2 = p.w2;
      if (p.h2 !== undefined) current.h2 = p.h2;
      if (p.x2 !== undefined) current.x2 = p.x2;
      if (p.y2 !== undefined) current.y2 = p.y2;
    }
  }
  current.y += 1;
  current.x = current.rx || 0;
}

console.log("Keys:", keys.length);

// Show ALL keys
console.log("\n--- ALL keys ---");
keys.forEach((k, i) => {
  console.log(`Key ${i}: x=${k.x.toFixed(2)}, y=${k.y.toFixed(2)}, w=${k.w}, h=${k.h}, r=${k.r}`);
});

// Check specific key the user asked about
const h2keys = keys.filter(k => k.h === 2);
console.log("\n--- Keys with h=2 ---");
h2keys.forEach(k => console.log(`Key ${keys.indexOf(k)}: x=${k.x.toFixed(2)}, y=${k.y.toFixed(2)}, w=${k.w}, h=${k.h}, r=${k.r}, rx=${k.rx}, ry=${k.ry}`));
