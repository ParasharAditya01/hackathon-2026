import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const baseURL = "http://127.0.0.1:4181";
const sections = ["Overview", "Aid batches", "Dispatch board", "Riders", "Receiving sites", "Reservations", "Alerts & audit", "Resilience lab"];
const expectedMetadata = {
  Overview: ["AidFlow | Civic Aid Operations", "Explore AidFlow’s demo overview of time-critical surplus aid, safety constraints and civic micro-logistics. Enter the workspace to review the sample operations."],
  "Aid batches": ["Aid Batches & Surplus Inventory | AidFlow", "Review AidFlow’s sample aid batches, surplus inventory, handling notes and safe-use deadlines. Explore how available supplies are tracked in the demo."],
  "Dispatch board": ["Dispatch Planning & Deliveries | AidFlow", "Explore AidFlow’s simulated dispatch assignments, delivery deadlines, rider capacity and rerouting options. Open the workspace to review delivery planning."],
  Riders: ["Rider Fleet & Capacity | AidFlow", "Review the demo rider fleet, transport types, carrying capacity and availability used in AidFlow’s dispatch planning simulation."],
  "Receiving sites": ["Receiving Sites & Aid Demand | AidFlow", "Explore AidFlow’s sample receiving sites, aid demand and available storage or handling resources to understand destination suitability."],
  Reservations: ["Aid Reservations & Claim Queue | AidFlow", "Review AidFlow’s simulated aid reservations, claim queue and reservation status for coordinating sample supply with receiving-site needs."],
  "Alerts & audit": ["Operational Alerts & Audit Trail | AidFlow", "Explore AidFlow’s demo operational alerts and audit trail to review simulated dispatch events, warnings and recorded workflow changes."],
  "Resilience lab": ["Resilience Lab & Failure Simulations | AidFlow", "Run AidFlow’s built-in demo scenarios to explore how simulated dispatch responds to delays, unavailable riders, site closures and resource constraints."],
};
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

async function auditControlSemantics(page, contextName) {
  const result = await page.evaluate(() => {
    const visible = element => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
    const unnamedButtons = [...document.querySelectorAll("button")].filter(visible).filter(button =>
      !(button.getAttribute("aria-label") || button.getAttribute("aria-labelledby") || button.innerText || "").trim()
    ).map(button => button.outerHTML.slice(0, 180));
    const unlabeledFields = [...document.querySelectorAll("input, select, textarea")].filter(visible).filter(field => {
      if (field.type === "hidden" || field.getAttribute("aria-hidden") === "true") return false;
      return !(field.getAttribute("aria-label") || field.getAttribute("aria-labelledby") || (field.labels && field.labels.length));
    }).map(field => field.outerHTML.slice(0, 180));
    const misleadingPointerTargets = [...document.querySelectorAll("body *")].filter(visible).filter(element => {
      if (getComputedStyle(element).cursor !== "pointer") return false;
      return !element.closest("button, a, input, select, textarea, label, summary, [role='button'], [role='link']");
    }).map(element => ({
      tag: element.tagName.toLowerCase(),
      className: typeof element.className === "string" ? element.className : "",
      text: (element.innerText || "").trim().slice(0, 60),
    }));
    return { unnamedButtons, unlabeledFields, misleadingPointerTargets };
  });
  if (result.unnamedButtons.length) throw new Error(contextName + " has buttons without accessible names: " + JSON.stringify(result.unnamedButtons));
  if (result.unlabeledFields.length) throw new Error(contextName + " has form controls without accessible labels: " + JSON.stringify(result.unlabeledFields));
  if (result.misleadingPointerTargets.length) throw new Error(contextName + " styles non-interactive elements as clickable: " + JSON.stringify(result.misleadingPointerTargets));
}

async function navigate(page, section) {
  await page.locator(".nav-item").filter({ hasText: section }).click();
  await page.locator(".page-content").waitFor();
  const actual = (await page.locator(".breadcrumb strong").innerText()).trim();
  if (actual !== section) throw new Error("Navigation to " + section + " opened " + actual + ".");
  const [expectedTitle, expectedDescription] = expectedMetadata[section];
  const metadata = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || "",
  }));
  if (metadata.title !== expectedTitle) throw new Error("Wrong document title for " + section + ": " + metadata.title);
  if (metadata.description !== expectedDescription) throw new Error("Wrong meta description for " + section + ": " + metadata.description);
  if (metadata.description.length > 160) throw new Error("Meta description exceeds 160 characters for " + section + ".");
  console.log("PASS rendered title and unique meta description · " + section);
}

async function resetFromScenarios(page, accept) {
  page.once("dialog", dialog => accept ? dialog.accept() : dialog.dismiss());
  await page.getByRole("button", { name: /Reset scenario data/ }).click();
  if (accept) {
    await page.getByText("Scenario data reset to the original illustrative records.").waitFor();
    await page.locator(".scenario-result").count().then(count => {
      if (count !== 0) throw new Error("Reset did not clear the scenario execution log.");
    });
  }
}

async function createAllocation(page, quantity, submitTwice = false) {
  await navigate(page, "Dispatch board");
  const form = page.locator("form.form-card").first();
  await form.getByLabel("Aid batch").selectOption("B-180");
  await form.getByLabel("Units to allocate").fill(String(quantity || 40));
  await form.getByLabel("Estimated travel (minutes)").fill("10");
  await form.getByLabel("Safety buffer (minutes)").fill("5");
  const submitButton = form.getByRole("button", { name: /Find feasible split/ });
  if (submitTwice) {
    await submitButton.evaluate(button => {
      const formElement = button.closest("form");
      formElement.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      formElement.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  } else {
    await submitButton.click();
  }
  await navigate(page, "Reservations");
  const card = page.locator(".reservation-card").filter({ hasText: "Pending" }).first();
  await card.waitFor();
  if (submitTwice && await page.locator(".reservation-card").count() !== 1) {
    throw new Error("Two rapid allocation submissions created duplicate reservations.");
  }
  return card;
}

async function confirmAndPickup(page) {
  await navigate(page, "Reservations");
  const claim = page.getByRole("button", { name: /Confirm claim/ }).first();
  await claim.waitFor();
  await claim.click();
  await page.getByText("Reservation confirmed. Pickup can now be recorded.").waitFor();
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
  await auditControlSemantics(page, "landing page");

  // Both landing-page entry actions must route to their promised destination.
  const explorePage = await context.newPage();
  await explorePage.goto(baseURL, { waitUntil: "networkidle" });
  await explorePage.getByRole("button", { name: /Explore the resilience demo/ }).click();
  await explorePage.locator(".page-content").waitFor();
  if ((await explorePage.locator(".breadcrumb strong").innerText()).trim() !== "Resilience lab") {
    throw new Error("The landing-page resilience CTA did not open Resilience lab.");
  }
  await explorePage.close();
  const primaryEntryPage = await context.newPage();
  await primaryEntryPage.goto(baseURL, { waitUntil: "networkidle" });
  await primaryEntryPage.getByRole("button", { name: /Open operations workspace/ }).click();
  await primaryEntryPage.locator(".page-content").waitFor();
  if ((await primaryEntryPage.locator(".breadcrumb strong").innerText()).trim() !== "Overview") {
    throw new Error("The primary workspace CTA did not open Overview.");
  }
  await primaryEntryPage.close();
  const footerEntryPage = await context.newPage();
  await footerEntryPage.goto(baseURL, { waitUntil: "networkidle" });
  const footerEntry = footerEntryPage.locator(".landing-footer").getByRole("button", { name: /Enter operations/ });
  await footerEntry.scrollIntoViewIfNeeded();
  await footerEntry.click();
  await footerEntryPage.locator(".page-content").waitFor();
  if ((await footerEntryPage.locator(".breadcrumb strong").innerText()).trim() !== "Overview") {
    throw new Error("The footer workspace CTA did not open Overview.");
  }
  await footerEntryPage.close();
  await page.locator("header").getByRole("button", { name: "Enter operations" }).click();
  await page.locator(".page-content").waitFor();
  console.log("PASS landing-page CTAs · workspace and resilience destinations");

  // Overview shortcut actions must land on the promised destination and preserve the selected batch.
  await page.locator(".urgent-row .text-action").first().click();
  if ((await page.locator(".breadcrumb strong").innerText()).trim() !== "Dispatch board") {
    throw new Error("The urgency-queue Plan action did not open Dispatch board.");
  }
  if (!(await page.locator("form.form-card").first().getByLabel("Aid batch").inputValue())) {
    throw new Error("The Plan action did not select an aid batch.");
  }
  await navigate(page, "Overview");
  await page.getByRole("button", { name: /Open dispatch board/ }).click();
  if ((await page.locator(".breadcrumb strong").innerText()).trim() !== "Dispatch board") {
    throw new Error("The Overview dispatch shortcut did not open Dispatch board.");
  }
  await navigate(page, "Overview");

  // Every navigation control must show the correct page.
  for (const section of sections) {
    await navigate(page, section);
    await auditControlSemantics(page, section);
  }
  console.log("PASS all eight workspace navigation controls");

  // Batch form and inventory search. CI intentionally has no Turnstile secret or live API:
  // verify the security gate stays closed, then exercise search against seeded demo inventory.
  await navigate(page, "Aid batches");
  const batchForm = page.locator("form.form-card").first();
  await batchForm.getByLabel("Donor / organization").fill("Interaction Test Kitchen");
  await batchForm.getByLabel("Batch name").fill("Interaction Test Meals");
  await batchForm.getByLabel("Quantity (units)").fill("12");
  await batchForm.getByLabel("Pickup location").fill("Test loading bay");
  const registerButton = batchForm.getByRole("button", { name: /Register batch/ });
  if (await registerButton.isEnabled()) {
    throw new Error("Batch registration must remain disabled in CI without configured Turnstile verification.");
  }
  await page.getByText(/security verification/i).waitFor();
  const search = page.getByRole("searchbox", { name: "Search aid batches, donors, or aid type" });
  await search.fill("no-such-aid-record-xyz");
  await page.getByText("No matching aid batches", { exact: true }).waitFor();
  await search.fill("");
  if (await page.locator(".batch-card").count() < 2) throw new Error("Clearing batch search did not restore the seeded inventory list.");
  console.log("PASS batch security gate and inventory search · unverified submissions blocked; filtering and empty state work");

  // Rider form and availability toggle.
  await navigate(page, "Riders");
  const riderForm = page.locator("form.form-card").first();
  await riderForm.getByLabel("Rider name").fill("Interaction Test Rider");
  await riderForm.getByLabel("Phone number").fill("+919876543210");
  await riderForm.getByLabel("Capacity (units)").fill("20");
  await riderForm.getByLabel("Current zone").fill("Test zone");
  await riderForm.getByRole("button", { name: /Add rider/ }).click();
  const riderCard = page.locator(".rider-card").filter({ hasText: "Interaction Test Rider" });
  await riderCard.waitFor();
  await page.getByRole("status").getByText("Rider added to fleet.").waitFor();
  await riderCard.getByRole("button", { name: "Set unavailable" }).click();
  await page.getByRole("status").getByText("Rider availability updated.").waitFor();
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
  await page.getByRole("status").getByText("Receiving site registered.").waitFor();
  page.once("dialog", dialog => dialog.accept("10.5"));
  await siteCard.getByRole("button", { name: "Record direct drop-off" }).click();
  await page.getByText("Direct drop-off must be a positive whole number of units.").waitFor();
  if ((await siteCard.locator(".site-demand > div").nth(1).locator("strong").innerText()).trim() !== "0") {
    throw new Error("Invalid fractional direct drop-off changed delivered inventory.");
  }
  page.once("dialog", dialog => dialog.accept("10"));
  await siteCard.getByRole("button", { name: "Record direct drop-off" }).click();
  await page.getByRole("status").getByText("Direct drop-off recorded. Review any recovery alerts for affected cargo.").waitFor();
  if (!(await siteCard.locator(".site-demand").innerText()).includes("10")) throw new Error("Direct drop-off did not update delivered units.");
  page.once("dialog", dialog => dialog.accept("20"));
  await siteCard.getByRole("button", { name: "Edit demand" }).click();
  if (!(await siteCard.locator(".site-demand").innerText()).includes("20")) throw new Error("Editing site demand did not update the demand value.");
  await siteCard.getByRole("button", { name: "Close site" }).click();
  await siteCard.getByRole("button", { name: "Reopen site" }).waitFor();
  await siteCard.getByRole("button", { name: "Reopen site" }).click();
  await siteCard.getByRole("button", { name: "Close site" }).waitFor();
  console.log("PASS receiving-site form, resource controls, direct drop-off, demand edit, and status toggle");

  // Return to a known fixture so the extra test rider/site cannot alter allocation cardinality.
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".profile-button").click();
  await page.getByText("Scenario data reset to the original illustrative records.").waitFor();

  // Allocation must create reservations once; reservation and assignment buttons advance real state.
  const allocationCard = await createAllocation(page, 40, true);
  await allocationCard.getByRole("button", { name: /Confirm claim/ }).click();
  await page.getByText("Reservation confirmed. Pickup can now be recorded.").waitFor();
  await navigate(page, "Dispatch board");
  await page.getByRole("button", { name: /Confirm pickup/ }).first().click();
  await page.getByRole("button", { name: /Start transit/ }).first().waitFor();
  await page.getByRole("button", { name: /Start transit/ }).first().click();
  await page.getByRole("button", { name: /Confirm delivery/ }).first().waitFor();
  await page.getByRole("button", { name: /Confirm delivery/ }).first().click();
  await page.getByText(/Assignment updated\./).waitFor();
  const deliveredCard = page.locator(".assignment-card").filter({ has: page.getByText("Delivered", { exact: true }) });
  await deliveredCard.first().waitFor();
  if (await deliveredCard.getByRole("button").count() !== 0) throw new Error("Delivered assignment still exposes lifecycle actions.");
  console.log("PASS allocation → reservation confirmation → pickup → transit → delivery");

  // An accepted claim can be cancelled before pickup, releasing its reservation.
  const cancelledClaim = await createAllocation(page, 10);
  await cancelledClaim.getByRole("button", { name: /Confirm claim/ }).click();
  await navigate(page, "Dispatch board");
  await page.getByRole("button", { name: /Cancel before pickup/ }).first().click();
  await page.getByText(/Assignment updated\./).waitFor();
  if (await page.getByRole("button", { name: /Cancel before pickup/ }).count()) {
    throw new Error("Cancelling before pickup did not remove the cancellation action.");
  }
  console.log("PASS reservation cancellation before pickup");

  // An impossible travel estimate must be blocked, and the result shortcut must still work.
  await navigate(page, "Dispatch board");
  const impossibleForm = page.locator("form.form-card").first();
  await impossibleForm.getByLabel("Aid batch").selectOption("B-180");
  await impossibleForm.getByLabel("Units to allocate").fill("10");
  await impossibleForm.getByLabel("Estimated travel (minutes)").fill("600");
  await impossibleForm.getByLabel("Safety buffer (minutes)").fill("5");
  await impossibleForm.getByRole("button", { name: /Find feasible split/ }).click();
  await page.getByRole("status").getByText("No feasible reservation created.").waitFor();
  await page.getByText("No feasible allocation", { exact: true }).waitFor();
  await page.getByRole("button", { name: /Review reservations/ }).click();
  if ((await page.locator(".breadcrumb strong").innerText()).trim() !== "Reservations") {
    throw new Error("Review reservations did not navigate to Reservations after a blocked plan.");
  }
  console.log("PASS infeasible-plan safety block and Review reservations shortcut");

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
    if (scenario[1] === "ghost") {
      await navigate(page, "Reservations");
      await page.getByRole("button", { name: /Check expiry now/ }).click();
      await page.getByText("Expired reservations and aid deadlines checked.").waitFor();
      console.log("PASS manual reservation-expiry check");
    }
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
      await recoveryCard.getByRole("button", { name: /Request reroute/ }).click();
      await recoveryCard.getByRole("button", { name: "Escalate cargo" }).click();
      await recoveryCard.getByRole("button", { name: "Reopen recovery" }).waitFor();
    } else {
      await recoveryCard.getByRole("button", { name: "Escalate cargo" }).click();
      await recoveryCard.getByRole("button", { name: "Reopen recovery" }).waitFor();
      await recoveryCard.getByRole("button", { name: "Reopen recovery" }).click();
      await recoveryCard.getByRole("button", { name: "Escalate cargo" }).waitFor();
      await recoveryCard.getByRole("button", { name: "Escalate cargo" }).click();
      await recoveryCard.getByRole("button", { name: "Reopen recovery" }).waitFor();
    }
  } else {
    await recoveryCard.getByRole("button", { name: "Reopen recovery" }).waitFor();
    await recoveryCard.getByRole("button", { name: "Reopen recovery" }).click();
    await recoveryCard.getByRole("button", { name: "Escalate cargo" }).waitFor();
    await recoveryCard.getByRole("button", { name: "Escalate cargo" }).click();
    await recoveryCard.getByRole("button", { name: "Reopen recovery" }).waitFor();
  }
  await recoveryCard.getByRole("button", { name: "Record failed cargo" }).click();
  await recoveryCard.getByRole("button", { name: "Mark spoiled" }).waitFor();
  await recoveryCard.getByRole("button", { name: "Mark spoiled" }).click();
  await page.getByText(/Cargo disposition recorded\./).waitFor();
  console.log("PASS recovery controls · reroute gating, escalation, reopening, and spoiled-cargo disposition");

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
