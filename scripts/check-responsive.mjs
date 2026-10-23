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

async function navigateToSection(page, section, mobile) {
  if (mobile) {
    await page.getByRole("button", { name: "Open navigation menu" }).click();
    await page.locator(".sidebar.is-mobile-open").waitFor();
  }
  await page.locator(".nav-item").filter({ hasText: section }).click();
  await page.locator(".page-content").waitFor();
  if (mobile) {
    await page.getByRole("button", { name: "Open navigation menu" }).waitFor();
    const expanded = await page.getByRole("button", { name: "Open navigation menu" }).getAttribute("aria-expanded");
    if (expanded !== "false") throw new Error("Mobile navigation did not close after selecting " + section);
    const current = await page.locator(".breadcrumb strong").innerText();
    if (current.trim() !== section) throw new Error("Mobile navigation selected " + current + " instead of " + section);
  }
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
    const pageErrors = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
      console.error("Browser page error:", error.message);
    });
    await page.goto(baseURL, { waitUntil: "networkidle" });
    await inspectViewport(page, viewport.width, viewport.height, "Landing page");

    await page.getByRole("button", { name: /Open operations workspace/i }).click();
    await page.locator(".page-content").waitFor();
    await inspectViewport(page, viewport.width, viewport.height, "Overview");

    const mobile = viewport.width <= 760;
    if (mobile) {
      const menuButton = page.locator(".mobile-menu-toggle");
      await menuButton.click();
      await page.locator(".sidebar.is-mobile-open").waitFor();
      if (await menuButton.getAttribute("aria-expanded") !== "true") throw new Error("Mobile menu button did not expose expanded state");
      if (!(await page.locator(".sidebar .nav-item").first().evaluate(element => element === document.activeElement))) throw new Error("Opening the mobile menu did not move focus to navigation");
      await page.keyboard.press("Tab");
      if (!(await page.locator(".sidebar .nav-item").nth(1).evaluate(element => element === document.activeElement))) throw new Error("Tab did not move focus through mobile navigation");
      await page.keyboard.press("Shift+Tab");
      if (!(await page.locator(".sidebar .nav-item").first().evaluate(element => element === document.activeElement))) throw new Error("Shift+Tab did not reverse through mobile navigation");
      await page.keyboard.press("Escape");
      await page.locator(".sidebar:not(.is-mobile-open)").waitFor();
      if (await menuButton.getAttribute("aria-expanded") !== "false") throw new Error("Escape did not close mobile navigation");
      if (!(await menuButton.evaluate(element => element === document.activeElement))) throw new Error("Escape did not restore focus to the menu button");
      await menuButton.click();
      await page.locator(".mobile-drawer-close").click();
      await page.locator(".sidebar:not(.is-mobile-open)").waitFor();
      if (await menuButton.getAttribute("aria-expanded") !== "false") throw new Error("Drawer close button did not close navigation");
      await menuButton.click();
      await page.locator(".mobile-nav-backdrop").click({ position: { x: 10, y: 10 } });
      await page.locator(".sidebar:not(.is-mobile-open)").waitFor();
      if (await menuButton.getAttribute("aria-expanded") !== "false") throw new Error("Backdrop did not close navigation");
      await navigateToSection(page, "Aid batches", true);
      await inspectViewport(page, viewport.width, viewport.height, "Mobile menu keyboard and navigation");
      await navigateToSection(page, "Overview", true);
    }

    for (const section of sections.slice(1)) {
      await navigateToSection(page, section, mobile);
      await inspectViewport(page, viewport.width, viewport.height, section);
    }

    // Exercise the primary operator journey at every viewport.
    const stamp = String(viewport.width);
    await navigateToSection(page, "Aid batches", mobile);
    const batchForm = page.locator("form.form-card").first();
    await batchForm.getByLabel("Donor / organization").fill("Responsive Test Kitchen " + stamp);
    await batchForm.getByLabel("Batch name").fill("Viewport test meals " + stamp);
    await batchForm.getByLabel("Quantity (units)").fill("12");
    await batchForm.getByLabel("Pickup location").fill("Test loading bay");
    await batchForm.getByRole("button", { name: /Register batch/i }).click();
    await page.getByText("Viewport test meals " + stamp, { exact: true }).waitFor();
    await inspectViewport(page, viewport.width, viewport.height, "Aid batch creation journey");

    await navigateToSection(page, "Riders", mobile);
    const riderForm = page.locator("form.form-card").first();
    await riderForm.getByLabel("Rider name").fill("Responsive Rider " + stamp);
    await riderForm.getByLabel("Capacity (units)").fill("20");
    await riderForm.getByLabel("Current zone").fill("Test zone");
    await riderForm.getByRole("button", { name: /Add rider/i }).click();
    await page.getByText("Responsive Rider " + stamp, { exact: true }).waitFor();
    await inspectViewport(page, viewport.width, viewport.height, "Rider registration journey");

    await navigateToSection(page, "Receiving sites", mobile);
    const siteForm = page.locator("form.form-card").first();
    await siteForm.getByLabel("Site name").fill("Responsive Site " + stamp);
    await siteForm.getByLabel("Zone").fill("Test zone");
    await siteForm.getByLabel("Demand (units)").fill("35");
    await siteForm.getByRole("button", { name: /Add receiving site/i }).click();
    await page.getByText("Responsive Site " + stamp, { exact: true }).waitFor();
    await inspectViewport(page, viewport.width, viewport.height, "Receiving site registration journey");

    await navigateToSection(page, "Dispatch board", mobile);
    const allocationForm = page.locator("form.form-card").first();
    await allocationForm.getByLabel("Aid batch").selectOption("B-180");
    await allocationForm.getByLabel("Units to allocate").fill("40");
    await allocationForm.getByLabel("Estimated travel (minutes)").fill("10");
    await allocationForm.getByLabel("Safety buffer (minutes)").fill("5");
    await allocationForm.getByRole("button", { name: /Find feasible split/i }).click();
    await page.getByText(/40 units reserved/i).waitFor();
    await inspectViewport(page, viewport.width, viewport.height, "Feasible allocation journey");

    // A successful plan routes directly to Reservations for the next operator step.
    await page.locator(".reservation-card").first().waitFor();
    await page.locator(".reservation-card").first().getByRole("button", { name: /Confirm claim/i }).click();
    await page.getByText(/Reservation confirmation checked/i).waitFor();
    await inspectViewport(page, viewport.width, viewport.height, "Reservation confirmation journey");

    await navigateToSection(page, "Dispatch board", mobile);
    await page.getByRole("button", { name: /Confirm pickup/i }).first().click();
    await page.getByRole("button", { name: /Start transit/i }).first().waitFor();
    await inspectViewport(page, viewport.width, viewport.height, "Pickup journey");
    await page.getByRole("button", { name: /Start transit/i }).first().click();
    await page.getByRole("button", { name: /Confirm delivery/i }).first().waitFor();
    await inspectViewport(page, viewport.width, viewport.height, "Transit journey");
    await page.getByRole("button", { name: /Confirm delivery/i }).first().click();
    await page.getByText(/Delivery recorded|Assignment updated/i).waitFor();
    await inspectViewport(page, viewport.width, viewport.height, "Delivery journey");

    if (pageErrors.length) {
      throw new Error("[" + viewport.width + "x" + viewport.height + "] browser errors: " + pageErrors.join("; "));
    }
    await page.close();
  }

  console.log(`Responsive layout and main-journey checks passed for ${viewports.length} viewport sizes, all 9 views, and the aid-intake-to-delivery flow.`);
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
