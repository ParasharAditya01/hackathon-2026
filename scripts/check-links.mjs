import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const baseURL = "http://127.0.0.1:4180";
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
      if (!exists) failures.push(contextName + ": dead anchor " + url.hash + " (" + anchor.text + ")");
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
  let page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: "networkidle" });

  let externalAnchors = await auditAnchors(page, "landing page");
  const landingLinks = await page.locator("a[href]").evaluateAll((anchors) =>
    anchors.map((anchor) => ({ href: anchor.getAttribute("href"), text: (anchor.innerText || anchor.getAttribute("aria-label") || "").trim() })),
  );
  for (const link of landingLinks.filter((item) => item.href === "#top")) {
    await page.locator('a[href="#top"]').nth(landingLinks.filter((item) => item.href === "#top").findIndex((item) => item.text === link.text)).click();
    if (new URL(page.url()).hash !== "#top") throw new Error('Landing link "' + link.text + '" did not navigate to #top.');
    await page.evaluate(() => { history.replaceState(null, "", location.pathname + location.search); });
  }
  console.log("PASS landing page links · brand and footer return to #top");

  await page.close();
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.locator(".landing-nav-cta").click();
  await page.locator(".page-content").waitFor();
  externalAnchors = externalAnchors.concat(await auditAnchors(page, "workspace"));
  const brand = page.locator(".sidebar .brand");
  const overviewTarget = await page.evaluate(() => Boolean(document.getElementById("overview")));
  if (!overviewTarget) throw new Error('Workspace brand points to "#overview", but no element has id="overview".');
  await brand.click();
  if ((await page.locator(".breadcrumb strong").innerText()).trim() !== "Overview") {
    throw new Error("Workspace brand did not return to the Overview page.");
  }
  console.log("PASS workspace brand · #overview target exists and click returns to Overview");

  for (const section of sections) {
    await page.locator(".nav-item").filter({ hasText: section }).click();
    const current = (await page.locator(".breadcrumb strong").innerText()).trim();
    if (current !== section) throw new Error('Navigation item "' + section + '" opened "' + current + '" instead.');
    await page.locator(".page-content").waitFor();
    console.log("PASS workspace navigation · " + section);
  }

  await verifyExternalDestinations(externalAnchors);
  if (pageErrors.length) throw new Error("Browser errors during link audit: " + pageErrors.join("; "));
  console.log("Link audit passed: internal anchors, brand links, and all workspace navigation destinations are valid.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
