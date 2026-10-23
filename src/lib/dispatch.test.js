import test from "node:test";
import assert from "node:assert/strict";
import {
  allocateAcrossRiders, confirmReservation, createSeedState, disposeFailedCargo,
  expireAidBatches, expireReservations, runScenario, shelterRemaining,
  transitionAssignment, validateFeasibility
} from "./dispatch.js";

test("180-unit split never exceeds 40-unit rider capacity or site demand", () => {
  const state = createSeedState();
  const result = runScenario(state, "split");
  const total = state.reservations.filter(r => r.status === "pending").reduce((sum, r) => sum + r.quantity, 0);
  assert.equal(total, 180);
  assert.ok(state.reservations.filter(r => r.status === "pending").every(r => r.quantity <= 40));
  for (const rider of state.riders) {
    const committed = state.reservations.filter(r => r.riderId === rider.id && r.status === "pending").reduce((sum, r) => sum + r.quantity, 0);
    assert.ok(committed <= rider.capacity);
  }
  for (const site of state.shelters) assert.ok(shelterRemaining(state, site.id) >= 0);
  assert.ok(result.some(line => line.includes("Reserved 180/180")));
});

test("ghost reservation expiry releases held stock exactly once", () => {
  const state = createSeedState();
  runScenario(state, "ghost");
  const expired = state.reservations.find(r => r.status === "expired");
  assert.ok(expired);
  const batch = state.donations.find(d => d.id === expired.donationId);
  const availableAfterFirstExpiry = batch.available;
  assert.equal(expireReservations(state, Date.now()), 0);
  assert.equal(batch.available, availableAfterFirstExpiry);
  assert.equal(batch.available + batch.reserved + batch.picked + batch.delivered + batch.rejected, batch.original);
});

test("raw ration allocation is blocked without clean water and cooking fuel", () => {
  const state = createSeedState();
  const reasons = validateFeasibility(state, {
    donationId: "B-120", riderId: "R-01", shelterId: "S-C",
    quantity: 10, travelMinutes: 10, safetyBufferMinutes: 10
  });
  assert.ok(reasons.some(reason => reason.includes("clean water and cooking fuel")));
});

test("medical supplies require cold-chain and medical storage", () => {
  const state = createSeedState();
  const reasons = validateFeasibility(state, {
    donationId: "B-MED", riderId: "R-01", shelterId: "S-C",
    quantity: 1, travelMinutes: 10, safetyBufferMinutes: 10
  });
  assert.ok(reasons.some(reason => reason.includes("cold-chain")));
  assert.ok(reasons.some(reason => reason.includes("medical storage")));
});

test("confirmation keeps stock reserved until pickup, then moves it to picked inventory", () => {
  const state = createSeedState();
  const result = allocateAcrossRiders(state, {
    donationId: "B-180", quantity: 40, travelMinutes: 10, safetyBufferMinutes: 10
  });
  assert.equal(result.allocations.reduce((sum, a) => sum + a.quantity, 0), 40);
  const reservation = result.allocations[0].reservation;
  const confirmed = confirmReservation(state, reservation.id);
  assert.equal(confirmed.ok, true);
  const assignment = confirmed.assignment;
  const batch = state.donations.find(d => d.id === "B-180");
  assert.equal(reservation.status, "confirmed");
  assert.equal(batch.reserved, 40);
  assert.equal(batch.picked, 0);
  const pickup = transitionAssignment(state, assignment.id, "picked_up");
  assert.equal(pickup.ok, true);
  assert.equal(batch.reserved, 0);
  assert.equal(batch.picked, 40);
});

test("direct drop-off fills Shelter A demand and sends incoming cargo to recovery", () => {
  const state = createSeedState();
  runScenario(state, "direct-drop");
  const site = state.shelters.find(s => s.id === "S-A");
  const assignment = state.assignments.find(a => a.status === "reroute_required");
  const batch = state.donations.find(d => d.id === "B-180");
  assert.equal(site.delivered, 50);
  assert.ok(assignment);
  assert.equal(assignment.quantity, 40);
  assert.equal(batch.picked, 40);
  assert.equal(batch.available + batch.reserved + batch.picked + batch.delivered + batch.rejected, batch.original);
});

test("deadline and safety buffer are hard constraints", () => {
  const state = createSeedState();
  const reasons = validateFeasibility(state, {
    donationId: "B-090", riderId: "R-02", shelterId: "S-B",
    quantity: 10, travelMinutes: 40, safetyBufferMinutes: 10
  });
  assert.ok(reasons.some(reason => reason.includes("safe-use deadline")));
});


test("confirmed but unpicked claim expires and releases reserved stock", () => {
  const state = createSeedState();
  const result = allocateAcrossRiders(state, {
    donationId: "B-180", quantity: 40, travelMinutes: 10, safetyBufferMinutes: 10
  });
  const reservation = result.allocations[0].reservation;
  const confirmation = confirmReservation(state, reservation.id);
  assert.equal(confirmation.ok, true);
  reservation.expiresAt = new Date(Date.now() - 1000).toISOString();
  assert.equal(expireReservations(state, Date.now()), 1);
  const batch = state.donations.find(d => d.id === "B-180");
  assert.equal(confirmation.assignment.status, "cancelled");
  assert.equal(reservation.status, "expired");
  assert.equal(batch.available, 180);
  assert.equal(batch.reserved, 0);
  assert.equal(batch.picked, 0);
  assert.equal(expireReservations(state, Date.now()), 0);
});


test("shelter closure after pickup preserves cargo and requires reroute or escalation", () => {
  const state = createSeedState();
  runScenario(state, "closure");
  const site = state.shelters.find(s => s.id === "S-A");
  const assignment = state.assignments[0];
  const batch = state.donations.find(d => d.id === "B-180");
  assert.equal(site.status, "closed");
  assert.ok(["reroute_required", "escalated"].includes(assignment.status));
  assert.equal(batch.picked, 40);
  assert.equal(batch.available + batch.reserved + batch.picked + batch.delivered + batch.rejected, batch.original);
});


test("unclaimed stock is quarantined after its safe-use deadline", () => {
  const state = createSeedState();
  const batch = state.donations.find(d => d.id === "B-180");
  batch.deadline = new Date(Date.now() - 1000).toISOString();
  assert.equal(expireAidBatches(state, Date.now()), 180);
  assert.equal(batch.available, 0);
  assert.equal(batch.rejected, 180);
  assert.equal(state.spoiledTotal, 180);
  assert.equal(expireAidBatches(state, Date.now()), 0);
});

test("cargo that misses its safe-use deadline is failed but stays in picked inventory until disposition", () => {
  const state = createSeedState();
  const plan = allocateAcrossRiders(state, { donationId: "B-180", quantity: 40, travelMinutes: 10, safetyBufferMinutes: 10 });
  const reservation = plan.allocations[0].reservation;
  const confirmed = confirmReservation(state, reservation.id);
  const assignment = confirmed.assignment;
  assert.equal(transitionAssignment(state, assignment.id, "picked_up").ok, true);
  assert.equal(transitionAssignment(state, assignment.id, "in_transit").ok, true);
  const batch = state.donations.find(d => d.id === "B-180");
  batch.deadline = new Date(Date.now() - 1000).toISOString();
  expireAidBatches(state, Date.now());
  assert.equal(assignment.status, "failed");
  assert.equal(batch.picked, 40);
  assert.equal(disposeFailedCargo(state, assignment.id, "spoiled").ok, true);
  assert.equal(batch.picked, 0);
  assert.equal(batch.rejected, 180);
  assert.equal(state.spoiledTotal, 180);
});
