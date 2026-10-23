import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const baseURL = "http://127.0.0.1:4181";
const sections = ["Overview", "Aid batches", "Dispatch board", "Riders", "Receiving sites", "Reservations", "Alerts & audit", "Resilience lab"];
const scenarios = [
  ["Urgent safe-use deadline", "expiry"],
  ["Split 180 meals", "split"],
  ["Unresponsive volunteer", "ghost"],
  ["Direct drop fills demand", "direct-drop"],
  ["Shelter closes in transit", "closure"],
  ["Missing cooking resources", "resources"],
];
const server = spawn("npm", ["run", "dev", "--", "--host", "127.0.0.1", "--port", "4181", "--strictPort"], {
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
  throw new Error("Vite server did not become ready for interaction checks.");
}

async function navigate(page, section) {
  await page.locator(".nav-item").filter({ hasText: section }).click();
  await page.locator(".page-content").waitFor();
  const actual = (await page.locator(".breadcrumb strong").innerText()).trim();
  if (actual !== section) throw new Error("Navigation to " + section + " opened " + actual + ".");
}

async function resetFromScenarios(page, accept) {
  page.once("dialog", dialog => accept ? dialog.accept() : dialog.dismiss());
  await page.getByRole("button", { name: /Reset scenario data/ }).click();
  if (accept) {
    await page.getByText("Demo reset to seeded scenario data.").waitFor();
    await page.locator(".scenario-result").count().then(count => {
      if (count !== 0) throw new Error("Reset did not clear the scenario execution log.");
    });
  }
}

async function createAllocation(page, quantity) {
  await navigate(page, "Dispatch board");
  const form = page.locator("form.form-card").first();
  await form.getByLabel("Aid batch").selectOption("B-180");
  await form.getByLabel("Units to allocate").fill(String(quantity || 40));
  await form.getByLabel("Estimated travel (minutes)").fill("10");
  await form.getByLabel("Safety buffer (minutes)").fill("5");
  await form.getByRole("button", { name: /Find feasible split/ }).click();
  await navigate(page, "Reservations");
  const card = page.locator(".reservation-card").first();
  await card.waitFor();
  return card;
}

async function confirmAndPickup(page) {
  await navigate(page, "Reservations");
  const claim = page.getByRole("button", { name: /Confirm claim/ }).first();
  await claim.waitFor();
  await claim.click();
  await page.getByText("Reservation confirmation checked.").waitFor();
  await navigate(page, "Dispatch board");
  await page.getByRole("button", { name: /Confirm pickup/ }).first().click();
  await page.getByRole("button", { name: /Start transit/ }).first().waitFor();
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(baseURL, { waitUntil: "networkidle" });

  // Both landing-page entry actions must route to their promised destination.
  const explorePage = await context.newPage();
  await explorePage.goto(baseURL, { waitUntil: "networkidle" });
  await explorePage.getByRole("button", { name: /Explore the resilience demo/ }).click();
  await explorePage.locator(".page-content").waitFor();
  if ((await explorePage.locator(".breadcrumb strong").innerText()).trim() !== "Resilience lab") {
    throw new Error("The landing-page resilience CTA did not open Resilience lab.");
  }
  await explorePage.close();
  await page.getByRole("button", { name: /Enter operations/ }).click();
  await page.locator(".page-content").waitFor();
  console.log("PASS landing-page CTAs · workspace and resilience destinations");

  // Every navigation control must show the correct page.
  for (const section of sections) await navigate(page, section);
  console.log("PASS all eight workspace navigation controls");

  // Batch form: submit, search, no-result state, and clearing the filter.
  await navigate(page, "Aid batches");
  const batchForm = page.locator("form.form-card").first();
  await batchForm.getByLabel("Donor / organization").fill("Interaction Test Kitchen");
  await batchForm.getByLabel("Batch name").fill("Interaction Test Meals");
  await batchForm.getByLabel("Quantity (units)").fill("12");
  await batchForm.getByLabel("Pickup location").fill("Test loading bay");
  await batchForm.getByRole("button", { name: /Register batch/ }).dblclick();
  await page.getByText("Interaction Test Meals", { exact: true }).waitFor();
  const search = page.getByRole("searchbox", { name: "Search aid batches, donors, or aid type" });
  await search.fill("Interaction Test Meals");
  if (await page.locator(".batch-card").count() !== 1) throw new Error("Batch search did not filter to the matching record.");
  await search.fill("no-such-aid-record-xyz");
  await page.getByText("No matching aid batches", { exact: true }).waitFor();
  await search.fill("");
  if (await page.locator(".batch-card").count() < 2) throw new Error("Clearing batch search did not restore the full inventory list.");
  if (await page.getByText("Interaction Test Meals", { exact: true }).count() !== 1) {
    throw new Error("Rapid batch-form submission created duplicate records or lost the new record.");
  }
  console.log("PASS batch form and inventory search · record created once, filtering and empty state work");

  // Rider form and availability toggle.
  await navigate(page, "Riders");
  const riderForm = page.locator("form.form-card").first();
  await riderForm.getByLabel("Rider name").fill("Interaction Test Rider");
  await riderForm.getByLabel("Capacity (units)").fill("20");
  await riderForm.getByLabel("Current zone").fill("Test zone");
  await riderForm.getByRole("button", { name: /Add rider/ }).click();
  const riderCard = page.locator(".rider-card").filter({ hasText: "Interaction Test Rider" });
  await riderCard.waitFor();
  await riderCard.getByRole("button", { name: "Set unavailable" }).click();
  await riderCard.getByRole("button", { name: "Set available" }).waitFor();
  await riderCard.getByRole("button", { name: "Set available" }).click();
  await riderCard.getByRole("button", { name: "Set unavailable" }).waitFor();
  console.log("PASS rider registration and availability toggle");

  // Site form, resource checkboxes, native prompt actions, and close/reopen.
  await navigate(page, "Receiving sites");
  const siteForm = page.locator("form.form-card").first();
  await siteForm.getByLabel("Site name").fill("Interaction Test Shelter");
  await siteForm.getByLabel("Zone").fill("Test zone");
  await siteForm.getByLabel("Demand (units)").fill("35");
  await siteForm.getByLabel("Clean water").check();
  await siteForm.getByLabel("Cooking fuel").check();
  await siteForm.getByRole("button", { name: /Add receiving site/ }).click();
  const siteCard = page.locator(".site-card").filter({ hasText: "Interaction Test Shelter" });
  await siteCard.waitFor();
  page.once("dialog", dialog => dialog.accept("10"));
  await siteCard.getByRole("button", { name: "Record direct drop-off" }).click();
  await page.getByText("Direct drop-off recorded; affected cargo requires recovery.").waitFor();
  if (!(await siteCard.locator(".site-demand").innerText()).includes("10")) throw new Error("Direct drop-off did not update delivered units.");
  page.once("dialog", dialog => dialog.accept("20"));
  await siteCard.getByRole("button", { name: "Edit demand" }).click();
  if (!(await siteCard.locator(".site-demand").innerText()).includes("20")) throw new Error("Editing site demand did not update the demand value.");
  await siteCard.getByRole("button", { name: "Close site" }).click();
  await siteCard.getByRole("button", { name: "Reopen site" }).waitFor();
  await siteCard.getByRole("button", { name: "Reopen site" }).click();
  await siteCard.getByRole("button", { name: "Close site" }).waitFor();
  console.log("PASS receiving-site form, resource controls, direct drop-off, demand edit, and status toggle");

  // Allocation must create reservations once; reservation and assignment buttons advance real state.
  const allocationCard = await createAllocation(page, 40);
  await allocationCard.getByRole("button", { name: /Confirm claim/ }).click();
  await page.getByText("Reservation confirmation checked.").waitFor();
  await navigate(page, "Dispatch board");
  await page.getByRole("button", { name: /Confirm pickup/ }).first().click();
  await page.getByRole("button", { name: /Start transit/ }).first().waitFor();
  await page.getByRole("button", { name: /Start transit/ }).first().click();
  await page.getByRole("button", { name: /Confirm delivery/ }).first().waitFor();
  await page.getByRole("button", { name: /Confirm delivery/ }).first().click();
  await page.getByText(/Assignment updated\./).waitFor();
  if (await page.locator(".assignment-card").count() !== 0) throw new Error("Delivered assignment remained in the active dispatch list.");
  console.log("PASS allocation → reservation confirmation → pickup → transit → delivery");

  // Failure/disposition branch must change the assignment state and expose the correct next action.
  await page.getByRole("button", { name: /Open navigation menu/ }).count().then(async count => {
    if (count) await navigate(page, "Resilience lab");
    else await navigate(page, "Resilience lab");
  });
  await resetFromScenarios(page, true);
  await createAllocation(page, 20);
  await confirmAndPickup(page);
  await page.getByRole("button", { name: /Start transit/ }).first().click();
  await page.getByRole("button", { name: /Report failure/ }).first().click();
  await page.getByRole("button", { name: "Mark rejected" }).first().click();
  await page.getByText(/Cargo disposition recorded\./).waitFor();
  console.log("PASS failed-cargo branch · report failure and record rejection");

  // Every scenario card must execute and write an outcome. Reset between scenarios isolates each run.
  await navigate(page, "Resilience lab");
  for (const scenario of scenarios) {
    await resetFromScenarios(page, true);
    await page.locator(".scenario-card").filter({ hasText: scenario[0] }).click();
    await page.locator(".scenario-result").first().waitFor();
    const outcomeCount = await page.locator(".scenario-result ul li").count();
    if (outcomeCount < 1) throw new Error("Scenario " + scenario[0] + " produced no execution details.");
    console.log("PASS scenario action · " + scenario[0]);
  }

  // Native confirmation can be cancelled without mutating the demo.
  const scenarioCountBeforeCancel = await page.locator(".scenario-result").count();
  await resetFromScenarios(page, false);
  if (await page.locator(".scenario-result").count() !== scenarioCountBeforeCancel) {
    throw new Error("Cancelling reset changed the scenario state.");
  }
  // The sidebar reset control uses the same confirmation behavior.
  page.once("dialog", dialog => dialog.dismiss());
  await page.locator(".profile-button").click();
  if (await page.locator(".scenario-result").count() !== scenarioCountBeforeCancel) {
    throw new Error("Cancelling the sidebar reset changed the scenario state.");
  }
  console.log("PASS reset confirmation dialogs · cancel preserves state");

  // Closure recovery exposes either a feasible reroute or explicit escalation.
  await resetFromScenarios(page, true);
  await page.locator(".scenario-card").filter({ hasText: "Shelter closes in transit" }).click();
  await navigate(page, "Dispatch board");
  const recoveryCard = page.locator(".assignment-card").first();
  await recoveryCard.waitFor();
  const approveReroute = recoveryCard.getByRole("button", { name: "Approve reroute" });
  if (await approveReroute.count()) {
    if (await approveReroute.isEnabled()) throw new Error("Approve reroute should be disabled until a destination is selected.");
    const destination = recoveryCard.locator("select").first();
    const options = await destination.locator("option").evaluateAll(nodes => nodes.map(option => option.value).filter(Boolean));
    if (options.length) {
      await destination.selectOption(options[0]);
      if (!(await approveReroute.isEnabled())) throw new Error("Selecting a valid reroute destination did not enable approval.");
      await approveReroute.click();
      await page.getByText(/Reroute approved|Reroute blocked/).waitFor();
    } else {
      await recoveryCard.getByRole("button", { name: "Escalate cargo" }).click();
      await recoveryCard.getByRole("button", { name: "Reopen recovery" }).waitFor();
    }
  } else {
    await recoveryCard.getByRole("button", { name: "Reopen recovery" }).waitFor();
    await recoveryCard.getByRole("button", { name: "Reopen recovery" }).click();
    await recoveryCard.getByRole("button", { name: "Escalate cargo" }).waitFor();
  }
  console.log("PASS recovery controls · reroute gating or explicit escalation");

  // Open alerts are actionable and disappear from the unresolved action queue when resolved.
  await navigate(page, "Alerts & audit");
  const openAlert = page.locator(".event-row").filter({ hasText: "Destination demand changed" }).first();
  if (await openAlert.count()) {
    await openAlert.getByRole("button", { name: "Resolve" }).click();
    await page.getByText("Alert marked reviewed.").waitFor();
    if (await openAlert.getByRole("button", { name: "Resolve" }).count()) throw new Error("Resolved alert still offers the Resolve action.");
    console.log("PASS alert resolution");
  } else {
    throw new Error("Closure/recovery scenario did not create an actionable alert to resolve.");
  }

  if (pageErrors.length) throw new Error("Browser errors during interaction checks: " + pageErrors.join("; "));
  console.log("Interaction audit passed: forms, search filtering, navigation, confirmation dialogs, scenario actions, operational state transitions, rerouting, alerts, and reset controls.");
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
