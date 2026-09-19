#!/usr/bin/env node
import { chromium } from "playwright";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = resolve(root, "docs/morphogen-guide.html");
const out = resolve(root, "docs/Morphogen-Instrument-Guide.pdf");
const publicDir = resolve(root, "public/guide");

const browser = await chromium.launch({ args: ["--disable-web-security"] });
const page = await browser.newPage();
await page.emulateMedia({ media: "print" });
await page.goto(pathToFileURL(html).href, { waitUntil: "networkidle", timeout: 60000 });
await page.evaluate(async () => {
  if (document.fonts?.ready) await document.fonts.ready;
});
await page.waitForTimeout(400);
await page.pdf({
  path: out,
  printBackground: true,
  preferCSSPageSize: true,
  margin: { top: "0", right: "0", bottom: "0", left: "0" },
});
await browser.close();

mkdirSync(publicDir, { recursive: true });
copyFileSync(out, resolve(publicDir, "Morphogen-Instrument-Guide.pdf"));
console.log(JSON.stringify({ ok: true, out, public: resolve(publicDir, "Morphogen-Instrument-Guide.pdf") }));
