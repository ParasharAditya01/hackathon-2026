import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const baseURL = "http://127.0.0.1:4179";
const viewports = [
  { width: 280, height: 800 },
  { width: 320, height: 800 },
  { width: 360, height: 800 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1280, height: 900 },
  { width: 1440, height: 1000 },
];
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

const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4179", "--strictPort"], {
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
  throw new Error("Vite server did not become ready.");
}

async function inspectViewport(page, width, height, viewName) {
  const result = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const rootWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const offenders = [...document.querySelectorAll("body *")].flatMap((element) => {
      if (!element.getClientRects().length) return [];
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") return [];
      if (rect.width === 0 && rect.height === 0) return [];
      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        return [{
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          text: (element.innerText || element.getAttribute("aria-label") || "").trim().slice(0, 70),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        }];
      }
      return [];
    });
    const clipped = [...document.querySelectorAll("body *")].flatMap((element) => {
      if (!element.getClientRects().length) return [];
      const style = getComputedStyle(element);
      if (!["hidden", "clip"].includes(style.overflowX)) return [];
      if (element.scrollWidth <= element.clientWidth + 2) return [];
      return [{
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        text: (element.innerText || "").trim().slice(0, 70),
      }];
    });
    const containerOverflow = [...document.querySelectorAll(
      ".surface, .metric-card, .batch-card, .rider-card, .site-card, .reservation-card, .scenario-card, .assignment-card, .form-card, .primary-nav, .landing-nav, .landing-footer, .route-illustration, .metrics-grid, .form-grid, .scenario-grid"
    )].flatMap((element) => {
      if (!element.getClientRects().length) return [];
      if (getComputedStyle(element).display === "none") return [];
      if (element.scrollWidth <= element.clientWidth + 3) return [];
      return [{
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        text: (element.innerText || "").trim().slice(0, 70),
      }];
    });
    const controlOverflow = [...document.querySelectorAll("button, input, select, textarea, img, video, canvas, iframe")].flatMap((element) => {
      if (!element.getClientRects().length) return [];
      const rect = element.getBoundingClientRect();
      const parent = element.parentElement;
      const parentRect = parent?.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return [];
      if (parent && ["auto", "scroll"].includes(getComputedStyle(parent).overflowX)) return [];
      if (parentRect && (rect.left < parentRect.left - 2 || rect.right > parentRect.right + 2)) {
        return [{
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          parentClass: typeof parent.className === "string" ? parent.className : "",
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          parentLeft: Math.round(parentRect.left),
          parentRight: Math.round(parentRect.right),
        }];
      }
      return [];
    });
    return { viewportWidth, rootWidth, bodyWidth, offenders, clipped, containerOverflow, controlOverflow };
  });

  const failures = [];
  if (result.rootWidth > result.viewportWidth + 1) {
    failures.push(`document scroll width ${result.rootWidth}px exceeds ${result.viewportWidth}px`);
  }
  if (result.bodyWidth > result.viewportWidth + 1) {
    failures.push(`body scroll width ${result.bodyWidth}px exceeds ${result.viewportWidth}px`);
  }
  if (result.offenders.length) {
    failures.push(`${result.offenders.length} visible element(s) extend beyond the viewport: ${JSON.stringify(result.offenders.slice(0, 6))}`);
  }
  if (result.clipped.length) {
    failures.push(`${result.clipped.length} element(s) clip horizontally overflowing content: ${JSON.stringify(result.clipped.slice(0, 6))}`);
  }

  if (result.containerOverflow.length) {
    failures.push(`${result.containerOverflow.length} card/grid/navigation container(s) have internal horizontal overflow: ${JSON.stringify(result.containerOverflow.slice(0, 6))}`);
  }
  if (result.controlOverflow.length) {
    failures.push(`${result.controlOverflow.length} controls/media element(s) exceed their immediate parent: ${JSON.stringify(result.controlOverflow.slice(0, 6))}`);
  }
  if (failures.length) {
    throw new Error(`[${width}x${height}] ${viewName}: ${failures.join("; ")}`);
  }
  console.log(`PASS ${width}x${height} · ${viewName}`);
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  for (const viewport of viewports) {
    // A fresh page gets isolated sessionStorage so every viewport starts on the landing screen.
    const page = await browser.newPage({ viewport });
    page.on("pageerror", (error) => {
      console.error("Browser page error:", error.message);
    });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await inspectViewport(page, viewport.width, viewport.height, "Landing page");

    await page.getByRole("button", { name: /Open operations workspace/i }).click();
    await page.locator(".page-content").waitFor();
    await inspectViewport(page, viewport.width, viewport.height, "Overview");

    for (const section of sections.slice(1)) {
      await page.locator(".nav-item").filter({ hasText: section }).click();
      await page.locator(".page-content").waitFor();
      await inspectViewport(page, viewport.width, viewport.height, section);
    }
    await page.close();
  }

  console.log(`Responsive overflow check passed for ${viewports.length} viewport sizes and all 9 views.`);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
