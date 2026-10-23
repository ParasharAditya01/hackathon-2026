export const RESERVATION_TTL_MS = 5 * 60 * 1000;
export const SAFETY_BUFFER_MINUTES = 10;

const iso = (minutesFromNow) => new Date(Date.now() + minutesFromNow * 60_000).toISOString();
const id = (prefix) => prefix + "-" + Math.random().toString(36).slice(2, 7).toUpperCase();

export function createSeedState() {
  return {
    donations: [
      { id: "B-180", donor: "Cedar Banquet Kitchen", name: "Prepared dinner meals", type: "prepared", original: 180, available: 180, reserved: 0, picked: 0, delivered: 0, rejected: 0, pickupAt: iso(-5), deadline: iso(75), location: "Cedar Banquet Kitchen", handling: "Sealed containers; keep upright" },
      { id: "B-090", donor: "North Market Co-op", name: "Fresh produce crates", type: "perishable", original: 90, available: 90, reserved: 0, picked: 0, delivered: 0, rejected: 0, pickupAt: iso(-5), deadline: iso(45), location: "North Market loading bay", handling: "Keep chilled" },
      { id: "B-120", donor: "Community Pantry", name: "Raw ration kits", type: "raw", original: 120, available: 120, reserved: 0, picked: 0, delivered: 0, rejected: 0, pickupAt: iso(-5), deadline: iso(360), location: "Community Pantry", handling: "Requires clean water and cooking fuel" },
      { id: "B-MED", donor: "City Pharmacy", name: "Short-life medical supplies", type: "medical", original: 24, available: 24, reserved: 0, picked: 0, delivered: 0, rejected: 0, pickupAt: iso(-5), deadline: iso(90), location: "City Pharmacy", handling: "Cold-chain handling required" },
      { id: "B-INF", donor: "Family Health Depot", name: "Infant formula kits", type: "infant_formula", original: 40, available: 40, reserved: 0, picked: 0, delivered: 0, rejected: 0, pickupAt: iso(-5), deadline: iso(120), location: "Family Health Depot", handling: "Requires clean water and cooking fuel" },
      { id: "B-KIT", donor: "Civic Relief Store", name: "Emergency essential kits", type: "essential", original: 60, available: 60, reserved: 0, picked: 0, delivered: 0, rejected: 0, pickupAt: iso(-5), deadline: iso(480), location: "Civic Relief Store", handling: "Keep dry" }
    ],
    riders: [
      { id: "R-01", name: "Asha N.", capacity: 40, transport: "Scooter", zone: "Central", status: "available", lastSeenAt: new Date().toISOString() },
      { id: "R-02", name: "Rahul P.", capacity: 40, transport: "Scooter", zone: "North", status: "available", lastSeenAt: new Date().toISOString() },
      { id: "R-03", name: "Meera S.", capacity: 40, transport: "Scooter", zone: "Central", status: "available", lastSeenAt: new Date().toISOString() },
      { id: "R-04", name: "Kabir D.", capacity: 40, transport: "Car", zone: "East", status: "available", lastSeenAt: new Date().toISOString() },
      { id: "R-05", name: "Nisha K.", capacity: 40, transport: "Scooter", zone: "North", status: "available", lastSeenAt: new Date().toISOString() },
      { id: "R-06", name: "Dev R.", capacity: 40, transport: "Cycle", zone: "East", status: "available", lastSeenAt: new Date().toISOString() }
    ],
    shelters: [
      { id: "S-A", name: "Shelter A", zone: "Central", demand: 50, delivered: 0, status: "open", water: true, fuel: true, coldStorage: true, medicalStorage: true, accepts: ["prepared", "perishable", "raw", "medical", "infant_formula", "essential"] },
      { id: "S-B", name: "Riverside Night Shelter", zone: "North", demand: 120, delivered: 0, status: "open", water: true, fuel: true, coldStorage: true, medicalStorage: true, accepts: ["prepared", "perishable", "raw", "medical", "infant_formula", "essential"] },
      { id: "S-C", name: "Sunrise Relief Camp", zone: "East", demand: 75, delivered: 0, status: "limited", water: false, fuel: false, coldStorage: false, medicalStorage: false, accepts: ["prepared", "perishable", "essential"] },
      { id: "S-D", name: "Central Community Kitchen", zone: "Central", demand: 180, delivered: 0, status: "open", water: true, fuel: true, coldStorage: true, medicalStorage: true, accepts: ["prepared", "perishable", "raw", "medical", "infant_formula", "essential"] }
    ],
    reservations: [],
    assignments: [],
    alerts: [],
    audit: [{ id: "EV-INIT", at: new Date().toISOString(), level: "info", action: "Simulation initialized", detail: "Synthetic aid, rider and shelter records loaded." }],
    scenarioLog: [],
    deliveredTotal: 0,
    spoiledTotal: 0,
    rejectedTotal: 0
  };
}

export const aidTypeLabel = (type) => ({
  prepared: "Prepared food",
  perishable: "Perishable food",
  raw: "Raw ration kit",
  medical: "Medical supplies",
  infant_formula: "Infant formula",
  essential: "Essential kit"
}[type] || type);

export const remainingMinutes = (deadline, now = Date.now()) => Math.floor((new Date(deadline).getTime() - now) / 60_000);
export const isActiveAssignment = (a) => ["accepted", "picked_up", "in_transit", "reroute_required", "escalated"].includes(a.status);
export const usedCapacity = (state, riderId, excludeReservationId = null) =>
  state.assignments.filter(a => a.riderId === riderId && isActiveAssignment(a)).reduce((sum, a) => sum + a.quantity, 0) +
  state.reservations.filter(r => r.riderId === riderId && r.status === "pending" && r.id !== excludeReservationId).reduce((sum, r) => sum + r.quantity, 0);

export const shelterRemaining = (state, shelterId, excludeReservationId = null) => {
  const s = state.shelters.find(x => x.id === shelterId);
  if (!s) return 0;
  const committedAssignments = state.assignments.filter(a => a.shelterId === shelterId && isActiveAssignment(a)).reduce((sum, a) => sum + a.quantity, 0);
  const pending = state.reservations.filter(r => r.shelterId === shelterId && r.status === "pending" && r.id !== excludeReservationId).reduce((sum, r) => sum + r.quantity, 0);
  return Math.max(0, s.demand - s.delivered - committedAssignments - pending);
};

export function validateFeasibility(state, { donationId, riderId, shelterId, quantity, travelMinutes = 20, safetyBufferMinutes = SAFETY_BUFFER_MINUTES, now = Date.now(), excludeReservationId = null }) {
  const d = state.donations.find(x => x.id === donationId);
  const r = state.riders.find(x => x.id === riderId);
  const s = state.shelters.find(x => x.id === shelterId);
  const reasons = [];
  if (!Number.isInteger(quantity) || quantity <= 0) reasons.push("Quantity must be a positive whole number.");
  if (!d) reasons.push("Aid batch does not exist.");
  else {
    const held = excludeReservationId ? (state.reservations.find(x => x.id === excludeReservationId)?.quantity || 0) : 0;
    if (d.available + held < quantity) reasons.push("Insufficient unreserved batch quantity.");
    if (remainingMinutes(d.deadline, now) <= travelMinutes + safetyBufferMinutes) reasons.push("Arrival plus safety buffer misses the safe-use deadline.");
    if (new Date(d.pickupAt).getTime() > now) reasons.push("Pickup window has not opened.");
  }
  if (!r || r.status !== "available") reasons.push("Rider is unavailable.");
  else if (usedCapacity(state, r.id, excludeReservationId) + quantity > r.capacity) reasons.push("Rider capacity would be exceeded.");
  if (!s || !["open", "limited"].includes(s.status)) reasons.push("Receiving site is closed.");
  if (s && shelterRemaining(state, s.id, excludeReservationId) < quantity) reasons.push("Receiving site has insufficient uncommitted demand.");
  if (d && s && !s.accepts.includes(d.type)) reasons.push("Receiving site does not accept this aid type.");
  if (d && s && ["raw", "infant_formula"].includes(d.type) && (!s.water || !s.fuel)) reasons.push("This aid type requires recorded clean water and cooking fuel at the destination.");
  if (d && s && ["perishable", "medical"].includes(d.type) && !s.coldStorage) reasons.push("This aid type requires recorded cold-chain storage at the destination.");
  if (d && s && d.type === "medical" && !s.medicalStorage) reasons.push("Medical supplies require an appropriate recorded storage area.");
  return reasons;
}

export function addEvent(state, action, detail, level = "info", now = Date.now()) {
  state.audit.unshift({ id: id("EV"), at: new Date(now).toISOString(), level, action, detail });
  state.audit = state.audit.slice(0, 250);
}

export function addAlert(state, title, detail, level = "warning", now = Date.now()) {
  const existing = state.alerts.find(a => a.title === title && a.detail === detail && a.status === "open");
  if (existing) return existing;
  const alert = { id: id("AL"), at: new Date(now).toISOString(), title, detail, level, status: "open" };
  state.alerts.unshift(alert);
  addEvent(state, "Alert raised", title + ": " + detail, level, now);
  return alert;
}

export function expireReservations(state, now = Date.now()) {
  let count = 0;
  state.reservations.forEach(res => {
    if (res.status !== "pending" || new Date(res.expiresAt).getTime() > now) return;
    res.status = "expired";
    const d = state.donations.find(x => x.id === res.donationId);
    if (d) {
      d.reserved = Math.max(0, d.reserved - res.quantity);
      d.available += res.quantity;
    }
    addEvent(state, "Reservation expired", res.id + " timed out; " + res.quantity + " units released exactly once.", "warning", now);
    addAlert(state, "Ghost reservation released", res.id + " expired without confirmation; eligible stock and capacity are available again.", "warning", now);
    count += 1;
  });
  return count;
}

export function createReservation(state, request, now = Date.now()) {
  const errors = validateFeasibility(state, { ...request, now });
  if (errors.length) return { ok: false, errors };
  const d = state.donations.find(x => x.id === request.donationId);
  const res = {
    id: id("RS"),
    donationId: d.id,
    riderId: request.riderId,
    shelterId: request.shelterId,
    quantity: request.quantity,
    travelMinutes: request.travelMinutes ?? 20,
    safetyBufferMinutes: request.safetyBufferMinutes ?? SAFETY_BUFFER_MINUTES,
    status: "pending",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RESERVATION_TTL_MS).toISOString(),
    assignmentId: null
  };
  d.available -= res.quantity;
  d.reserved += res.quantity;
  state.reservations.unshift(res);
  addEvent(state, "Reservation created", res.id + " holds " + res.quantity + " units for five minutes.", "info", now);
  return { ok: true, reservation: res };
}

export function allocateAcrossRiders(state, { donationId, quantity, travelMinutes = 20, safetyBufferMinutes = SAFETY_BUFFER_MINUTES }, now = Date.now()) {
  const d = state.donations.find(x => x.id === donationId);
  if (!d) return { allocations: [], unallocated: quantity, errors: ["Choose an existing aid batch."] };
  if (!Number.isInteger(quantity) || quantity <= 0) return { allocations: [], unallocated: quantity, errors: ["Quantity must be a positive whole number."] };
  const target = Math.min(quantity, d.available);
  let left = target;
  const allocations = [];
  const failures = [];
  const riders = state.riders.filter(r => r.status === "available").sort((a, b) => (a.capacity - usedCapacity(state, a.id)) - (b.capacity - usedCapacity(state, b.id)));
  for (const r of riders) {
    if (left <= 0) break;
    const free = Math.max(0, r.capacity - usedCapacity(state, r.id));
    if (!free) continue;
    const sites = state.shelters.filter(s => ["open", "limited"].includes(s.status) && s.accepts.includes(d.type))
      .sort((a, b) => shelterRemaining(state, b.id) - shelterRemaining(state, a.id));
    for (const s of sites) {
      const chunk = Math.min(left, free, shelterRemaining(state, s.id));
      if (chunk <= 0) continue;
      const request = { donationId, riderId: r.id, shelterId: s.id, quantity: chunk, travelMinutes, safetyBufferMinutes };
      const errors = validateFeasibility(state, { ...request, now });
      if (errors.length) { failures.push(...errors); continue; }
      const created = createReservation(state, request, now);
      if (created.ok) {
        allocations.push({ reservation: created.reservation, rider: r, shelter: s, quantity: chunk });
        left -= chunk;
        break;
      }
    }
  }
  return { allocations, unallocated: quantity - allocations.reduce((sum, a) => sum + a.quantity, 0), errors: [...new Set(failures)] };
}

export function confirmReservation(state, reservationId, now = Date.now()) {
  const res = state.reservations.find(x => x.id === reservationId);
  if (!res || res.status !== "pending") return { ok: false, errors: ["Reservation is not pending."] };
  if (new Date(res.expiresAt).getTime() <= now) {
    expireReservations(state, now);
    return { ok: false, errors: ["Reservation expired; stock was released."] };
  }
  const errors = validateFeasibility(state, {
    donationId: res.donationId, riderId: res.riderId, shelterId: res.shelterId,
    quantity: res.quantity, travelMinutes: res.travelMinutes, safetyBufferMinutes: res.safetyBufferMinutes,
    excludeReservationId: res.id, now
  });
  if (errors.length) return { ok: false, errors };
  const d = state.donations.find(x => x.id === res.donationId);
  const a = {
    id: id("AS"), donationId: res.donationId, riderId: res.riderId, shelterId: res.shelterId,
    quantity: res.quantity, status: "accepted", createdAt: new Date(now).toISOString(),
    deadline: d.deadline, travelMinutes: res.travelMinutes, safetyBufferMinutes: res.safetyBufferMinutes,
    history: ["Reservation confirmed"]
  };
  res.status = "confirmed";
  res.assignmentId = a.id;
  state.assignments.unshift(a);
  addEvent(state, "Reservation confirmed", res.id + " became assignment " + a.id + ".", "info", now);
  return { ok: true, assignment: a };
}

const transitions = {
  accepted: ["picked_up", "cancelled"],
  picked_up: ["in_transit", "reroute_required", "failed"],
  in_transit: ["delivered", "reroute_required", "failed"],
  reroute_required: ["in_transit", "escalated"],
  escalated: ["reroute_required", "failed"],
  failed: [],
  delivered: [],
  cancelled: []
};

export function transitionAssignment(state, assignmentId, next, now = Date.now()) {
  const a = state.assignments.find(x => x.id === assignmentId);
  if (!a || !transitions[a.status]?.includes(next)) return { ok: false, errors: ["That assignment transition is not allowed."] };
  const d = state.donations.find(x => x.id === a.donationId);
  const s = state.shelters.find(x => x.id === a.shelterId);
  const res = state.reservations.find(x => x.assignmentId === a.id);
  if (next === "picked_up") {
    if (!d || !res || res.status !== "confirmed" || d.reserved < a.quantity) return { ok: false, errors: ["Pickup blocked: confirmed reserved inventory could not be reconciled."] };
    const rider = state.riders.find(x => x.id === a.riderId);
    const otherRiderLoad = state.assignments.filter(x => x.riderId === a.riderId && x.id !== a.id && isActiveAssignment(x)).reduce((sum, x) => sum + x.quantity, 0) + state.reservations.filter(x => x.riderId === a.riderId && x.status === "pending").reduce((sum, x) => sum + x.quantity, 0);
    const otherSiteCommitments = state.assignments.filter(x => x.shelterId === s?.id && x.id !== a.id && isActiveAssignment(x)).reduce((sum, x) => sum + x.quantity, 0) + state.reservations.filter(x => x.shelterId === s?.id && x.status === "pending").reduce((sum, x) => sum + x.quantity, 0);
    const errors = [];
    if (!rider || rider.status !== "available" || otherRiderLoad + a.quantity > (rider?.capacity || 0)) errors.push("Rider availability or capacity changed.");
    if (!s || !["open", "limited"].includes(s.status)) errors.push("Receiving site is closed.");
    if (s && s.demand - s.delivered - otherSiteCommitments < a.quantity) errors.push("Receiving site demand has changed.");
    if (d && remainingMinutes(d.deadline, now) <= a.travelMinutes + a.safetyBufferMinutes) errors.push("Pickup is no longer feasible before the safe-use deadline.");
    if (d && s && !s.accepts.includes(d.type)) errors.push("Receiving site no longer accepts this aid type.");
    if (d && s && ["raw", "infant_formula"].includes(d.type) && (!s.water || !s.fuel)) errors.push("Clean water and cooking fuel are required.");
    if (d && s && ["perishable", "medical"].includes(d.type) && !s.coldStorage) errors.push("Cold storage is required.");
    if (d && s && d.type === "medical" && !s.medicalStorage) errors.push("Medical storage is required.");
    if (errors.length) return { ok: false, errors };
    d.reserved -= a.quantity;
    d.picked += a.quantity;
    res.status = "picked_up";
  }
  if (next === "cancelled") {
    if (a.status !== "accepted" || !d || !res || res.status !== "confirmed") return { ok: false, errors: ["Collected cargo cannot be cancelled back into available stock."] };
    d.reserved = Math.max(0, d.reserved - a.quantity);
    d.available += a.quantity;
    res.status = "cancelled";
  }
  if (next === "delivered") {
    if (!d || !s || s.status === "closed") return { ok: false, errors: ["Destination is closed or missing; route to recovery instead."] };
    if (remainingMinutes(a.deadline, now) < 0) return { ok: false, errors: ["Safe-use deadline has passed; delivery cannot be marked safe."] };
    const incompatibility = [];
    if (!s.accepts.includes(d.type)) incompatibility.push("site does not accept this aid type");
    if (["raw", "infant_formula"].includes(d.type) && (!s.water || !s.fuel)) incompatibility.push("clean water and cooking fuel are missing");
    if (["perishable", "medical"].includes(d.type) && !s.coldStorage) incompatibility.push("cold storage is missing");
    if (d.type === "medical" && !s.medicalStorage) incompatibility.push("medical storage is missing");
    if (s.demand - s.delivered < a.quantity) incompatibility.push("destination demand has been filled");
    if (incompatibility.length) return { ok: false, errors: ["Delivery blocked: " + incompatibility.join("; ") + "."] };
    d.picked = Math.max(0, d.picked - a.quantity);
    d.delivered += a.quantity;
    s.delivered += a.quantity;
    state.deliveredTotal += a.quantity;
    a.completedAt = new Date(now).toISOString();
    if (res) res.status = "delivered";
  }
  if (next === "failed") {
    if (a.status === "picked_up" || a.status === "in_transit" || a.status === "reroute_required") {
      addAlert(state, "Cargo needs disposition", a.id + " failed while carrying " + a.quantity + " units. Do not return it to available inventory.", "critical", now);
    }
    const r = state.riders.find(x => x.id === a.riderId);
    if (r) r.status = "unavailable";
  }
  a.status = next;
  a.history.push(next);
  addEvent(state, "Assignment state changed", a.id + " → " + next, "info", now);
  return { ok: true, assignment: a };
}

export function closeShelterAndRecover(state, assignmentId, now = Date.now()) {
  const a = state.assignments.find(x => x.id === assignmentId);
  if (!a || !["picked_up", "in_transit", "reroute_required"].includes(a.status)) return { ok: false, errors: ["No cargo-bearing assignment is available for recovery."] };
  const closed = state.shelters.find(x => x.id === a.shelterId);
  if (closed) closed.status = "closed";
  a.status = "reroute_required";
  a.history.push("reroute_required");
  addAlert(state, "Destination demand changed", (closed?.name || "Destination") + " closed while " + a.id + " carried cargo. Cargo remains in custody.", "critical", now);
  addEvent(state, "Recovery required", a.id + " preserved cargo and entered reroute review.", "warning", now);
  return { ok: true, alternatives: findRerouteOptions(state, a, now) };
}

export function findRerouteOptions(state, assignment, now = Date.now()) {
  const d = state.donations.find(x => x.id === assignment.donationId);
  if (!d) return [];
  return state.shelters.filter(s => s.id !== assignment.shelterId && ["open", "limited"].includes(s.status) &&
    s.accepts.includes(d.type) && shelterRemaining(state, s.id) >= assignment.quantity &&
    (!["raw", "infant_formula"].includes(d.type) || (s.water && s.fuel)) &&
    (!["perishable", "medical"].includes(d.type) || s.coldStorage) &&
    (d.type !== "medical" || s.medicalStorage) &&
    remainingMinutes(assignment.deadline, now) > assignment.travelMinutes + assignment.safetyBufferMinutes);
}

export function approveReroute(state, assignmentId, shelterId, now = Date.now()) {
  const a = state.assignments.find(x => x.id === assignmentId);
  if (!a || a.status !== "reroute_required") return { ok: false, errors: ["Assignment is not awaiting reroute."] };
  const target = findRerouteOptions(state, a, now).find(s => s.id === shelterId);
  if (!target) return { ok: false, errors: ["Selected destination is not feasible."] };
  const previous = a.shelterId;
  a.shelterId = target.id;
  a.status = "in_transit";
  a.history.push("rerouted_to:" + target.id);
  addEvent(state, "Reroute approved", a.id + " redirected from " + previous + " to " + target.id + ".", "warning", now);
  return { ok: true, assignment: a, shelter: target };
}

export function simulateDirectDrop(state, assignmentId, quantity, now = Date.now()) {
  const a = state.assignments.find(x => x.id === assignmentId);
  if (!a || !["picked_up", "in_transit"].includes(a.status)) return { ok: false, errors: ["No active in-transit assignment found."] };
  const s = state.shelters.find(x => x.id === a.shelterId);
  if (!s) return { ok: false, errors: ["Receiving site does not exist."] };
  const direct = Math.min(Math.max(0, quantity), Math.max(0, s.demand - s.delivered));
  s.delivered += direct;
  state.deliveredTotal += direct;
  if (s.delivered >= s.demand) s.status = "limited";
  addEvent(state, "Direct community drop-off", direct + " units fulfilled demand at " + s.name + " while " + a.id + " was in transit.", "warning", now);
  a.status = "reroute_required";
  a.history.push("destination_demand_filled");
  addAlert(state, "Incoming cargo needs a new destination", s.name + " received direct aid while " + a.id + " was en route. The cargo remains picked and must be rerouted or escalated.", "critical", now);
  return { ok: true, directDelivered: direct, alternatives: findRerouteOptions(state, a, now) };
}

export function runScenario(state, scenarioKey, now = Date.now()) {
  const lines = [];
  if (scenarioKey === "expiry") {
    const d = state.donations.filter(x => x.available > 0).sort((a, b) => new Date(a.deadline) - new Date(b.deadline))[0];
    if (d) lines.push(d.name + " is highest priority with " + Math.max(0, remainingMinutes(d.deadline, now)) + " minutes left.");
    lines.push("The engine still requires travel time plus the safety buffer; urgency never overrides feasibility.");
  } else if (scenarioKey === "split") {
    const d = state.donations.find(x => x.id === "B-180") || state.donations.find(x => x.available >= 180);
    if (!d) lines.push("No batch has 180 available units. Reset the demo to restore the split-delivery case.");
    else {
      const result = allocateAcrossRiders(state, { donationId: d.id, quantity: 180, travelMinutes: 15, safetyBufferMinutes: 10 }, now);
      lines.push("Target: 180 meals; each scooter rider is limited to 40.");
      lines.push(...result.allocations.map(x => x.rider.name + " → " + x.shelter.name + ": " + x.quantity + " units held."));
      lines.push("Reserved " + result.allocations.reduce((sum, x) => sum + x.quantity, 0) + "/180; unallocated " + result.unallocated + ".");
      if (result.unallocated > 0) lines.push("Partial plan: review capacity, demand, or the safe-use window; no constraint was bypassed.");
    }
  } else if (scenarioKey === "ghost") {
    const d = state.donations.find(x => x.available >= 10);
    const r = state.riders.find(x => x.status === "available");
    const s = state.shelters.find(x => x.status === "open" && x.accepts.includes(d?.type));
    const result = d && r && s ? createReservation(state, { donationId: d.id, riderId: r.id, shelterId: s.id, quantity: 10, travelMinutes: 10, safetyBufferMinutes: 10 }, now) : { ok: false };
    if (result.ok) {
      result.reservation.createdAt = new Date(now - 30 * 60_000).toISOString();
      result.reservation.expiresAt = new Date(now - 25 * 60_000).toISOString();
      expireReservations(state, now);
      lines.push("Volunteer went unresponsive for 30 minutes. The five-minute reservation expired and released 10 units exactly once.");
    } else lines.push("No eligible reservation could be created; no stock was changed.");
  } else if (scenarioKey === "direct-drop") {
    const d = state.donations.find(x => x.id === "B-180");
    const r = state.riders.find(x => x.status === "available" && x.capacity >= 40);
    const s = state.shelters.find(x => x.id === "S-A");
    if (d && r && s) {
      const created = createReservation(state, { donationId: d.id, riderId: r.id, shelterId: s.id, quantity: 40, travelMinutes: 10, safetyBufferMinutes: 10 }, now);
      const confirmed = created.ok && confirmReservation(state, created.reservation.id, now);
      const assignment = confirmed?.ok ? confirmed.assignment : null;
      const pickup = assignment && transitionAssignment(state, assignment.id, "picked_up", now);
      const transit = pickup?.ok && transitionAssignment(state, assignment.id, "in_transit", now);
      if (transit?.ok) {
        const direct = simulateDirectDrop(state, assignment.id, s.demand - s.delivered, now);
        lines.push("Rider carries 40 meals toward Shelter A; a direct community drop-off fills its remaining demand.");
        lines.push("Shelter A's remaining demand is now " + shelterRemaining(state, s.id) + ". Incoming cargo is held for recovery, not marked delivered.");
        lines.push("Safe alternate destinations: " + (direct.alternatives.map(x => x.name).join(", ") || "none; assignment must be escalated") + ".");
      } else lines.push("Could not create a feasible in-transit assignment: " + (created.errors || confirmed?.errors || pickup?.errors || []).join(" "));
    } else lines.push("Seed data is missing the split-case batch, rider, or Shelter A.");
  } else if (scenarioKey === "resources") {
    const d = state.donations.find(x => x.type === "raw" && x.available > 0);
    const s = state.shelters.find(x => !x.water || !x.fuel);
    const r = state.riders.find(x => x.status === "available");
    if (d && s && r) {
      const errors = validateFeasibility(state, { donationId: d.id, riderId: r.id, shelterId: s.id, quantity: 1, travelMinutes: 10, safetyBufferMinutes: 10, now });
      lines.push("Raw ration kits cannot be sent to " + s.name + " without recorded clean water and cooking fuel.");
      lines.push("Decision: " + (errors.length ? "BLOCKED — " + errors.join(" ") : "eligible under current records."));
    }
  }
  state.scenarioLog.unshift({ id: id("SC"), title: ({ expiry: "Urgent expiry", split: "180-unit split delivery", ghost: "Ghost reservation", "direct-drop": "Shelter demand filled in transit", resources: "Missing cooking resources" })[scenarioKey] || scenarioKey, at: new Date(now).toISOString(), lines });
  addEvent(state, "Scenario executed", scenarioKey, "info", now);
  return lines;
}
