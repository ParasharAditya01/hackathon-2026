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
  if ((await page.title()) !== "AidFlow | Time-Critical Surplus & Civic Aid") throw new Error("Incorrect landing-page title: " + await page.title());
  console.log("PASS document title · landing page");

  const imageAccessibility = await page.evaluate(() => {
    const failures = [];
    const images = [...document.querySelectorAll("img")].map((image) => ({
      src: image.currentSrc || image.getAttribute("src") || "",
      hasAlt: image.hasAttribute("alt"),
      alt: image.getAttribute("alt"),
    }));
    for (const image of images) {
      if (!image.hasAlt) {
        failures.push("Image is missing an alt attribute: " + image.src);
        continue;
      }
      const element = [...document.querySelectorAll("img")].find((candidate) => (candidate.currentSrc || candidate.getAttribute("src") || "") === image.src);
      const decorative = element?.getAttribute("aria-hidden") === "true" ||
        ["presentation", "none"].includes(element?.getAttribute("role"));
      if (decorative && image.alt !== "") failures.push("Decorative image must use empty alt text: " + image.src);
      if (!decorative && !image.alt.trim()) failures.push("Informative image needs concise alternative text: " + image.src);
    }
    const graphics = [...document.querySelectorAll("svg")].map((svg) => ({
      className: typeof svg.className === "object" ? svg.className.baseVal : svg.className,
      hidden: svg.getAttribute("aria-hidden") === "true",
      role: svg.getAttribute("role"),
      label: svg.getAttribute("aria-label") || svg.querySelector("title")?.textContent?.trim() || "",
    }));
    for (const graphic of graphics) {
      // Lucide icons are decorative when used beside visible text or inside a named control.
      // Do not require every small UI icon to expose a duplicate announcement to screen readers.
      const element = [...document.querySelectorAll("svg")].find(candidate =>
        (typeof candidate.className === "object" ? candidate.className.baseVal : candidate.className) === graphic.className
      );
      const parentControl = element?.closest("button, a, [role='button'], [role='link']");
      const controlName = parentControl && (
        parentControl.getAttribute("aria-label") ||
        parentControl.getAttribute("aria-labelledby") ||
        parentControl.innerText ||
        ""
      ).trim();
      const decorativeLucide = /(^|\s)lucide(?:\s|$)/.test(graphic.className) && (parentControl ? Boolean(controlName) : true);
      if (!graphic.hidden && !(graphic.role === "img" && graphic.label) && !decorativeLucide) {
        failures.push("SVG is neither hidden as decorative nor given an accessible image role and name: " + graphic.className);
      }
    }
    const routeIllustration = document.querySelector(".route-map-svg");
    if (!routeIllustration || routeIllustration.getAttribute("role") !== "img" ||
        routeIllustration.getAttribute("aria-label") !== "A connected route links a donor parcel, rider handover, and shelter destination") {
      failures.push("The informative route illustration is missing its concise accessible description.");
    }
    const brandMarks = [...document.querySelectorAll(".aidflow-mark")];
    if (!brandMarks.length || brandMarks.some((mark) => mark.getAttribute("aria-hidden") !== "true")) {
      failures.push("AidFlow brand marks should be hidden from assistive technology because adjacent brand text names the link.");
    }
    return { images, graphics, failures };
  });
  if (imageAccessibility.failures.length) throw new Error("Image accessibility audit failed: " + imageAccessibility.failures.join("; "));
  console.log("PASS image accessibility · " + imageAccessibility.images.length + " HTML images have alt attributes; " +
    imageAccessibility.graphics.length + " SVG graphics are either decorative or have accessible names; informative route illustration is labelled.");
 
  const faviconLinks = await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"]').evaluateAll((links) =>
    links.map((link) => ({ rel: link.rel, type: link.type, sizes: link.sizes, href: link.getAttribute("href") })),
  );
  const expectedFavicons = [
    ["/favicon.svg", "image/svg+xml"],
    ["/favicon-32x32.png", "image/png"],
    ["/favicon-16x16.png", "image/png"],
    ["/favicon.ico", ""],
    ["/apple-touch-icon.png", "image/png"],
  ];
  for (const [path, type] of expectedFavicons) {
    const link = faviconLinks.find((item) => item.href === path);
    if (!link) throw new Error("Missing favicon HTML reference: " + path);
    if (type && link.type !== type) throw new Error("Incorrect favicon MIME type for " + path + ": " + link.type);
    const response = await context.request.get(baseURL + path);
    if (!response.ok()) throw new Error("Favicon asset failed to load: " + path + " · HTTP " + response.status());
    const body = await response.body();
    if (!body.length) throw new Error("Favicon asset is empty: " + path);
    if (path.endsWith(".png")) {
      const dimensions = await page.evaluate(async (url) => {
        const response = await fetch(url);
        const bitmap = await createImageBitmap(await response.blob());
        const result = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return result;
      }, path);
      const expectedSize = path.includes("16x16") ? 16 : path.includes("32x32") ? 32 : 180;
      if (dimensions.width !== expectedSize || dimensions.height !== expectedSize) {
        throw new Error("Incorrect favicon dimensions for " + path + ": " + JSON.stringify(dimensions));
      }
    }
    if (path.endsWith(".svg") && !body.toString("utf8").includes("<svg")) throw new Error("SVG favicon is not valid SVG markup.");
    console.log("PASS favicon asset · " + path + " · HTTP " + response.status() + (path.endsWith(".png") ? " · " + (path.includes("16x16") ? "16x16" : path.includes("32x32") ? "32x32" : "180x180") : ""));
  }

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
  await page.waitForFunction(() => document.title === "AidFlow | Civic Aid Operations");
  console.log("PASS document title · Overview");
  externalAnchors = externalAnchors.concat(await auditAnchors(page, "workspace"));
  const brand = page.getByRole("link", { name: "AidFlow home — Overview" });
  const brandGeometry = await brand.evaluate(element => { const rect = element.getBoundingClientRect(); const mark = element.querySelector(".brand-mark"); const markRect = mark.getBoundingClientRect(); return { width: rect.width, height: rect.height, markWidth: markRect.width, markHeight: markRect.height, color: getComputedStyle(element.querySelector(".brand-copy strong")).color, background: getComputedStyle(element.closest(".sidebar")).backgroundColor }; });
  if (brandGeometry.width <= 0 || brandGeometry.height <= 0 || Math.abs(brandGeometry.markWidth - brandGeometry.markHeight) > 0.5) throw new Error("Workspace logo dimensions or aspect ratio are invalid: " + JSON.stringify(brandGeometry));
  await brand.click();
  if ((await page.locator(".breadcrumb strong").innerText()).trim() !== "Overview") throw new Error("Workspace logo link did not navigate to Overview.");
  if (await brand.getAttribute("href") !== "#overview") throw new Error("Workspace logo link does not point to the Overview home target.");
  console.log("PASS workspace logo link · accessible name, Overview destination, square mark, fixed layout dimensions");

  const expectedTitles = {
  "Overview": "AidFlow | Civic Aid Operations",
  "Aid batches": "Aid Batches & Surplus Inventory | AidFlow",
  "Dispatch board": "Dispatch Planning & Deliveries | AidFlow",
  "Riders": "Rider Fleet & Capacity | AidFlow",
  "Receiving sites": "Receiving Sites & Aid Demand | AidFlow",
  "Reservations": "Aid Reservations & Claim Queue | AidFlow",
  "Alerts & audit": "Operational Alerts & Audit Trail | AidFlow",
  "Resilience lab": "Resilience Lab & Failure Simulations | AidFlow"
};
  for (const section of sections) {
    await page.locator(".nav-item").filter({ hasText: section }).click();
    const current = (await page.locator(".breadcrumb strong").innerText()).trim();
    if (current !== section) throw new Error('Navigation item "' + section + '" opened "' + current + '" instead.');
    await page.locator(".page-content").waitFor();
    const expectedTitle = expectedTitles[section];
    await page.waitForFunction((title) => document.title === title, expectedTitle);
    if ((await page.title()) !== expectedTitle) throw new Error("Incorrect document title for " + section + ": " + await page.title());
    console.log("PASS workspace navigation and title · " + section + " · " + expectedTitle);
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

  await page.goto(baseURL + "/this-route-should-not-exist", { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: /This route has gone missing/i }).waitFor();
  if (!(await page.getByText(/couldn’t find the page you’re looking for/i).count())) throw new Error("Unknown URL did not explain that the page could not be found.");
  for (const name of ["Return to homepage", "Open operations", "Aid batches", "Dispatch board", "Resilience lab"]) {
    if (!(await page.getByRole("link", { name: new RegExp(name, "i") }).count())) throw new Error("404 recovery destination is missing: " + name);
  }
  await page.getByRole("link", { name: /Return to homepage/i }).click();
  await page.locator(".landing-page").waitFor();
  console.log("PASS custom 404 · unknown URL, explanatory copy, homepage and relevant-section recovery links");

  await verifyExternalDestinations(externalAnchors);
  if (pageErrors.length || consoleErrors.length) throw new Error("Browser errors during link audit: " + [...pageErrors, ...consoleErrors].join("; "));
  console.log("Link audit passed: internal anchors, brand links, and all workspace navigation destinations are valid.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
