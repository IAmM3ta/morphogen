import { chromium } from "playwright";
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await browser.newContext();
await ctx.addInitScript(() => localStorage.clear());
const page = await ctx.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://127.0.0.1:8080/", { waitUntil: "commit", timeout: 10000 });
await page.waitForTimeout(2000);
const info = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")].map(b => ({ text: b.textContent.trim(), disabled: b.disabled }));
  document.querySelectorAll("button").forEach(b => { if (/enter/i.test(b.textContent)) b.click(); });
  return btns;
});
await page.waitForTimeout(1500);
const idle = await page.evaluate(() => window.__morphogen?.());
await page.screenshot({ path: "/workspace/screenshots/coral-open.png" });
const box = await page.locator("canvas").first().boundingBox();
await page.evaluate(({ x, y, w, h }) => {
  const el = document.querySelector("canvas");
  const fire = (type, id, cx, cy) =>
    el.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, composed: true, pointerId: id, pointerType: "touch",
      clientX: cx, clientY: cy, pressure: 0.6, width: 28, height: 28, isPrimary: id === 21,
    }));
  fire("pointerdown", 21, x + 80, y + 260);
  fire("pointerdown", 22, x + w - 80, y + h - 220);
}, { x: box.x, y: box.y, w: box.width, h: box.height });
await page.waitForTimeout(400);
const held = await page.evaluate(() => window.__morphogen?.());
console.log(JSON.stringify({ info, idle, held: held && { voices: held.voices, fingers: held.fingers, brushes: held.brushes, preset: held.preset } }, null, 2));
await browser.close();
