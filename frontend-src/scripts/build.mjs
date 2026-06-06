import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFlag = process.argv.indexOf("--out");
const outDir = resolve(root, outFlag >= 0 ? process.argv[outFlag + 1] : "../frontend/dist");

await rm(outDir, { recursive: true, force: true });
await mkdir(resolve(outDir, "assets"), { recursive: true });

await copyFile(resolve(root, "src/main.js"), resolve(outDir, "assets/main.js"));
await copyFile(resolve(root, "src/styles.css"), resolve(outDir, "assets/styles.css"));
await copyFile(resolve(root, "../assets/logo.svg"), resolve(outDir, "assets/logo.svg"));
await copyFile(resolve(root, "index.html"), resolve(outDir, "index.html"));

const routes = [
  "404.html",
  "tageditor.html",
  "tagger.html",
  "task.html",
  "tensorboard.html",
  "dreambooth/index.html",
  "lora/index.html",
  "lora/basic.html",
  "lora/master.html",
  "lora/flux.html",
  "lora/anima.html",
  "lora/sd3.html",
  "lora/tools.html",
  "lora/params.html",
  "other/about.html",
  "other/settings.html",
];

const html = await BunCompatRead(resolve(root, "index.html"));
for (const route of routes) {
  const target = resolve(outDir, route);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html, "utf8");
}

console.log(`Built frontend to ${outDir}`);

async function BunCompatRead(path) {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}
