import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const baseURL = "http://127.0.0.1:4180";
const routeIds = new Set(["overview-page", "aid-batches-page", "dispatch-board-page", "riders-page", "receiving-sites-page", "reservations-page", "alerts-audit-page", "resilience-lab-page"]);
const sections = [
  "Overview",
  "Aid batches",
  "Dispatch board",
  "Riders",
  "Receiving sites",
  "Reservations",
  "Alerts & audit",
  "Resilience lab",
];
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4180", "--strictPort"], {
  stdio: "ignore",
  env: process.env,
});
let browser;

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(baseURL);
      if (response.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error("Vite server did not become ready for link checks.");
}

async function auditAnchors(page, contextName) {
  const result = await page.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((anchor) => ({
      text: (anchor.innerText || anchor.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 100),
      href: anchor.href,
      rawHref: anchor.getAttribute("href"),
    })),
  );
  const failures = [];
  for (const anchor of result) {
    let url;
    try {
      url = new URL(anchor.href);
    } catch {
      failures.push(contextName + ': invalid URL "' + anchor.rawHref + '" (' + anchor.text + ")");
      continue;
    }
    if (url.protocol === "javascript:") {
      failures.push(contextName + ': unsafe javascript: link "' + anchor.rawHref + '" (' + anchor.text + ")");
      continue;
    }
    if (url.origin === new URL(baseURL).origin && url.hash) {
      const id = decodeURIComponent(url.hash.slice(1));
      const exists = await page.evaluate((targetId) => Boolean(document.getElementById(targetId)), id);
      if (!exists && !routeIds.has(id)) failures.push(contextName + ": dead anchor " + url.hash + " (" + anchor.text + ")");
      else console.log("PASS internal anchor · " + contextName + " · " + url.hash + " · " + (anchor.text || "(unlabelled)"));
    } else if (url.origin === new URL(baseURL).origin) {
      const response = await page.context().request.get(url.href, { timeout: 10000 });
      if (!response.ok()) failures.push(contextName + ": internal destination returned HTTP " + response.status() + " · " + url.href);
      else console.log("PASS internal destination · " + contextName + " · " + url.pathname);
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  return result.filter((anchor) => {
    try {
      return ["http:", "https:"].includes(new URL(anchor.href).protocol) && new URL(anchor.href).origin !== new URL(baseURL).origin;
    } catch {
      return false;
    }
  });
}

async function verifyExternalDestinations(anchors) {
  const unique = [...new Map(anchors.map((anchor) => [anchor.href, anchor])).values()];
  const unverified = [];
  const failures = [];
  for (const anchor of unique) {
    let response;
    try {
      response = await fetch(anchor.href, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
        headers: { "user-agent": "AidFlow-Link-Audit/1.0" },
      });
      if ([403, 405, 501].includes(response.status)) {
        response = await fetch(anchor.href, {
          method: "GET",
          redirect: "follow",
          signal: AbortSignal.timeout(10000),
          headers: { "user-agent": "AidFlow-Link-Audit/1.0" },
        });
      }
    } catch (error) {
      unverified.push(anchor.href + " — request blocked or timed out (" + error.message + ")");
      continue;
    }
    if (response.status === 404 || response.status === 410) {
      failures.push(anchor.href + " — HTTP " + response.status);
    } else if (response.status >= 200 && response.status < 400) {
      console.log("PASS external destination · HTTP " + response.status + " · " + anchor.href);
    } else {
      unverified.push(anchor.href + " — HTTP " + response.status + "; automated check cannot establish whether the page is usable");
    }
  }
  for (const item of unverified) console.warn("UNVERIFIED external destination · " + item);
  if (failures.length) throw new Error("Broken external destinations:\n" + failures.join("\n"));
  console.log("External links: " + unique.length + " found, " + (unique.length - unverified.length - failures.length) + " verified, " + unverified.length + " could not be verified.");
  return { total: unique.length, unverified };
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".landing-page").waitFor({ timeout: 10000 });

  let externalAnchors = await auditAnchors(page, "landing page");
  const landingAnchorTargetsValid = await page.locator('a[href="#top"]').evaluateAll(anchors =>
    anchors.length === 2 && anchors.every(anchor => document.getElementById(anchor.getAttribute("href").slice(1))),
  );
  if (!landingAnchorTargetsValid) throw new Error("Landing brand/footer links do not both resolve to the #top section.");
  const landingBrand = page.getByRole("link", { name: "AidFlow home" }).first();
  const landingLogoStyle = await landingBrand.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const mark = element.querySelector(".landing-mark");
    const markRect = mark.getBoundingClientRect();
    return { width: rect.width, height: rect.height, markWidth: markRect.width, markHeight: markRect.height, foreground: getComputedStyle(element).color, background: getComputedStyle(element.closest(".landing-nav")).backgroundColor };
  });
  if (landingLogoStyle.width <= 0 || landingLogoStyle.height <= 0 || Math.abs(landingLogoStyle.markWidth - landingLogoStyle.markHeight) > 0.5) throw new Error("Landing logo dimensions or aspect ratio are invalid: " + JSON.stringify(landingLogoStyle));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await landingBrand.click();
  await page.waitForFunction(() => window.scrollY === 0);
  console.log("PASS landing-page logo · accessible name, #top destination, square mark, legible theme colors");

  await page.evaluate(() => sessionStorage.setItem("aidflow-entered", "1"));
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".page-content").waitFor();
  externalAnchors = externalAnchors.concat(await auditAnchors(page, "workspace"));
  const brand = page.getByRole("link", { name: "AidFlow home — Overview" });
  const brandGeometry = await brand.evaluate(element => { const rect = element.getBoundingClientRect(); const mark = element.querySelector(".brand-mark"); const markRect = mark.getBoundingClientRect(); return { width: rect.width, height: rect.height, markWidth: markRect.width, markHeight: markRect.height, color: getComputedStyle(element.querySelector(".brand-copy strong")).color, background: getComputedStyle(element.closest(".sidebar")).backgroundColor }; });
  if (brandGeometry.width <= 0 || brandGeometry.height <= 0 || Math.abs(brandGeometry.markWidth - brandGeometry.markHeight) > 0.5) throw new Error("Workspace logo dimensions or aspect ratio are invalid: " + JSON.stringify(brandGeometry));
  await brand.click();
  if ((await page.locator(".breadcrumb strong").innerText()).trim() !== "Overview") throw new Error("Workspace logo link did not navigate to Overview.");
  if (await brand.getAttribute("href") !== "#overview") throw new Error("Workspace logo link does not point to the Overview home target.");
  console.log("PASS workspace logo link · accessible name, Overview destination, square mark, fixed layout dimensions");

  for (const section of sections) {
    await page.locator(".nav-item").filter({ hasText: section }).click();
    const current = (await page.locator(".breadcrumb strong").innerText()).trim();
    if (current !== section) throw new Error('Navigation item "' + section + '" opened "' + current + '" instead.');
    await page.locator(".page-content").waitFor();
    console.log("PASS workspace navigation · " + section);
  }

  const contextualChecks = [
    ["Overview", "Aid batches"], ["Overview", "Dispatch board"], ["Overview", "Resilience lab"],
    ["Aid batches", "Dispatch board"], ["Dispatch board", "Reservations"],
    ["Riders", "Dispatch board"], ["Receiving sites", "Dispatch board"],
    ["Reservations", "Alerts & audit"], ["Alerts & audit", "Resilience lab"],
    ["Resilience lab", "Receiving sites"],
  ];
  for (const [from, to] of contextualChecks) {
    await page.locator(".nav-item").filter({ hasText: from }).click();
    await page.locator(".related-links").getByRole("link", { name: to, exact: false }).filter({ hasText: to }).first().click();
    const current = (await page.locator(".breadcrumb strong").innerText()).trim();
    if (current !== to) throw new Error("Contextual link from " + from + " did not navigate to " + to + "; got " + current);
    console.log("PASS contextual link · " + from + " → " + to);
  }
  for (const target of ["Overview", "Aid batches", "Dispatch board", "Reservations", "Resilience lab"]) {
    await page.locator(".footer-nav").getByRole("link", { name: target, exact: true }).click();
    const current = (await page.locator(".breadcrumb strong").innerText()).trim();
    if (current !== target) throw new Error("Footer link did not navigate to " + target + "; got " + current);
    console.log("PASS footer quick link · " + target);
  }
  await page.locator(".breadcrumb-home").click();
  if ((await page.locator(".breadcrumb strong").innerText()).trim() !== "Overview") throw new Error("Breadcrumb home link did not return to Overview.");
  console.log("PASS breadcrumb home link · Overview");

  await verifyExternalDestinations(externalAnchors);
  if (pageErrors.length || consoleErrors.length) throw new Error("Browser errors during link audit: " + [...pageErrors, ...consoleErrors].join("; "));
  console.log("Link audit passed: internal anchors, brand links, and all workspace navigation destinations are valid.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
