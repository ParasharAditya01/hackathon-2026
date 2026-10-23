export const SAFETY_BUFFER_MINUTES = 10;
export const RESERVATION_TTL_MINUTES = 5;

export function minutesUntil(iso, now = Date.now()) {
  return Math.floor((new Date(iso).getTime() - now) / 60000);
}

export function canDeliver({ batch, rider, shelter, quantity, etaMinutes, now = Date.now() }) {
  const reasons = [];
  if (!batch || batch.status !== "available") reasons.push("Batch is not available");
  if (!rider || rider.status !== "available") reasons.push("Rider is not available");
  if (!shelter || shelter.status !== "open") reasons.push("Receiving site is not open");
  if (!Number.isFinite(quantity) || quantity <= 0) reasons.push("Quantity must be positive");
  if (batch && quantity > batch.remaining) reasons.push("Quantity exceeds batch remainder");
  if (rider && quantity > rider.capacity) reasons.push("Quantity exceeds rider capacity");
  if (shelter && quantity > (shelter.demand[batch?.type] || 0)) reasons.push("Quantity exceeds open demand");
  if (batch && minutesUntil(batch.deadline, now) < etaMinutes + SAFETY_BUFFER_MINUTES) reasons.push("Arrival would violate expiry safety buffer");
  if (shelter && batch && batch.requires?.some((resource) => !shelter.resources.includes(resource))) reasons.push("Shelter lacks required resources");
  return { ok: reasons.length === 0, reasons };
}

export function allocateBatch(batch, riders, shelters, etaMinutes = 15, now = Date.now()) {
  let remaining = batch.remaining;
  const assignments = [];
  const rejected = [];
  const usedRiders = new Set();
  for (const shelter of shelters.filter((s) => s.status === "open")) {
    if (remaining <= 0) break;
    const demand = shelter.demand[batch.type] || 0;
    if (!demand) continue;
    let allocatedToShelter = 0;
    for (const rider of riders.filter((r) => r.status === "available" && !usedRiders.has(r.id))) {
      if (remaining <= 0 || allocatedToShelter >= demand) break;
      const quantity = Math.min(remaining, rider.capacity, demand - allocatedToShelter);
      if (quantity <= 0) continue;
      const check = canDeliver({ batch, rider, shelter, quantity, etaMinutes, now });
      if (!check.ok) {
        rejected.push({ riderId: rider.id, shelterId: shelter.id, reasons: check.reasons });
        continue;
      }
      assignments.push({
        id: `ASN-${now.toString(36)}-${assignments.length}`,
        batchId: batch.id, riderId: rider.id, shelterId: shelter.id,
        quantity, etaMinutes, state: "reserved",
        expiresAt: new Date(now + RESERVATION_TTL_MINUTES * 60000).toISOString()
      });
      usedRiders.add(rider.id);
      remaining -= quantity;
      allocatedToShelter += quantity;
    }
  }
  return { assignments, remaining, rejected };
}

export function releaseExpiredReservations(assignments, now = Date.now()) {
  return assignments.map((assignment) =>
    assignment.state === "reserved" && new Date(assignment.expiresAt).getTime() <= now
      ? { ...assignment, state: "released", reason: "Reservation timed out; capacity released" }
      : assignment
  );
}

export function rerouteAssignment(assignment, shelters, batch, etaMinutes = 12, now = Date.now()) {
  if (!batch) return { ...assignment, state: "escalated", reason: "Batch record missing; coordinator review required" };
  for (const shelter of shelters.filter((s) => s.id !== assignment.shelterId && s.status === "open")) {
    const check = canDeliver({
      batch: { ...batch, status: "available", remaining: assignment.quantity },
      rider: { status: "available", capacity: assignment.quantity },
      shelter, quantity: assignment.quantity, etaMinutes, now
    });
    if (check.ok) return { ...assignment, shelterId: shelter.id, etaMinutes, state: "in_transit", reason: "Rerouted after original site demand changed" };
  }
  return { ...assignment, state: "escalated", reason: "No safe compatible destination with sufficient demand" };
}
