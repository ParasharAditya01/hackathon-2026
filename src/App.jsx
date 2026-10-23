import { useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowRight, Bike, Boxes, CheckCircle2, Clock3,
  HandHeart, LayoutDashboard, MapPinned, PackageCheck, Plus, RotateCcw,
  ShieldCheck, Truck, Warehouse, XCircle, Zap, ClipboardList, HeartPulse
} from "lucide-react";
import {
  addAlert, addEvent, aidTypeLabel, allocateAcrossRiders, approveReroute,
  confirmReservation, createSeedState, expireReservations, findRerouteOptions,
  remainingMinutes, runScenario, shelterRemaining, transitionAssignment
} from "./lib/dispatch.js";

const STORAGE_KEY = "aidflow-operational-prototype-v1";
const navItems = [
  ["Overview", LayoutDashboard], ["Aid batches", Boxes], ["Dispatch board", MapPinned],
  ["Riders", Bike], ["Receiving sites", Warehouse], ["Reservations", Clock3],
  ["Alerts & audit", Activity], ["Resilience lab", Zap]
];
const shortTime = (value) => new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const dateTimeLocal = (offsetMinutes = 0) => {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};
const typeClass = (type) => "type-" + type;
const statusLabel = (status) => ({
  available: "Available", unavailable: "Unavailable", open: "Open", limited: "Limited",
  closed: "Closed", pending: "Pending", confirmed: "Confirmed", expired: "Expired",
  accepted: "Accepted", picked_up: "Picked up", in_transit: "In transit",
  reroute_required: "Reroute required", escalated: "Escalated", delivered: "Delivered",
  cancelled: "Cancelled", failed: "Failed", spoiled: "Spoiled", rejected: "Rejected"
}[status] || status.replaceAll("_", " "));
const formatNumber = (value) => Number(value || 0).toLocaleString("en-IN");
const clone = (value) => structuredClone(value);

function loadInitialState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && Array.isArray(saved.donations) && Array.isArray(saved.assignments) && Array.isArray(saved.shelters)) return saved;
  } catch {}
  return createSeedState();
}

function Badge({ children, tone = "neutral" }) {
  return <span className={"badge badge-" + tone}>{children}</span>;
}
function MetricCard({ label, value, detail, icon: Icon, tone }) {
  return <article className="metric-card">
    <div className="metric-topline"><span>{label}</span><span className={"metric-icon tone-" + tone}><Icon size={17} /></span></div>
    <div className="metric-value">{value}</div><p className="metric-detail">{detail}</p>
  </article>;
}
function EmptyState({ title, detail }) {
  return <div className="empty-board"><div className="empty-icon"><PackageCheck size={23} /></div><h3>{title}</h3><p>{detail}</p></div>;
}
function PanelHeading({ eyebrow, title, detail, action }) {
  return <div className="section-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</div>;
}
function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
function QuantityBar({ value, total }) {
  const pct = total > 0 ? Math.min(100, Math.round(value / total * 100)) : 0;
  return <div className="quantity-bar" aria-label={pct + "% used"}><span style={{ width: pct + "%" }} /></div>;
}

export default function App() {
  const [data, setData] = useState(loadInitialState);
  const [page, setPage] = useState("Overview");
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState("");
  const [search, setSearch] = useState("");
  const [allocation, setAllocation] = useState({ donationId: "B-180", quantity: 180, travelMinutes: 15, safetyBufferMinutes: 10 });
  const [allocationResult, setAllocationResult] = useState(null);
  const [batchForm, setBatchForm] = useState({ donor: "", name: "", type: "prepared", quantity: 40, pickupAt: dateTimeLocal(-2), deadline: dateTimeLocal(75), location: "", handling: "" });
  const [riderForm, setRiderForm] = useState({ name: "", capacity: 40, transport: "Scooter", zone: "Central" });
  const [shelterForm, setShelterForm] = useState({ name: "", zone: "Central", demand: 50, water: false, fuel: false, coldStorage: false, medicalStorage: false });
  const [rerouteChoice, setRerouteChoice] = useState({});
  const [filter, setFilter] = useState("all");

  const mutate = (operation, successMessage) => {
    let outcome;
    setData(previous => {
      const next = clone(previous);
      outcome = operation(next);
      return next;
    });
    if (successMessage) showToast(successMessage);
    return outcome;
  };
  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 3200);
  };

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* storage is optional in this demo */ }
  }, [data]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setData(previous => {
        if (!previous.reservations.some(r => r.status === "pending" && new Date(r.expiresAt).getTime() <= tick)) return previous;
        const next = clone(previous);
        expireReservations(next, tick);
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const pendingReservations = data.reservations.filter(r => r.status === "pending");
  const activeAssignments = data.assignments.filter(a => ["accepted", "picked_up", "in_transit", "reroute_required", "escalated"].includes(a.status));
  const atRisk = data.donations.filter(d => d.available > 0 && remainingMinutes(d.deadline, now) <= 60 && remainingMinutes(d.deadline, now) > 0);
  const totalAvailable = data.donations.reduce((sum, d) => sum + d.available, 0);
  const totalReserved = data.donations.reduce((sum, d) => sum + d.reserved, 0);
  const deliveredCount = data.assignments.filter(a => a.status === "delivered").length;
  const filteredDonations = useMemo(() => data.donations.filter(d => (d.name + " " + d.donor + " " + d.id + " " + d.type).toLowerCase().includes(search.toLowerCase())), [data.donations, search]);

  const confirm = (id) => mutate(next => {
    const result = confirmReservation(next, id, Date.now());
    if (!result.ok) addAlert(next, "Reservation confirmation blocked", result.errors.join(" "), "critical");
    return result;
  }, "Reservation confirmation checked.");
  const moveAssignment = (id, nextStatus) => {
    const result = mutate(next => {
      const moved = transitionAssignment(next, id, nextStatus, Date.now());
      if (!moved.ok) addAlert(next, "Action blocked by safety rule", moved.errors.join(" "), "critical");
      return moved;
    });
    showToast(result?.ok ? "Assignment updated." : (result?.errors?.[0] || "Action blocked."));
  };
  const resetDemo = () => {
    if (!window.confirm("Reset all browser-local AidFlow records to the original scenario data?")) return;
    setData(createSeedState());
    setAllocationResult(null);
    setRerouteChoice({});
    showToast("Demo reset to seeded scenario data.");
  };
  const submitAllocation = (event) => {
    event.preventDefault();
    const result = mutate(next => allocateAcrossRiders(next, {
      donationId: allocation.donationId,
      quantity: Number(allocation.quantity),
      travelMinutes: Number(allocation.travelMinutes),
      safetyBufferMinutes: Number(allocation.safetyBufferMinutes)
    }, Date.now()));
    setAllocationResult(result);
    if (result?.allocations?.length) setPage("Reservations");
    showToast(result?.allocations?.length ? "Feasible reservations created. Confirm them before pickup." : "No feasible reservation created.");
  };
  const addBatch = (event) => {
    event.preventDefault();
    const quantity = Number(batchForm.quantity);
    const pickupAt = new Date(batchForm.pickupAt);
    const deadline = new Date(batchForm.deadline);
    if (!batchForm.name.trim() || !batchForm.donor.trim() || !batchForm.location.trim() || !Number.isInteger(quantity) || quantity <= 0 || Number.isNaN(pickupAt.getTime()) || Number.isNaN(deadline.getTime()) || deadline <= pickupAt || deadline <= new Date()) {
      showToast("Enter valid batch details and a future safe-use deadline.");
      return;
    }
    mutate(next => {
      const batch = { id: "B-" + Math.random().toString(36).slice(2, 7).toUpperCase(), donor: batchForm.donor.trim(), name: batchForm.name.trim(), type: batchForm.type, original: quantity, available: quantity, reserved: 0, picked: 0, delivered: 0, rejected: 0, pickupAt: pickupAt.toISOString(), deadline: deadline.toISOString(), location: batchForm.location.trim(), handling: batchForm.handling.trim() };
      next.donations.unshift(batch);
      addEvent(next, "Aid batch registered", batch.id + " · " + batch.name + " · " + quantity + " units");
    }, "Aid batch registered.");
    setBatchForm({ donor: "", name: "", type: "prepared", quantity: 40, pickupAt: dateTimeLocal(-2), deadline: dateTimeLocal(75), location: "", handling: "" });
  };
  const addRider = (event) => {
    event.preventDefault();
    if (!riderForm.name.trim() || !riderForm.zone.trim() || Number(riderForm.capacity) <= 0) return showToast("Enter rider name, capacity and zone.");
    mutate(next => {
      next.riders.push({ id: "R-" + Math.random().toString(36).slice(2, 6).toUpperCase(), name: riderForm.name.trim(), capacity: Number(riderForm.capacity), transport: riderForm.transport, zone: riderForm.zone.trim(), status: "available", lastSeenAt: new Date().toISOString() });
      addEvent(next, "Rider added", riderForm.name.trim() + " · capacity " + riderForm.capacity);
    }, "Rider added to fleet.");
    setRiderForm({ name: "", capacity: 40, transport: "Scooter", zone: "Central" });
  };
  const addShelter = (event) => {
    event.preventDefault();
    if (!shelterForm.name.trim() || !shelterForm.zone.trim() || Number(shelterForm.demand) < 0) return showToast("Enter a valid receiving site.");
    mutate(next => {
      next.shelters.push({ id: "S-" + Math.random().toString(36).slice(2, 6).toUpperCase(), name: shelterForm.name.trim(), zone: shelterForm.zone.trim(), demand: Number(shelterForm.demand), delivered: 0, status: "open", water: shelterForm.water, fuel: shelterForm.fuel, coldStorage: shelterForm.coldStorage, medicalStorage: shelterForm.medicalStorage, accepts: ["prepared", "perishable", "raw", "medical", "infant_formula", "essential"] });
      addEvent(next, "Receiving site registered", shelterForm.name.trim() + " · demand " + shelterForm.demand);
    }, "Receiving site registered.");
    setShelterForm({ name: "", zone: "Central", demand: 50, water: false, fuel: false, coldStorage: false, medicalStorage: false });
  };
  const changeSiteStatus = (siteId, status) => mutate(next => {
    const site = next.shelters.find(s => s.id === siteId);
    if (!site) return;
    site.status = status;
    addEvent(next, "Receiving site status changed", site.name + " → " + status, status === "closed" ? "warning" : "info");
    if (status === "closed") {
      next.assignments.filter(a => a.shelterId === siteId && ["picked_up", "in_transit"].includes(a.status)).forEach(a => {
        a.status = "reroute_required";
        a.history.push("reroute_required");
        addAlert(next, "Destination closed during transit", site.name + " closed while " + a.id + " carried cargo. Cargo remains in custody.", "critical");
      });
    }
  }, "Receiving site status updated.");
  const runDemoScenario = (key) => {
    const result = mutate(next => runScenario(next, key, Date.now()));
    setAllocationResult(null);
    if (result?.length) showToast("Scenario complete. Review the recorded outcome below.");
  };
  const openRerouteOptions = (assignment) => findRerouteOptions(data, assignment, now);
  const selectReroute = (assignmentId, shelterId) => {
    const result = mutate(next => {
      const outcome = approveReroute(next, assignmentId, shelterId, Date.now());
      if (!outcome.ok) addAlert(next, "Reroute blocked", outcome.errors.join(" "), "critical");
      return outcome;
    });
    showToast(result?.ok ? "Reroute approved. Cargo remains in transit." : (result?.errors?.[0] || "Reroute blocked."));
  };
  const recordDirectDrop = (siteId, quantity) => mutate(next => {
    const site = next.shelters.find(s => s.id === siteId);
    if (!site) return;
    const amount = Math.min(Number(quantity), Math.max(0, site.demand - site.delivered));
    site.delivered += amount;
    next.deliveredTotal += amount;
    addEvent(next, "Direct community drop-off", amount + " units delivered directly to " + site.name + ".", "warning");
    if (site.delivered >= site.demand) {
      site.status = "limited";
      next.assignments.filter(a => a.shelterId === siteId && ["picked_up", "in_transit"].includes(a.status)).forEach(a => {
        a.status = "reroute_required";
        a.history.push("destination_demand_filled");
        addAlert(next, "Incoming cargo needs a new destination", site.name + " demand filled while " + a.id + " was in transit.", "critical");
      });
    }
  }, "Direct drop-off recorded; affected cargo requires recovery.");

  const renderOverview = () => <div className="page-content">
    <section className="page-heading"><div><p className="eyebrow">CIVIC AID NETWORK <span className="eyebrow-line" /></p><h1>Operations overview</h1><p className="page-subtitle">Coordinate urgent surplus. Protect every handover.</p></div><div className="date-stamp"><Clock3 size={15} /><span>Simulation clock · {shortTime(now)}</span></div></section>
    <section className="readiness-banner"><div className="readiness-symbol"><ShieldCheck size={20} /></div><div className="readiness-copy"><strong>Safety-first dispatch is active</strong><p>Every reservation checks deadline, capacity, demand and aid compatibility. Unconfirmed claims expire after five minutes.</p></div><Badge tone="success">LIVE SIMULATION</Badge></section>
    <section className="metrics-grid">
      <MetricCard label="Available aid units" value={formatNumber(totalAvailable)} detail={data.donations.length + " registered batches"} icon={Boxes} tone="green" />
      <MetricCard label="Available riders" value={data.riders.filter(r => r.status === "available").length} detail={"Across " + data.riders.length + " registered riders"} icon={Bike} tone="blue" />
      <MetricCard label="Batches at risk" value={atRisk.length} detail="Safe-use deadline within 60 min" icon={AlertTriangle} tone="amber" />
      <MetricCard label="Delivered units" value={formatNumber(data.deliveredTotal)} detail={deliveredCount + " completed assignments"} icon={ShieldCheck} tone="neutral" />
    </section>
    <section className="board-section"><PanelHeading eyebrow="NEEDS ATTENTION" title="Urgency queue" detail="Ranked by remaining safe-use time. Urgency does not override feasibility." /><div className="urgent-list">{data.donations.filter(d => d.available > 0).sort((a,b) => new Date(a.deadline) - new Date(b.deadline)).slice(0,4).map(d => <article className="urgent-row" key={d.id}><div className="urgent-time"><strong>{Math.max(0, remainingMinutes(d.deadline, now))}</strong><span>min left</span></div><div className="urgent-copy"><strong>{d.name}</strong><p>{d.donor} · {formatNumber(d.available)} units available</p><QuantityBar value={d.original-d.available} total={d.original} /></div><Badge tone={remainingMinutes(d.deadline, now) <= 30 ? "danger" : "warning"}>{remainingMinutes(d.deadline, now) <= 30 ? "Critical window" : "Time-sensitive"}</Badge><button className="text-action" onClick={() => { setAllocation(v => ({ ...v, donationId: d.id, quantity: d.available })); setPage("Dispatch board"); }}>Plan <ArrowRight size={14} /></button></article>)}</div></section>
    <section className="board-section"><PanelHeading eyebrow="CURRENT OPERATIONS" title="Active dispatches" detail="Cargo remains accounted for until delivery or explicit disposition." action={<button className="secondary-button" onClick={() => setPage("Dispatch board")}>Open dispatch board <ArrowRight size={14} /></button>} />
      {activeAssignments.length ? <div className="assignment-list">{activeAssignments.slice(0,5).map(a => <AssignmentRow key={a.id} assignment={a} data={data} now={now} onMove={moveAssignment} onReroute={selectReroute} rerouteOptions={openRerouteOptions(a)} rerouteChoice={rerouteChoice} setRerouteChoice={setRerouteChoice} />)}</div> : <EmptyState title="No active assignments" detail="Run a split allocation or create a reservation to begin dispatch." />}
    </section>
    <section className="principles-grid"><article className="principle"><span className="principle-icon principle-green"><ShieldCheck size={18} /></span><div><h3>Safety gates first</h3><p>Deadline and compatibility are hard constraints.</p></div></article><article className="principle"><span className="principle-icon principle-blue"><Bike size={18} /></span><div><h3>Capacity-aware splitting</h3><p>Each rider and receiving site has committed limits.</p></div></article><article className="principle"><span className="principle-icon principle-amber"><Clock3 size={18} /></span><div><h3>Ghost claims expire</h3><p>Unconfirmed stock returns once after five minutes.</p></div></article></section>
  </div>;

  const renderBatches = () => <div className="page-content">
    <section className="page-heading"><div><p className="eyebrow">DONOR INTAKE</p><h1>Aid batches</h1><p className="page-subtitle">Register short-life food, medical supplies, and essential kits.</p></div><Badge>{data.donations.length} batches</Badge></section>
    <div className="two-column">
      <form className="surface form-card" onSubmit={addBatch}><PanelHeading eyebrow="NEW DONATION" title="Register an aid batch" detail="A safe-use deadline and pickup window are required." />
        <div className="form-grid"><Field label="Donor / organization"><input required value={batchForm.donor} onChange={e => setBatchForm(v => ({ ...v, donor: e.target.value }))} placeholder="Restaurant, pharmacy, hostel mess" /></Field><Field label="Batch name"><input required value={batchForm.name} onChange={e => setBatchForm(v => ({ ...v, name: e.target.value }))} placeholder="Prepared dinner meals" /></Field><Field label="Aid type"><select value={batchForm.type} onChange={e => setBatchForm(v => ({ ...v, type: e.target.value }))}><option value="prepared">Prepared food</option><option value="perishable">Perishable food</option><option value="raw">Raw ration kit</option><option value="medical">Medical supplies</option><option value="infant_formula">Infant formula</option><option value="essential">Essential kit</option></select></Field><Field label="Quantity (units)"><input required type="number" min="1" max="100000" value={batchForm.quantity} onChange={e => setBatchForm(v => ({ ...v, quantity: e.target.value }))} /></Field><Field label="Pickup available from"><input required type="datetime-local" value={batchForm.pickupAt} onChange={e => setBatchForm(v => ({ ...v, pickupAt: e.target.value }))} /></Field><Field label="Safe-use deadline"><input required type="datetime-local" value={batchForm.deadline} onChange={e => setBatchForm(v => ({ ...v, deadline: e.target.value }))} /></Field><Field label="Pickup location"><input required value={batchForm.location} onChange={e => setBatchForm(v => ({ ...v, location: e.target.value }))} placeholder="Donor gate / loading bay" /></Field><Field label="Handling requirements"><input value={batchForm.handling} onChange={e => setBatchForm(v => ({ ...v, handling: e.target.value }))} placeholder="Keep chilled, sealed, upright" /></Field></div><button className="primary-button" type="submit"><Plus size={15} /> Register batch</button>
      </form>
      <section className="surface"><PanelHeading eyebrow="INVENTORY LEDGER" title="Batch reconciliation" detail="Available + reserved + picked + delivered + rejected should equal original quantity." /><div className="search-row"><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search batches, donors, or type…" /></div><div className="batch-list">{filteredDonations.map(d => <article className="batch-card" key={d.id}><div className="batch-card-head"><div><strong>{d.name}</strong><p>{d.donor} · {d.id}</p></div><Badge tone={remainingMinutes(d.deadline, now) <= 30 ? "danger" : "neutral"}>{remainingMinutes(d.deadline, now) + " min"}</Badge></div><div className="batch-type-line"><span className={"type-pill " + typeClass(d.type)}>{aidTypeLabel(d.type)}</span><span>{d.location}</span></div><div className="inventory-grid">{[["Available",d.available],["Reserved",d.reserved],["Picked",d.picked],["Delivered",d.delivered],["Rejected",d.rejected]].map(([label,value]) => <div key={label}><strong>{formatNumber(value)}</strong><span>{label}</span></div>)}</div><QuantityBar value={d.original-d.available} total={d.original} /><p className="handling-note">{d.handling || "No handling note provided"} · Safe until {new Date(d.deadline).toLocaleString([], { dateStyle:"short", timeStyle:"short" })}</p></article>)}</div></section>
    </div>
  </div>;

  const renderDispatch = () => <div className="page-content">
    <section className="page-heading"><div><p className="eyebrow">FEASIBILITY BEFORE COMMITMENT</p><h1>Dispatch board</h1><p className="page-subtitle">Split bulk supply across riders without exceeding capacity or site demand.</p></div><Badge tone="success">Constraint engine active</Badge></section>
    <div className="two-column dispatch-columns"><form className="surface form-card" onSubmit={submitAllocation}><PanelHeading eyebrow="PLAN A DELIVERY" title="Build a feasible allocation" detail="The planner filters unsafe options, then reserves stock in rider-sized chunks." /><div className="form-grid"><Field label="Aid batch"><select required value={allocation.donationId} onChange={e => setAllocation(v => ({ ...v, donationId: e.target.value }))}>{data.donations.filter(d => d.available > 0).map(d => <option key={d.id} value={d.id}>{d.name} · {d.available} available</option>)}</select></Field><Field label="Units to allocate"><input required type="number" min="1" value={allocation.quantity} onChange={e => setAllocation(v => ({ ...v, quantity: e.target.value }))} /></Field><Field label="Estimated travel (minutes)"><input required type="number" min="1" max="600" value={allocation.travelMinutes} onChange={e => setAllocation(v => ({ ...v, travelMinutes: e.target.value }))} /></Field><Field label="Safety buffer (minutes)"><input required type="number" min="0" max="180" value={allocation.safetyBufferMinutes} onChange={e => setAllocation(v => ({ ...v, safetyBufferMinutes: e.target.value }))} /></Field></div><button className="primary-button" type="submit"><Zap size={15} /> Find feasible split</button><p className="form-help">Demo travel times are estimates entered by the operator, not live navigation.</p></form>
      <section className="surface"><PanelHeading eyebrow="EXPLAINABLE RESULT" title="Allocation decision" detail="Every proposed reservation is bounded by inventory, rider capacity, demand, compatibility and deadline." />
        {allocationResult ? <div className="decision-result"><div className="decision-summary"><strong>{allocationResult.allocations.reduce((sum, a) => sum + a.quantity, 0)} units reserved</strong><Badge tone={allocationResult.unallocated ? "warning" : "success"}>{allocationResult.unallocated ? allocationResult.unallocated + " unallocated" : "Target met"}</Badge></div>{allocationResult.allocations.length ? allocationResult.allocations.map(a => <div className="decision-row" key={a.reservation.id}><div><strong>{a.rider.name} → {a.shelter.name}</strong><p>{a.quantity} units · reservation {a.reservation.id}</p></div><Badge tone="warning">Awaiting confirmation</Badge></div>) : <EmptyState title="No feasible allocation" detail={(allocationResult.errors || []).join(" ") || "Try a smaller quantity or a different deadline and destination."} />}{allocationResult.errors?.length > 0 && <p className="form-help">{[...new Set(allocationResult.errors)].join(" ")}</p>}<button className="secondary-button" onClick={() => setPage("Reservations")}>Review reservations <ArrowRight size={14} /></button></div> : <EmptyState title="No plan generated yet" detail="Choose a batch, quantity, travel estimate and safety buffer, then run the planner." />}
      </section></div>
    <section className="surface section-gap"><PanelHeading eyebrow="CURRENT CARGO" title="Assignment lifecycle" detail="Confirm pickup, transit, delivery, reroute or escalation with explicit state transitions." />{data.assignments.length ? <div className="assignment-list">{data.assignments.map(a => <AssignmentRow key={a.id} assignment={a} data={data} now={now} onMove={moveAssignment} onReroute={selectReroute} rerouteOptions={openRerouteOptions(a)} rerouteChoice={rerouteChoice} setRerouteChoice={setRerouteChoice} />)}</div> : <EmptyState title="No assignments yet" detail="Confirm a reservation to create the first assignment." />}</section>
  </div>;

  const renderRiders = () => <div className="page-content"><section className="page-heading"><div><p className="eyebrow">VOLUNTEER CAPACITY</p><h1>Rider fleet</h1><p className="page-subtitle">Track transport capacity and availability without assigning beyond limits.</p></div><Badge>{data.riders.length} riders</Badge></section><div className="two-column"><form className="surface form-card" onSubmit={addRider}><PanelHeading eyebrow="ADD VOLUNTEER" title="Register a rider" /><div className="form-grid"><Field label="Rider name"><input required value={riderForm.name} onChange={e => setRiderForm(v => ({ ...v, name: e.target.value }))} /></Field><Field label="Capacity (units)"><input required type="number" min="1" max="1000" value={riderForm.capacity} onChange={e => setRiderForm(v => ({ ...v, capacity: e.target.value }))} /></Field><Field label="Transport"><select value={riderForm.transport} onChange={e => setRiderForm(v => ({ ...v, transport: e.target.value }))}><option>Scooter</option><option>Bike</option><option>Car</option><option>Cycle</option><option>On foot</option></select></Field><Field label="Current zone"><input required value={riderForm.zone} onChange={e => setRiderForm(v => ({ ...v, zone: e.target.value }))} /></Field></div><button className="primary-button" type="submit"><Plus size={15} /> Add rider</button></form><section className="surface"><PanelHeading eyebrow="FLEET STATUS" title="Riders and capacity" detail="Capacity includes active assignments and unconfirmed reservations." /><div className="rider-list">{data.riders.map(r => { const used = data.assignments.filter(a => a.riderId === r.id && ["accepted","picked_up","in_transit","reroute_required","escalated"].includes(a.status)).reduce((sum,a) => sum + a.quantity,0) + pendingReservations.filter(x => x.riderId === r.id).reduce((sum,x) => sum + x.quantity,0); return <article className="rider-card" key={r.id}><span className="rider-avatar"><Bike size={17} /></span><div className="rider-main"><strong>{r.name}</strong><p>{r.transport} · {r.zone} · {r.id}</p><QuantityBar value={used} total={r.capacity} /><small>{used} / {r.capacity} units committed</small></div><div className="rider-actions"><Badge tone={r.status === "available" ? "success" : "danger"}>{statusLabel(r.status)}</Badge><button className="small-button" onClick={() => mutate(next => { const rider = next.riders.find(x => x.id === r.id); if (rider) rider.status = rider.status === "available" ? "unavailable" : "available"; addEvent(next, "Rider availability changed", r.name + " → " + rider.status, "warning"); }, "Rider availability updated.")}>{r.status === "available" ? "Set unavailable" : "Set available"}</button></div></article>})}</div></section></div></div>;

  const renderSites = () => <div className="page-content"><section className="page-heading"><div><p className="eyebrow">DEMAND AND COMPATIBILITY</p><h1>Receiving sites</h1><p className="page-subtitle">Demand can change during transit. Resource prerequisites are hard constraints.</p></div><Badge>{data.shelters.length} sites</Badge></section><div className="two-column"><form className="surface form-card" onSubmit={addShelter}><PanelHeading eyebrow="ADD PARTNER" title="Register a receiving site" /><div className="form-grid"><Field label="Site name"><input required value={shelterForm.name} onChange={e => setShelterForm(v => ({ ...v, name: e.target.value }))} /></Field><Field label="Zone"><input required value={shelterForm.zone} onChange={e => setShelterForm(v => ({ ...v, zone: e.target.value }))} /></Field><Field label="Demand (units)"><input required type="number" min="0" value={shelterForm.demand} onChange={e => setShelterForm(v => ({ ...v, demand: e.target.value }))} /></Field></div><p className="form-subhead">Recorded site resources</p><div className="check-grid">{[["water","Clean water"],["fuel","Cooking fuel"],["coldStorage","Cold storage"],["medicalStorage","Medical storage"]].map(([key,label]) => <label key={key}><input type="checkbox" checked={shelterForm[key]} onChange={e => setShelterForm(v => ({ ...v, [key]: e.target.checked }))} /> {label}</label>)}</div><button className="primary-button" type="submit"><Plus size={15} /> Add receiving site</button></form><section className="surface"><PanelHeading eyebrow="PARTNER NETWORK" title="Site demand and resources" detail="Direct drop-offs reduce unmet demand immediately." /><div className="site-list">{data.shelters.map(s => <article className="site-card" key={s.id}><div className="site-card-top"><div><strong>{s.name}</strong><p>{s.zone} · {s.id}</p></div><Badge tone={s.status === "closed" ? "danger" : s.status === "limited" ? "warning" : "success"}>{statusLabel(s.status)}</Badge></div><div className="site-demand"><div><span>Demand</span><strong>{s.demand}</strong></div><div><span>Delivered</span><strong>{s.delivered}</strong></div><div><span>Unmet demand</span><strong>{shelterRemaining(data, s.id)}</strong></div></div><div className="site-resources"><Badge tone={s.water ? "success" : "danger"}>Water {s.water ? "yes" : "no"}</Badge><Badge tone={s.fuel ? "success" : "danger"}>Fuel {s.fuel ? "yes" : "no"}</Badge><Badge tone={s.coldStorage ? "success" : "danger"}>Cold chain {s.coldStorage ? "yes" : "no"}</Badge><Badge tone={s.medicalStorage ? "success" : "danger"}>Medical storage {s.medicalStorage ? "yes" : "no"}</Badge></div><div className="site-actions"><button className="small-button" onClick={() => { const raw = window.prompt("How many units of direct aid were delivered to " + s.name + "?", "50"); if (raw === null || !Number.isFinite(Number(raw)) || Number(raw) <= 0) return; recordDirectDrop(s.id, Number(raw)); }}>Record direct drop-off</button><button className="small-button" onClick={() => changeSiteStatus(s.id, s.status === "closed" ? "open" : "closed")}>{s.status === "closed" ? "Reopen site" : "Close site"}</button><button className="small-button" onClick={() => { const raw = window.prompt("Update total demand for " + s.name + " (delivered: " + s.delivered + ")", String(s.demand)); if (raw === null || !Number.isInteger(Number(raw)) || Number(raw) < s.delivered) return showToast("Demand must be a whole number no lower than already delivered units."); mutate(next => { const site = next.shelters.find(x => x.id === s.id); site.demand = Number(raw); addEvent(next, "Site demand updated", site.name + " demand → " + site.demand, "warning"); if (site.demand <= site.delivered) site.status = "limited"; next.assignments.filter(a => a.shelterId === s.id && ["picked_up","in_transit"].includes(a.status) && site.demand - site.delivered < a.quantity).forEach(a => { a.status = "reroute_required"; a.history.push("destination_demand_filled"); addAlert(next, "Demand changed in transit", site.name + " no longer has enough unmet demand for " + a.id + ".", "critical"); }); }, "Site demand updated."); }}>Edit demand</button></div></article>)}</div></section></div></div>;

  const renderReservations = () => <div className="page-content"><section className="page-heading"><div><p className="eyebrow">TIME-BOUND COMMITMENTS</p><h1>Reservations</h1><p className="page-subtitle">Pending claims expire after five minutes; the countdown runs automatically in this browser.</p></div><button className="secondary-button" onClick={() => mutate(next => expireReservations(next, Date.now()), "Expired reservations checked.")}><RotateCcw size={14} /> Check expiry now</button></section>{allocationResult?.allocations?.length > 0 && <section className="surface allocation-notice"><strong>Latest plan</strong><p>{allocationResult.allocations.reduce((sum,a) => sum + a.quantity,0)} units reserved; {allocationResult.unallocated} units unallocated. Confirm each reservation before pickup.</p></section>}<section className="surface"><PanelHeading eyebrow="CLAIM QUEUE" title="Reservations and timeouts" detail="Stock stays reserved until confirmation, expiry, or explicit cancellation before pickup." /><div className="reservation-list">{data.reservations.length ? data.reservations.map(r => { const d = data.donations.find(x => x.id === r.donationId); const rider = data.riders.find(x => x.id === r.riderId); const site = data.shelters.find(x => x.id === r.shelterId); const mins = Math.ceil((new Date(r.expiresAt).getTime() - now) / 60000); return <article className="reservation-card" key={r.id}><div className="reservation-main"><div className="reservation-head"><strong>{r.id}</strong><Badge tone={r.status === "pending" ? "warning" : r.status === "expired" ? "danger" : r.status === "delivered" ? "success" : "neutral"}>{statusLabel(r.status)}</Badge></div><h3>{d?.name || r.donationId}</h3><p>{r.quantity} units · {rider?.name || r.riderId} → {site?.name || r.shelterId}</p>{r.status === "pending" && <p className="countdown">{mins > 0 ? "Expires in about " + mins + " min" : "Expiry processing…"} · automatic release enabled</p>}</div><div className="reservation-actions">{r.status === "pending" && <button className="primary-button" onClick={() => confirm(r.id)}><CheckCircle2 size={14} /> Confirm claim</button>}{r.status === "confirmed" && <span className="muted-note">Awaiting pickup confirmation in dispatch board.</span>}</div></article>}) : <EmptyState title="No reservations yet" detail="Run a dispatch plan to create a time-limited claim." />}</div></section></div>;

  const renderAlerts = () => <div className="page-content"><section className="page-heading"><div><p className="eyebrow">EXCEPTIONS AND TRACEABILITY</p><h1>Alerts & audit</h1><p className="page-subtitle">Blocked decisions, reservation releases and recovery actions remain traceable.</p></div><Badge>{data.alerts.filter(a => a.status === "open").length} open alerts</Badge></section><section className="surface"><PanelHeading eyebrow="ALERT CENTER" title="Operational exceptions" detail="Resolve an alert only after its operational issue has been reviewed." />{data.alerts.length ? <div className="event-list">{data.alerts.map(a => <article className="event-row" key={a.id}><span className={"event-icon event-" + a.level}>{a.level === "critical" ? <AlertTriangle size={17} /> : a.level === "warning" ? <Clock3 size={17} /> : <Activity size={17} />}</span><div className="event-main"><strong>{a.title}</strong><p>{a.detail}</p><small>{new Date(a.at).toLocaleString()}</small></div><div className="event-actions"><Badge tone={a.level === "critical" ? "danger" : a.level === "warning" ? "warning" : "neutral"}>{a.level}</Badge>{a.status === "open" && <button className="small-button" onClick={() => mutate(next => { const item = next.alerts.find(x => x.id === a.id); if (item) item.status = "resolved"; addEvent(next, "Alert resolved", a.title); }, "Alert marked reviewed.")}>Resolve</button>}</div></article>)}</div> : <EmptyState title="No active alerts" detail="Safety blocks and scenario failures will be recorded here." />}</section><section className="surface section-gap"><PanelHeading eyebrow="AUDIT TRAIL" title="Recent decisions" detail="Synthetic event records are stored in this browser." /><div className="event-list">{data.audit.slice(0,80).map(e => <article className="audit-row" key={e.id}><span className="audit-time">{new Date(e.at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span><div><strong>{e.action}</strong><p>{e.detail}</p></div><Badge tone={e.level === "critical" ? "danger" : e.level === "warning" ? "warning" : "neutral"}>{e.level || "info"}</Badge></article>)}</div></section></div>;

  const renderScenarios = () => <div className="page-content"><section className="page-heading"><div><p className="eyebrow">JUDGE-READY FAILURE SIMULATION</p><h1>Resilience lab</h1><p className="page-subtitle">Run the exact failure modes from the problem statement against synthetic records.</p></div><button className="secondary-button" onClick={resetDemo}><RotateCcw size={14} /> Reset scenario data</button></section><section className="scenario-grid">{[
    ["expiry","01","Urgent safe-use deadline","Prioritise the batch closest to expiry without bypassing travel and safety margin.",Clock3],
    ["split","02","Split 180 meals","Allocate 180 meals across riders capped at 40 units each.",Boxes],
    ["ghost","03","Unresponsive volunteer","Simulate a 30-minute ghost claim; expire the five-minute reservation and release stock once.",XCircle],
    ["direct-drop","04","Shelter demand fills in transit","A rider carries 40 meals while a direct drop-off fills Shelter A's demand; recover the incoming cargo.",Truck],
    ["resources","05","Missing cooking resources","Block raw ration kits from a site without clean water or cooking fuel.",ShieldCheck]
  ].map(([key,num,title,detail,Icon]) => <button className="scenario-card" key={key} onClick={() => runDemoScenario(key)}><span className="scenario-number">{num}</span><span className="scenario-icon"><Icon size={19} /></span><strong>{title}</strong><p>{detail}</p><span className="scenario-run">Run scenario <ArrowRight size={14} /></span></button>)}</section><section className="surface section-gap"><PanelHeading eyebrow="SCENARIO OUTPUT" title="Execution log" detail="Each run reports the rule applied and any resulting state changes." />{data.scenarioLog.length ? <div className="scenario-results">{data.scenarioLog.map(s => <article className="scenario-result" key={s.id}><div className="scenario-result-head"><div><strong>{s.title}</strong><small>{new Date(s.at).toLocaleString()}</small></div><Badge tone="success">Executed</Badge></div><ul>{s.lines.map((line,index) => <li key={index}>{line}</li>)}</ul></article>)}</div> : <EmptyState title="No scenarios run" detail="Choose one of the five simulations above to see the engine respond to operational uncertainty." />}</section></div>;

  const pageContent = {
    Overview: renderOverview, "Aid batches": renderBatches, "Dispatch board": renderDispatch,
    Riders: renderRiders, "Receiving sites": renderSites, Reservations: renderReservations,
    "Alerts & audit": renderAlerts, "Resilience lab": renderScenarios
  }[page]();

  return <div className="app-shell">
    <aside className="sidebar"><a className="brand" href="#overview" onClick={e => { e.preventDefault(); setPage("Overview"); }} aria-label="AidFlow overview"><span className="brand-mark"><HandHeart size={21} /></span><span className="brand-copy"><strong>aidflow</strong><small>CIVIC OPERATIONS</small></span></a><div className="workspace-label">WORKSPACE</div><nav className="primary-nav" aria-label="Primary navigation">{navItems.map(([label, Icon]) => <button className={"nav-item " + (page === label ? "is-active" : "")} key={label} type="button" onClick={() => setPage(label)} aria-current={page === label ? "page" : undefined}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === "Dispatch board" && <span className="nav-count">{activeAssignments.length}</span>}{label === "Reservations" && <span className="nav-count">{pendingReservations.length}</span>}</button>)}</nav><div className="sidebar-bottom"><div className="safety-note"><span className="safety-icon"><ShieldCheck size={17} /></span><div><strong>Safety-first dispatch</strong><p>Time, capacity and compatibility are hard constraints.</p></div></div><button className="profile-button" type="button" onClick={resetDemo}><span className="avatar">DEMO</span><span className="profile-copy"><strong>Demo workspace</strong><small>Browser-local simulation</small></span><RotateCcw size={16} className="profile-settings" /></button></div></aside>
    <main className="main-content"><header className="topbar"><div className="breadcrumb"><span>AidFlow</span><span className="breadcrumb-slash">/</span><strong>{page}</strong></div><div className="topbar-right"><span className="environment-chip"><span className="status-dot" /> DEMO ENVIRONMENT</span><span className="topbar-avatar" aria-label="Operations user">AO</span></div></header><div className="page-wrap">{pageContent}<footer className="app-footer"><span><span className="footer-mark"><HandHeart size={13} /></span> AidFlow <span className="footer-separator">/</span> Civic micro-logistics</span><span>Synthetic data · Browser-local state · No live dispatch</span></footer></div></main>
    {toast && <div className="toast-message" role="status" aria-live="polite">{toast}</div>}
  </div>;
}

function AssignmentRow({ assignment, data, now, onMove, onReroute, rerouteOptions, rerouteChoice, setRerouteChoice }) {
  const d = data.donations.find(x => x.id === assignment.donationId);
  const r = data.riders.find(x => x.id === assignment.riderId);
  const s = data.shelters.find(x => x.id === assignment.shelterId);
  const options = {
    accepted: [["picked_up", "Confirm pickup"], ["cancelled", "Cancel before pickup"]],
    picked_up: [["in_transit", "Start transit"], ["failed", "Report failure"]],
    in_transit: [["delivered", "Confirm delivery"], ["reroute_required", "Request reroute"], ["failed", "Report failure"]],
    reroute_required: [["escalated", "Escalate cargo"]],
    escalated: [["reroute_required", "Reopen recovery"], ["failed", "Record failed cargo"]]
  }[assignment.status] || [];
  return <article className="assignment-card"><div className="assignment-top"><div><span className="assignment-id">{assignment.id}</span><h3>{d?.name || assignment.donationId}</h3></div><Badge tone={assignment.status === "delivered" ? "success" : ["failed","escalated"].includes(assignment.status) ? "danger" : ["in_transit","reroute_required"].includes(assignment.status) ? "warning" : "neutral"}>{statusLabel(assignment.status)}</Badge></div><div className="assignment-route"><div><span>RIDER</span><strong>{r?.name || assignment.riderId}</strong></div><ArrowRight size={15} /><div><span>DESTINATION</span><strong>{s?.name || assignment.shelterId}</strong></div><div className="route-quantity"><strong>{assignment.quantity}</strong><span>units</span></div></div><div className="assignment-deadline"><Clock3 size={14} /> Safe-use deadline in {remainingMinutes(assignment.deadline, now)} min · route estimate {assignment.travelMinutes} min</div>{assignment.history?.length > 0 && <p className="assignment-history">{assignment.history.join(" → ")}</p>}{options.length > 0 && <div className="assignment-controls">{options.map(([status,label]) => <button key={status} className={status === "delivered" ? "primary-button" : "small-button"} onClick={() => onMove(assignment.id, status)}>{label}</button>)}</div>}{assignment.status === "reroute_required" && <div className="reroute-controls"><label className="field"><span>Feasible alternate destination</span><select value={rerouteChoice[assignment.id] || ""} onChange={e => setRerouteChoice(prev => ({ ...prev, [assignment.id]: e.target.value }))}><option value="">Choose site…</option>{rerouteOptions.map(site => <option key={site.id} value={site.id}>{site.name} · {shelterRemaining(data, site.id)} demand</option>)}</select></label><button className="primary-button" disabled={!rerouteChoice[assignment.id]} onClick={() => onReroute(assignment.id, rerouteChoice[assignment.id])}>Approve reroute</button>{rerouteOptions.length === 0 && <p className="danger-note">No safe alternate destination. Escalate rather than discard cargo or mark it delivered.</p>}</div>}</article>;
}
