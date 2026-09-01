import { chromium } from "@playwright/test";
const routes = process.argv.slice(2);
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message.slice(0, 200)));
for (const r of routes) {
  const name = r.replace(/[^a-z0-9]/gi, "_") || "home";
  await p.goto("http://localhost:3001" + r, { waitUntil: "networkidle", timeout: 90000 });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: `shot_${name}.png`, fullPage: true });
  console.log("shot_" + name + ".png");
}
console.log("pageerrors:", errs.length ? errs.join(" | ") : "none");
await b.close();
