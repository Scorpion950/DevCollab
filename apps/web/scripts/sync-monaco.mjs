import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const rootDir = path.resolve(import.meta.dirname, "..");
const srcVs = path.join(rootDir, "node_modules", "monaco-editor", "min", "vs");
const destVs = path.join(rootDir, "public", "monaco", "vs");

if (existsSync(srcVs)) {
  mkdirSync(path.dirname(destVs), { recursive: true });
  cpSync(srcVs, destVs, { recursive: true, force: true });
  process.stdout.write("Synced Monaco assets to public/monaco/vs\n");
} else {
  process.stderr.write(`Monaco editor assets not found at ${srcVs}\n`);
}
