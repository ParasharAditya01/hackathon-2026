import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, AlertTriangle, ArrowLeft, ArrowRight, Bike, Boxes, CheckCircle2, Clock3,
  HandHeart, LayoutDashboard, MapPinned, PackageCheck, Plus, RotateCcw,
  ShieldCheck, Truck, Warehouse, XCircle, Zap, ClipboardList, HeartPulse
} from "lucide-react";
import {
  addAlert, addEvent, aidTypeLabel, allocateAcrossRiders, approveReroute, disposeFailedCargo,
  confirmReservation, createSeedState, expireAidBatches, expireReservations, findRerouteOptions,
  remainingMinutes, runScenario, shelterRemaining, transitionAssignment
} from "./lib/dispatch.js";

const STORAGE_KEY = "aidflow-operational-prototype-v1";

const documentTitles = {
  Overview: "AidFlow | Civic Aid Operations",
  "Aid batches": "Aid Batches & Surplus Inventory | AidFlow",
  "Dispatch board": "Dispatch Planning & Deliveries | AidFlow",
  Riders: "Rider Fleet & Capacity | AidFlow",
  "Receiving sites": "Receiving Sites & Aid Demand | AidFlow",
  Reservations: "Aid Reservations & Claim Queue | AidFlow",
  "Alerts & audit": "Operational Alerts & Audit Trail | AidFlow",
  "Resilience lab": "Resilience Lab & Failure Simulations | AidFlow",
};
const documentDescriptions = {
  Overview: "Explore AidFlow’s demo overview of time-critical surplus aid, safety constraints and civic micro-logistics. Enter the workspace to review the sample operations.",
  "Aid batches": "Review AidFlow’s sample aid batches, surplus inventory, handling notes and safe-use deadlines. Explore how available supplies are tracked in the demo.",
  "Dispatch board": "Explore AidFlow’s simulated dispatch assignments, delivery deadlines, rider capacity and rerouting options. Open the workspace to review delivery planning.",
  Riders: "Review the demo rider fleet, transport types, carrying capacity and availability used in AidFlow’s dispatch planning simulation.",
  "Receiving sites": "Explore AidFlow’s sample receiving sites, aid demand and available storage or handling resources to understand destination suitability.",
  Reservations: "Review AidFlow’s simulated aid reservations, claim queue and reservation status for coordinating sample supply with receiving-site needs.",
  "Alerts & audit": "Explore AidFlow’s demo operational alerts and audit trail to review simulated dispatch events, warnings and recorded workflow changes.",
  "Resilience lab": "Run AidFlow’s built-in demo scenarios to explore how simulated dispatch responds to delays, unavailable riders, site closures and resource constraints.",
};
const landingDocumentTitle = "AidFlow | Time-Critical Surplus & Civic Aid";
const landingDocumentDescription = "AidFlow coordinates surplus food, riders and receiving sites around safe-use deadlines. Explore a civic micro-logistics demo for safety-first aid dispatch.";

const navItems = [
  ["Overview", LayoutDashboard], ["Aid batches", Boxes], ["Dispatch board", MapPinned],
  ["Riders", Bike], ["Receiving sites", Warehouse], ["Reservations", Clock3],
  ["Alerts & audit", Activity], ["Resilience lab", Zap]
];

const pageRoutes = {
  Overview: "overview-page",
  "Aid batches": "aid-batches-page",
  "Dispatch board": "dispatch-board-page",
  Riders: "riders-page",
  "Receiving sites": "receiving-sites-page",
  Reservations: "reservations-page",
  "Alerts & audit": "alerts-audit-page",
  "Resilience lab": "resilience-lab-page",
};
const relatedPages = {
  Overview: ["Aid batches", "Dispatch board", "Resilience lab"],
  "Aid batches": ["Dispatch board", "Receiving sites"],
  "Dispatch board": ["Aid batches", "Riders", "Receiving sites", "Reservations"],
  Riders: ["Dispatch board", "Reservations"],
  "Receiving sites": ["Dispatch board", "Aid batches"],
  Reservations: ["Dispatch board", "Alerts & audit"],
  "Alerts & audit": ["Reservations", "Dispatch board", "Resilience lab"],
  "Resilience lab": ["Dispatch board", "Receiving sites", "Alerts & audit"],
};

function PageLink({ to, onNavigate, children, className = "contextual-link" }) {
  return <a className={className} href={"#" + pageRoutes[to]} onClick={(event) => { event.preventDefault(); onNavigate(to); }}>{children}</a>;
}

function RelatedLinks({ page, onNavigate }) {
  return <nav className="related-links" aria-label={"Related pages for " + page}>
    <span className="related-links-label">RELATED WORK</span>
    <div>{(relatedPages[page] || []).map((label) => <PageLink key={label} to={label} onNavigate={onNavigate}>{label}<ArrowRight size={13} aria-hidden="true" /></PageLink>)}</div>
  </nav>;
}

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

function AidFlowMark({ className = "" }) {
  return <svg className={"aidflow-mark " + className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <circle cx="7" cy="24" r="3.2" fill="currentColor" />
    <path className="logo-route" d="M10.5 24H17L22 16H29L34 24H40" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 16L25 11H32L35 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 16V29L28.5 34L35 29V16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M22 29L28.5 24L35 29M28.5 24V34" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="41" cy="24" r="3.2" fill="currentColor" />
  </svg>;
}

function LandingPage({ onEnter, onExplore }) {
  return <main className="landing-page">
    <header className="landing-nav">
      <a href="#top" className="landing-brand" aria-label="AidFlow home"><span className="landing-mark"><AidFlowMark className="logo-intro" /></span><span className="landing-wordmark"><span>AidFlow<span className="landing-wordmark-dot">.</span></span><small>CIVIC MICRO-LOGISTICS</small></span></a>
      <div className="landing-nav-meta"><span className="landing-status"><span /> SAFETY-FIRST DISPATCH</span><button className="landing-nav-cta" onClick={onEnter}>Enter operations <ArrowRight size={15} /></button></div>
    </header>
    <section className="landing-hero" id="top">
      <div className="landing-hero-copy">
        <p className="landing-kicker"><span /> THE LAST-MILE SPOILAGE TRAP</p>
        <h1>Move good food.<br /><em>Before time runs out.</em></h1>
        <p className="landing-lede">AidFlow coordinates surplus, riders and receiving sites around one non-negotiable constraint: aid must arrive while it is still safe to use.</p>
        <div className="landing-actions"><button className="landing-primary" onClick={onEnter}>Open operations workspace <ArrowRight size={16} /></button><button className="landing-secondary" onClick={onExplore}><Activity size={15} /> Explore the resilience demo</button></div>
        <div className="landing-proof"><span><ShieldCheck size={15} /> Deadline-aware allocation</span><span><Boxes size={15} /> Capacity-aware splits</span><span><RotateCcw size={15} /> Recovery when plans fail</span></div>
      </div>
      <div className="route-illustration">
        <div className="route-illustration-head"><span>THE AIDFLOW ROUTE</span><span className="route-demo-label">DEMO SCENARIO</span></div>
        <svg className="route-map-svg" viewBox="0 0 560 290" role="img" aria-label="A connected route links a donor parcel, rider handover, and shelter destination">
          <path className="route-map-grid" d="M0 50H560M0 100H560M0 150H560M0 200H560M0 250H560M70 0V290M140 0V290M210 0V290M280 0V290M350 0V290M420 0V290M490 0V290" />
          <path className="route-map-road" d="M70 184C132 184 118 87 211 87S300 214 370 214 432 118 495 118" />
          <path className="route-map-path" d="M70 184C132 184 118 87 211 87S300 214 370 214 432 118 495 118" />
          <circle cx="70" cy="184" r="13" fill="#f5f0e7" stroke="#641f32" strokeWidth="2" /><circle cx="70" cy="184" r="4" fill="#641f32" />
          <g transform="translate(177 54)"><rect x="0" y="0" width="68" height="65" rx="4" fill="#fffaf4" stroke="#ded4c8"/><path d="M15 22L34 12L53 22L34 32Z" fill="#e8d7da" stroke="#641f32" strokeWidth="1.5"/><path d="M15 22V43L34 54L53 43V22M34 32V54" fill="none" stroke="#641f32" strokeWidth="1.5" strokeLinejoin="round"/><path d="M34 12V32" stroke="#641f32" strokeWidth="1.5"/></g>
          <g transform="translate(339 178)"><circle cx="31" cy="31" r="31" fill="#e8d7da"/><circle cx="22" cy="38" r="7" fill="none" stroke="#641f32" strokeWidth="2"/><circle cx="45" cy="38" r="7" fill="none" stroke="#641f32" strokeWidth="2"/><path d="M22 38L29 21H39L45 38M29 21L36 38H22M33 16H39" fill="none" stroke="#641f32" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M29 21L25 16H19" fill="none" stroke="#641f32" strokeWidth="2" strokeLinecap="round"/></g>
          <circle cx="495" cy="118" r="13" fill="#f5f0e7" stroke="#641f32" strokeWidth="2"/><circle cx="495" cy="118" r="4" fill="#641f32"/>
          <g className="route-map-label" fill="#292522" fontFamily="inherit"><text x="48" y="218">DONOR</text><text x="176" y="42">AID BATCH</text><text x="337" y="264">RIDER</text><text x="458" y="91">SHELTER</text></g>
          <g className="route-map-time"><rect x="232" y="143" width="91" height="25" rx="12.5" fill="#35121f"/><text x="277.5" y="159" textAnchor="middle" fill="#fffaf4" fontSize="10" fontWeight="700">SAFE ARRIVAL</text></g>
        </svg>
        <div className="route-illustration-foot"><span><i className="route-key-dot" /> Route feasibility checked before commitment</span><span>01 / 03</span></div>
      </div>
    </section>
    <section className="landing-stats" aria-label="Demonstration scenario">
      <div><span className="landing-stat-label">DEMO SUPPLY</span><strong>180 <small>meals</small></strong><p>Prepared food, time-sensitive</p></div>
      <div><span className="landing-stat-label">RIDER CAPACITY</span><strong>40 <small>units / rider</small></strong><p>Split across feasible trips</p></div>
      <div><span className="landing-stat-label">SAFE-USE WINDOW</span><strong>75 <small>minutes</small></strong><p>Arrival must beat the deadline</p></div>
      <div className="landing-stat-note"><span className="landing-note-icon"><Clock3 size={18} /></span><p>Illustrative hackathon scenario. Values are seeded demo data, not live network telemetry.</p></div>
    </section>
    <section className="landing-how"><div className="landing-section-intro"><p className="landing-kicker">BUILT FOR THE REAL FAILURE MODES</p><h2>Coordination that holds<br />when plans don't.</h2><p>Operational rules stay explicit. Exceptions become recoverable work, not silent data loss.</p></div><div className="landing-process">
      <article><span className="process-index">01</span><div><h3>Match before you commit</h3><p>Check stock, travel estimate, rider capacity, site demand and handling prerequisites before a reservation is created.</p></div><span className="process-symbol"><Boxes size={20} /></span></article>
      <article><span className="process-index">02</span><div><h3>Release ghost reservations</h3><p>Claims expire when volunteers do not act. Eligible stock and capacity return to the pool exactly once.</p></div><span className="process-symbol"><Clock3 size={20} /></span></article>
      <article><span className="process-index">03</span><div><h3>Recover when demand shifts</h3><p>Direct drop-offs and shelter closures trigger cancellation, reroute or escalation paths while cargo remains accounted for.</p></div><span className="process-symbol"><RotateCcw size={20} /></span></article>
      <article><span className="process-index">04</span><div><h3>Protect handling constraints</h3><p>Raw kits and infant formula require recorded water and fuel; perishable and medical aid require compatible storage.</p></div><span className="process-symbol"><ShieldCheck size={20} /></span></article>
    </div></section>
    <footer className="landing-footer"><a href="#top" className="landing-footer-brand"><AidFlowMark /> AidFlow</a><span>Designed for the last mile. Built around safe handovers.</span><button onClick={onEnter}>Enter workspace <ArrowRight size={14} /></button></footer>
  </main>;
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

const API_BASE=(import.meta.env.VITE_API_BASE_URL||"").replace(/\/$/,"");
function ThankYouPage(){
 const [status,setStatus]=useState("checking"),[confirmation,setConfirmation]=useState(null);
 useEffect(()=>{let cancelled=false;const token=new URLSearchParams(location.search).get("token");if(!token||!/^[0-9a-f-]{36}$/i.test(token)){setStatus("unverified");return()=>{cancelled=true;};}
 fetch(`${API_BASE}/api/confirmations/${encodeURIComponent(token)}`,{cache:"no-store",headers:{Accept:"application/json"}}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok||d.status!=="confirmed")throw Error();return d;}).then(d=>{if(!cancelled){setConfirmation(d);setStatus("confirmed");}}).catch(()=>{if(!cancelled)setStatus("unverified");});return()=>{cancelled=true;};},[]);
 useEffect(()=>{document.title=status==="confirmed"?"Aid batch registered | AidFlow":"Submission status | AidFlow";const m=document.querySelector('meta[name="description"]');if(m)m.content=status==="confirmed"?"Your aid batch registration was confirmed by AidFlow's backend.":"Verify your AidFlow submission or return to operations.";},[status]);
 return <main className="thankyou-page"><a className="thankyou-brand" href="/"><span className="thankyou-mark"><AidFlowMark/></span><span><strong>AidFlow</strong><small>CIVIC MICRO-LOGISTICS</small></span></a><section className="thankyou-panel" aria-live="polite" aria-busy={status==="checking"}>
 {status==="checking"?<><span className="thankyou-symbol"><Clock3 size={25}/></span><p className="thankyou-eyebrow">VERIFYING SUBMISSION</p><h1>Checking your confirmation.</h1><p className="thankyou-copy">The server must verify the saved operation before AidFlow can confirm success.</p></>:status==="confirmed"?<><span className="thankyou-symbol thankyou-success"><CheckCircle2 size={27}/></span><p className="thankyou-eyebrow">BACKEND CONFIRMED</p><h1>Aid batch registered.</h1><p className="thankyou-copy">The server confirmed that your aid batch was saved successfully.</p><div className="thankyou-reference"><span>CONFIRMATION REFERENCE</span><strong>{confirmation.reference}</strong><small>{confirmation.actionLabel}</small></div><div className="thankyou-next"><strong>What happens next?</strong><p>Review the batch, check its safe-use deadline, and plan a feasible dispatch based on rider and receiving-site capacity.</p></div><div className="thankyou-actions"><a className="thankyou-primary" href="/?section=aid-batches">Open aid batches <ArrowRight size={16}/></a><a className="thankyou-secondary" href="/?section=dispatch-board">Go to dispatch board</a></div></>:<><span className="thankyou-symbol thankyou-neutral"><AlertTriangle size={25}/></span><p className="thankyou-eyebrow">NO VERIFIED SUCCESS</p><h1>This submission isn't confirmed.</h1><p className="thankyou-copy">No valid recent backend confirmation could be verified. This page may have been opened directly or the confirmation service may be unavailable. No success is being claimed.</p><div className="thankyou-actions"><a className="thankyou-primary" href="/?section=aid-batches">Return to aid batches <ArrowRight size={16}/></a><a className="thankyou-secondary" href="/">Back to AidFlow home</a></div></>}
 </section><footer className="thankyou-footer"><span>© {new Date().getFullYear()} AidFlow</span><span>Built around safer handovers.</span></footer></main>;
}
export default function App() {
  const [entered, setEntered] = useState(() => { try { return sessionStorage.getItem("aidflow-entered") === "1" || new URLSearchParams(window.location.search).has("section"); } catch { return false; } });
  const [data, setData] = useState(loadInitialState);
  const [page, setPage] = useState(() => {
    if (typeof window === "undefined") return "Overview";
    const requested = new URLSearchParams(window.location.search).get("section");
    return ({ "aid-batches": "Aid batches", "dispatch-board": "Dispatch board", "resilience-lab": "Resilience lab" })[requested] || "Overview";
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobileNavViewport, setIsMobileNavViewport] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches);
  const mobileMenuButtonRef = useRef(null);
  const mobileNavRef = useRef(null);
  const lastAllocationSubmitAt = useRef(0);
  const lastFormSubmitAt = useRef({});
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState("");
  const [toastKind, setToastKind] = useState("success");
  const [search, setSearch] = useState("");
  const [allocation, setAllocation] = useState({ donationId: "B-180", quantity: 180, travelMinutes: 15, safetyBufferMinutes: 10 });
  const [allocationResult, setAllocationResult] = useState(null);
  const [batchForm, setBatchForm] = useState({ donor: "", name: "", type: "prepared", quantity: 40, pickupAt: dateTimeLocal(-2), deadline: dateTimeLocal(75), location: "", handling: "" });
  const [riderForm, setRiderForm] = useState({ name: "", phone: "", capacity: 40, transport: "Scooter", zone: "Central" });
  const [shelterForm, setShelterForm] = useState({ name: "", zone: "Central", demand: 50, water: false, fuel: false, coldStorage: false, medicalStorage: false });
  const [rerouteChoice, setRerouteChoice] = useState({});

  const isThankYouPath = typeof window !== "undefined" && window.location.pathname === "/thank-you";
  const isNotFoundPath = typeof window !== "undefined" && window.location.pathname !== "/" && !isThankYouPath;

  const mutate = (operation, successMessage) => {
    const next = clone(data);
    const outcome = operation(next);
    setData(next);
    if (successMessage) showToast(successMessage);
    return outcome;
  };
  const showToast = (message, kind = "success") => {
    setToastKind(kind);
    setToast(message);
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => setToast(""), 4200);
  };
  const isDuplicateSubmit = (formName) => {
    const submittedAt = Date.now();
    if (submittedAt - (lastFormSubmitAt.current[formName] || 0) < 700) {
      showToast("This form was just submitted. Please wait before trying again.");
      return true;
    }
    lastFormSubmitAt.current[formName] = submittedAt;
    return false;
  };

  useEffect(() => {
    const title = isNotFoundPath ? "Page Not Found (404) | AidFlow" : entered ? (documentTitles[page] || documentTitles.Overview) : landingDocumentTitle;
    const description = isNotFoundPath ? "This AidFlow page could not be found. Return to the homepage or open a relevant operations section." : entered ? (documentDescriptions[page] || documentDescriptions.Overview) : landingDocumentDescription;
    document.title = title;
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement("meta");
      metaDescription.name = "description";
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute("content", description);
  }, [entered, page, isNotFoundPath]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 760px)");
    const updateViewport = () => {
      setIsMobileNavViewport(media.matches);
      if (!media.matches) setMobileMenuOpen(false);
    };
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, []);

  useEffect(() => {
    if (!isMobileNavViewport || !mobileMenuOpen) return undefined;
    mobileNavRef.current?.querySelector("button.nav-item")?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenuOpen(false);
        mobileMenuButtonRef.current?.focus();
        return;
      }
      if (event.key === "Tab") {
        const focusable = [...(mobileNavRef.current?.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || [])].filter(element => element.getClientRects().length);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const firstNavItem = mobileNavRef.current?.querySelector("button.nav-item");
        if (event.shiftKey && (document.activeElement === first || document.activeElement === firstNavItem)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobileNavViewport, mobileMenuOpen]);

  const navigateTo = (nextPage) => {
    setPage(nextPage);
    if (isMobileNavViewport) {
      setMobileMenuOpen(false);
      requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
    }
  };

  const returnToLanding = () => {
    try { sessionStorage.removeItem("aidflow-entered"); } catch { /* session storage is optional */ }
    setMobileMenuOpen(false);
    setEntered(false);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* storage is optional in this demo */ }
  }, [data]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setData(previous => {
        const reservationDue = previous.reservations.some(r => ["pending", "confirmed"].includes(r.status) && new Date(r.expiresAt).getTime() <= tick && (r.status === "pending" || previous.assignments.some(a => a.id === r.assignmentId && a.status === "accepted")));
        const batchDue = previous.donations.some(d => new Date(d.deadline).getTime() <= tick && (d.available > 0 || d.reserved > 0 || previous.assignments.some(a => a.donationId === d.id && ["picked_up", "in_transit", "reroute_required", "escalated"].includes(a.status))));
        if (!reservationDue && !batchDue) return previous;
        const next = clone(previous);
        expireReservations(next, tick);
        expireAidBatches(next, tick);
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

  const confirm = (id) => {
    const result = mutate(next => {
      const outcome = confirmReservation(next, id, Date.now());
      if (!outcome.ok) addAlert(next, "Reservation confirmation blocked", outcome.errors.join(" "), "critical");
      return outcome;
    });
    showToast(result?.ok ? "Reservation confirmed. Pickup can now be recorded." : (result?.errors?.[0] || "Reservation confirmation blocked."));
  };
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
    showToast("Scenario data reset to the original illustrative records.");
  };
  const submitAllocation = (event) => {
    event.preventDefault();
    if (isDuplicateSubmit("allocation")) return;
    const submittedAt = Date.now();
    if (submittedAt - lastAllocationSubmitAt.current < 500) {
      showToast("Allocation already submitted. Wait briefly before running another plan.");
      return;
    }
    lastAllocationSubmitAt.current = submittedAt;
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
  const addBatch = async (event) => {
    event.preventDefault(); if(isDuplicateSubmit("batch"))return;
    const quantity=Number(batchForm.quantity),pickupAt=new Date(batchForm.pickupAt),deadline=new Date(batchForm.deadline);
    if(!batchForm.name.trim()||!batchForm.donor.trim()||!batchForm.location.trim()||!Number.isInteger(quantity)||quantity<=0||Number.isNaN(pickupAt.getTime())||Number.isNaN(deadline.getTime())||deadline<=pickupAt||deadline<=new Date()){showToast("Check required details. The safe-use deadline must be after pickup and in the future. Entries are preserved.","error");return;}
    const button=event.currentTarget.querySelector('button[type="submit"]');if(button){button.disabled=true;button.dataset.originalText=button.textContent;button.textContent="Saving batch…";}
    try{const response=await fetch(`${API_BASE}/api/aid-batches`,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify({donor:batchForm.donor.trim(),name:batchForm.name.trim(),type:batchForm.type,quantity,pickupAt:pickupAt.toISOString(),deadline:deadline.toISOString(),location:batchForm.location.trim(),handling:batchForm.handling.trim()})});
      const payload=await response.json().catch(()=>({}));if(!response.ok||payload.status!=="confirmed"||!payload.token||!payload.batch)throw Error(payload.error||"The server did not confirm registration. Entries have been preserved.");
      mutate(next=>{const x=payload.batch,record={id:x.id,donor:x.donor,name:x.name,type:x.type,original:x.quantity,available:x.quantity,reserved:0,picked:0,delivered:0,rejected:0,pickupAt:x.pickupAt,deadline:x.deadline,location:x.location,handling:x.handling};if(!next.donations.some(d=>d.id===record.id))next.donations.unshift(record);addEvent(next,"Aid batch registered",record.id+" · "+record.name+" · "+x.quantity+" units");});
      window.location.assign("/thank-you?token="+encodeURIComponent(payload.token));
    }catch(error){showToast(error.message||"Could not confirm registration. Check the connection and retry; entries are preserved.","error");}
    finally{if(button){button.disabled=false;button.textContent=button.dataset.originalText||"Register batch";}}
  };
  const addRider = (event) => {
    event.preventDefault();
    if (isDuplicateSubmit("rider")) return;
    const phone = riderForm.phone.trim();
    const normalizedPhone = phone.replace(/[\s()-]/g, "");
    if (!riderForm.name.trim() || !riderForm.zone.trim() || !Number.isInteger(Number(riderForm.capacity)) || Number(riderForm.capacity) <= 0) return showToast("Enter a rider name and zone, and a positive whole-number capacity. Your entries are preserved; correct the fields and resubmit.", "error");
    if (!/^\+?[0-9]{10,15}$/.test(normalizedPhone)) return showToast("Enter a valid phone number with 10–15 digits, optionally starting with +. Your entries are preserved.", "error");
    if (data.riders.some(r => (r.phone || "").replace(/[\s()-]/g, "") === normalizedPhone)) return showToast("This phone number is already registered. Use a different number or update the existing rider. Your entries are preserved.", "error");
    mutate(next => {
      next.riders.push({ id: "R-" + Math.random().toString(36).slice(2, 6).toUpperCase(), name: riderForm.name.trim(), phone: normalizedPhone, capacity: Number(riderForm.capacity), transport: riderForm.transport, zone: riderForm.zone.trim(), status: "available", lastSeenAt: new Date().toISOString() });
      addEvent(next, "Rider added", riderForm.name.trim() + " · " + normalizedPhone + " · capacity " + riderForm.capacity);
    }, "Rider added to fleet.");
    setRiderForm({ name: "", phone: "", capacity: 40, transport: "Scooter", zone: "Central" });
  };
  const addShelter = (event) => {
    event.preventDefault();
    if (isDuplicateSubmit("shelter")) return;
    if (!shelterForm.name.trim() || !shelterForm.zone.trim() || Number(shelterForm.demand) < 0) return showToast("Enter a site name and zone, and demand as a non-negative whole number. Your entries are preserved.", "error");
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
      next.assignments.filter(a => a.shelterId === siteId && a.status === "accepted").forEach(a => {
        const cancelled = transitionAssignment(next, a.id, "cancelled", Date.now());
        if (cancelled.ok) addAlert(next, "Unpicked claim released", site.name + " closed before " + a.id + " pickup; reserved stock was returned safely.", "warning");
      });
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
    if (site.delivered >= site.demand) site.status = "limited";
    let remainingDemand = Math.max(0, site.demand - site.delivered);
    next.assignments.filter(a => a.shelterId === siteId && ["accepted", "picked_up", "in_transit"].includes(a.status)).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt)).forEach(a => {
      if (remainingDemand >= a.quantity) {
        remainingDemand -= a.quantity;
        return;
      }
      if (a.status === "accepted") {
        const cancelled = transitionAssignment(next, a.id, "cancelled", Date.now());
        if (cancelled.ok) addAlert(next, "Unpicked claim released", site.name + " demand changed before " + a.id + " pickup; reserved stock was returned safely.", "warning");
      } else {
        a.status = "reroute_required";
        a.history.push("destination_demand_reduced");
        addAlert(next, "Incoming cargo needs a new destination", site.name + " no longer has enough uncommitted demand for " + a.id + ".", "critical");
      }
    });
  }, "Direct drop-off recorded. Review any recovery alerts for affected cargo.");

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
      {activeAssignments.length ? <div className="assignment-list">{activeAssignments.slice(0,5).map(a => <AssignmentRow key={a.id} assignment={a} data={data} now={now} onMove={moveAssignment} onReroute={selectReroute} rerouteOptions={openRerouteOptions(a)} rerouteChoice={rerouteChoice} setRerouteChoice={setRerouteChoice} onDispose={(id, outcome) => mutate(next => { const result = disposeFailedCargo(next, id, outcome, Date.now()); if (!result.ok) addAlert(next, "Cargo disposition blocked", result.errors.join(" "), "critical"); return result; }, "Cargo disposition recorded.")} />)}</div> : <EmptyState title="No active assignments" detail="Run a split allocation or create a reservation to begin dispatch." />}
    </section>
    <section className="principles-grid"><article className="principle"><span className="principle-icon principle-green"><ShieldCheck size={18} /></span><div><h3>Safety gates first</h3><p>Deadline and compatibility are hard constraints.</p></div></article><article className="principle"><span className="principle-icon principle-blue"><Bike size={18} /></span><div><h3>Capacity-aware splitting</h3><p>Each rider and receiving site has committed limits.</p></div></article><article className="principle"><span className="principle-icon principle-amber"><Clock3 size={18} /></span><div><h3>Ghost claims expire</h3><p>Unconfirmed stock returns once after five minutes.</p></div></article></section>
  </div>;

  const renderBatches = () => <div className="page-content">
    <section className="page-heading"><div><p className="eyebrow">DONOR INTAKE</p><h1>Aid batches</h1><p className="page-subtitle">Register short-life food, medical supplies, and essential kits.</p></div><Badge>{data.donations.length} batches</Badge></section>
    <div className="two-column">
      <form className="surface form-card" onSubmit={addBatch}><PanelHeading eyebrow="NEW DONATION" title="Register an aid batch" detail="A safe-use deadline and pickup window are required." />
        <div className="form-grid"><Field label="Donor / organization"><input required value={batchForm.donor} onChange={e => setBatchForm(v => ({ ...v, donor: e.target.value }))} placeholder="Restaurant, pharmacy, hostel mess" /></Field><Field label="Batch name"><input required value={batchForm.name} onChange={e => setBatchForm(v => ({ ...v, name: e.target.value }))} placeholder="Prepared dinner meals" /></Field><Field label="Aid type"><select value={batchForm.type} onChange={e => setBatchForm(v => ({ ...v, type: e.target.value }))}><option value="prepared">Prepared food</option><option value="perishable">Perishable food</option><option value="raw">Raw ration kit</option><option value="medical">Medical supplies</option><option value="infant_formula">Infant formula</option><option value="essential">Essential kit</option></select></Field><Field label="Quantity (units)"><input required type="number" min="1" max="100000" value={batchForm.quantity} onChange={e => setBatchForm(v => ({ ...v, quantity: e.target.value }))} /></Field><Field label="Pickup available from"><input required type="datetime-local" value={batchForm.pickupAt} onChange={e => setBatchForm(v => ({ ...v, pickupAt: e.target.value }))} /></Field><Field label="Safe-use deadline"><input required type="datetime-local" value={batchForm.deadline} onChange={e => setBatchForm(v => ({ ...v, deadline: e.target.value }))} /></Field><Field label="Pickup location"><input required value={batchForm.location} onChange={e => setBatchForm(v => ({ ...v, location: e.target.value }))} placeholder="Donor gate / loading bay" /></Field><Field label="Handling requirements"><input value={batchForm.handling} onChange={e => setBatchForm(v => ({ ...v, handling: e.target.value }))} placeholder="Keep chilled, sealed, upright" /></Field></div><button className="primary-button" type="submit"><Plus size={15} /> Register batch</button>
      </form>
      <section className="surface"><PanelHeading eyebrow="INVENTORY LEDGER" title="Batch reconciliation" detail="Available + reserved + picked + delivered + rejected should equal original quantity." /><div className="search-row"><input type="search" aria-label="Search aid batches, donors, or aid type" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search batches, donors, or type…" /></div><div className="batch-list">{filteredDonations.length ? filteredDonations.map(d => <article className="batch-card" key={d.id}><div className="batch-card-head"><div><strong>{d.name}</strong><p>{d.donor} · {d.id}</p></div><Badge tone={remainingMinutes(d.deadline, now) <= 30 ? "danger" : "neutral"}>{remainingMinutes(d.deadline, now) + " min"}</Badge></div><div className="batch-type-line"><span className={"type-pill " + typeClass(d.type)}>{aidTypeLabel(d.type)}</span><span>{d.location}</span></div><div className="inventory-grid">{[["Available",d.available],["Reserved",d.reserved],["Picked",d.picked],["Delivered",d.delivered],["Rejected",d.rejected]].map(([label,value]) => <div key={label}><strong>{formatNumber(value)}</strong><span>{label}</span></div>)}</div><QuantityBar value={d.original-d.available} total={d.original} /><p className="handling-note">{d.handling || "No handling requirements recorded"} · Safe until {new Date(d.deadline).toLocaleString([], { dateStyle:"short", timeStyle:"short" })}</p></article>) : <EmptyState title="No matching aid batches" detail="Try a different donor, batch name, ID, or aid type." />}</div></section>
    </div>
  </div>;

  const renderDispatch = () => <div className="page-content">
    <section className="page-heading"><div><p className="eyebrow">FEASIBILITY BEFORE COMMITMENT</p><h1>Dispatch board</h1><p className="page-subtitle">Split bulk supply across riders without exceeding capacity or site demand.</p></div><Badge tone="success">Constraint engine active</Badge></section>
    <div className="two-column dispatch-columns"><form className="surface form-card" onSubmit={submitAllocation}><PanelHeading eyebrow="PLAN A DELIVERY" title="Build a feasible allocation" detail="The planner filters unsafe options, then reserves stock in rider-sized chunks." /><div className="form-grid"><Field label="Aid batch"><select required value={allocation.donationId} onChange={e => setAllocation(v => ({ ...v, donationId: e.target.value }))}>{data.donations.filter(d => d.available > 0).map(d => <option key={d.id} value={d.id}>{d.name} · {d.available} available</option>)}</select></Field><Field label="Units to allocate"><input required type="number" min="1" value={allocation.quantity} onChange={e => setAllocation(v => ({ ...v, quantity: e.target.value }))} /></Field><Field label="Estimated travel (minutes)"><input required type="number" min="1" max="600" value={allocation.travelMinutes} onChange={e => setAllocation(v => ({ ...v, travelMinutes: e.target.value }))} /></Field><Field label="Safety buffer (minutes)"><input required type="number" min="0" max="180" value={allocation.safetyBufferMinutes} onChange={e => setAllocation(v => ({ ...v, safetyBufferMinutes: e.target.value }))} /></Field></div><button className="primary-button" type="submit" disabled={!data.donations.some(d => d.available > 0)}><Zap size={15} /> Find feasible split</button><p className="form-help">Demo travel times are estimates entered by the operator, not live navigation.</p></form>
      <section className="surface"><PanelHeading eyebrow="EXPLAINABLE RESULT" title="Allocation decision" detail="Every proposed reservation is bounded by inventory, rider capacity, demand, compatibility and deadline." />
        {allocationResult ? <div className="decision-result"><div className="decision-summary"><strong>{allocationResult.allocations.reduce((sum, a) => sum + a.quantity, 0)} units reserved</strong><Badge tone={allocationResult.unallocated ? "warning" : "success"}>{allocationResult.unallocated ? allocationResult.unallocated + " unallocated" : "Target met"}</Badge></div>{allocationResult.allocations.length ? allocationResult.allocations.map(a => <div className="decision-row" key={a.reservation.id}><div><strong>{a.rider.name} → {a.shelter.name}</strong><p>{a.quantity} units · reservation {a.reservation.id}</p></div><Badge tone="warning">Awaiting confirmation</Badge></div>) : <EmptyState title="No feasible allocation" detail={(allocationResult.errors || []).join(" ") || "Try a smaller quantity or a different deadline and destination."} />}{allocationResult.errors?.length > 0 && <p className="form-help">{[...new Set(allocationResult.errors)].join(" ")}</p>}<button className="secondary-button" onClick={() => setPage("Reservations")}>Review reservations <ArrowRight size={14} /></button></div> : <EmptyState title="No plan generated yet" detail="Choose a batch, quantity, travel estimate and safety buffer, then run the planner." />}
      </section></div>
    <section className="surface section-gap"><PanelHeading eyebrow="CURRENT CARGO" title="Assignment lifecycle" detail="Confirm pickup, transit, delivery, reroute or escalation with explicit state transitions." />{data.assignments.length ? <div className="assignment-list">{data.assignments.map(a => <AssignmentRow key={a.id} assignment={a} data={data} now={now} onMove={moveAssignment} onReroute={selectReroute} rerouteOptions={openRerouteOptions(a)} rerouteChoice={rerouteChoice} setRerouteChoice={setRerouteChoice} onDispose={(id, outcome) => mutate(next => { const result = disposeFailedCargo(next, id, outcome, Date.now()); if (!result.ok) addAlert(next, "Cargo disposition blocked", result.errors.join(" "), "critical"); return result; }, "Cargo disposition recorded.")} />)}</div> : <EmptyState title="No assignments yet" detail="Confirm a reservation to create the first assignment." />}</section>
  </div>;

  const renderRiders = () => <div className="page-content"><section className="page-heading"><div><p className="eyebrow">VOLUNTEER CAPACITY</p><h1>Rider fleet</h1><p className="page-subtitle">Track transport capacity and availability without assigning beyond limits.</p></div><Badge>{data.riders.length} riders</Badge></section><div className="two-column"><form className="surface form-card" onSubmit={addRider}><PanelHeading eyebrow="ADD VOLUNTEER" title="Register a rider" /><div className="form-grid"><Field label="Rider name"><input required autoComplete="name" value={riderForm.name} onChange={e => setRiderForm(v => ({ ...v, name: e.target.value }))} /></Field><Field label="Phone number"><input required type="tel" inputMode="tel" autoComplete="tel" placeholder="+91 98765 43210" pattern="\+?[0-9 ()-]{10,20}" title="Enter 10–15 digits, optionally starting with +." value={riderForm.phone} onChange={e => setRiderForm(v => ({ ...v, phone: e.target.value }))} /></Field><Field label="Capacity (units)"><input required type="number" min="1" max="1000" step="1" value={riderForm.capacity} onChange={e => setRiderForm(v => ({ ...v, capacity: e.target.value }))} /></Field><Field label="Transport"><select value={riderForm.transport} onChange={e => setRiderForm(v => ({ ...v, transport: e.target.value }))}><option>Scooter</option><option>Bike</option><option>Car</option><option>Cycle</option><option>On foot</option></select></Field><Field label="Current zone"><input required value={riderForm.zone} onChange={e => setRiderForm(v => ({ ...v, zone: e.target.value }))} /></Field></div><button className="primary-button" type="submit"><Plus size={15} /> Add rider</button></form><section className="surface"><PanelHeading eyebrow="FLEET STATUS" title="Riders and capacity" detail="Capacity includes active assignments and unconfirmed reservations." /><div className="rider-list">{data.riders.map(r => { const used = data.assignments.filter(a => a.riderId === r.id && ["accepted","picked_up","in_transit","reroute_required","escalated"].includes(a.status)).reduce((sum,a) => sum + a.quantity,0) + pendingReservations.filter(x => x.riderId === r.id).reduce((sum,x) => sum + x.quantity,0); return <article className="rider-card" key={r.id}><span className="rider-avatar"><Bike size={17} /></span><div className="rider-main"><strong>{r.name}</strong><p>{r.transport} · {r.zone} · {r.id}</p>{r.phone && <p className="rider-phone"><a href={"tel:" + r.phone}>{r.phone}</a></p>}<QuantityBar value={used} total={r.capacity} /><small>{used} / {r.capacity} units committed</small></div><div className="rider-actions"><Badge tone={r.status === "available" ? "success" : "danger"}>{statusLabel(r.status)}</Badge><button className="small-button" onClick={() => mutate(next => { const rider = next.riders.find(x => x.id === r.id); if (rider) rider.status = rider.status === "available" ? "unavailable" : "available"; addEvent(next, "Rider availability changed", r.name + " → " + rider.status, "warning"); }, "Rider availability updated.")}>{r.status === "available" ? "Set unavailable" : "Set available"}</button></div></article>})}</div></section></div></div>;

  const renderSites = () => <div className="page-content"><section className="page-heading"><div><p className="eyebrow">DEMAND AND COMPATIBILITY</p><h1>Receiving sites</h1><p className="page-subtitle">Demand can change during transit. Resource prerequisites are hard constraints.</p></div><Badge>{data.shelters.length} sites</Badge></section><div className="two-column"><form className="surface form-card" onSubmit={addShelter}><PanelHeading eyebrow="ADD PARTNER" title="Register a receiving site" /><div className="form-grid"><Field label="Site name"><input required value={shelterForm.name} onChange={e => setShelterForm(v => ({ ...v, name: e.target.value }))} /></Field><Field label="Zone"><input required value={shelterForm.zone} onChange={e => setShelterForm(v => ({ ...v, zone: e.target.value }))} /></Field><Field label="Demand (units)"><input required type="number" min="0" value={shelterForm.demand} onChange={e => setShelterForm(v => ({ ...v, demand: e.target.value }))} /></Field></div><p className="form-subhead">Recorded site resources</p><div className="check-grid">{[["water","Clean water"],["fuel","Cooking fuel"],["coldStorage","Cold storage"],["medicalStorage","Medical storage"]].map(([key,label]) => <label key={key}><input type="checkbox" checked={shelterForm[key]} onChange={e => setShelterForm(v => ({ ...v, [key]: e.target.checked }))} /> {label}</label>)}</div><button className="primary-button" type="submit"><Plus size={15} /> Add receiving site</button></form><section className="surface"><PanelHeading eyebrow="PARTNER NETWORK" title="Site demand and resources" detail="Direct drop-offs reduce unmet demand immediately." /><div className="site-list">{data.shelters.map(s => <article className="site-card" key={s.id}><div className="site-card-top"><div><strong>{s.name}</strong><p>{s.zone} · {s.id}</p></div><Badge tone={s.status === "closed" ? "danger" : s.status === "limited" ? "warning" : "success"}>{statusLabel(s.status)}</Badge></div><div className="site-demand"><div><span>Demand</span><strong>{s.demand}</strong></div><div><span>Delivered</span><strong>{s.delivered}</strong></div><div><span>Unmet demand</span><strong>{shelterRemaining(data, s.id)}</strong></div></div><div className="site-resources"><Badge tone={s.water ? "success" : "danger"}>Water {s.water ? "yes" : "no"}</Badge><Badge tone={s.fuel ? "success" : "danger"}>Fuel {s.fuel ? "yes" : "no"}</Badge><Badge tone={s.coldStorage ? "success" : "danger"}>Cold chain {s.coldStorage ? "yes" : "no"}</Badge><Badge tone={s.medicalStorage ? "success" : "danger"}>Medical storage {s.medicalStorage ? "yes" : "no"}</Badge></div><div className="site-actions"><button className="small-button" onClick={() => { const raw = window.prompt("How many units of direct aid were delivered to " + s.name + "?", "50"); if (raw === null) return; const quantity = Number(raw); if (!Number.isInteger(quantity) || quantity <= 0) return showToast("Direct drop-off must be a positive whole number of units."); recordDirectDrop(s.id, quantity); }}>Record direct drop-off</button><button className="small-button" onClick={() => changeSiteStatus(s.id, s.status === "closed" ? "open" : "closed")}>{s.status === "closed" ? "Reopen site" : "Close site"}</button><button className="small-button" onClick={() => { const raw = window.prompt("Update total demand for " + s.name + " (delivered: " + s.delivered + ")", String(s.demand)); if (raw === null || !Number.isInteger(Number(raw)) || Number(raw) < s.delivered) return showToast("Demand must be a whole number no lower than already delivered units."); mutate(next => { const site = next.shelters.find(x => x.id === s.id); site.demand = Number(raw); addEvent(next, "Site demand updated", site.name + " demand → " + site.demand, "warning"); if (site.demand <= site.delivered) site.status = "limited"; next.assignments.filter(a => a.shelterId === s.id && ["picked_up","in_transit"].includes(a.status) && site.demand - site.delivered < a.quantity).forEach(a => { a.status = "reroute_required"; a.history.push("destination_demand_filled"); addAlert(next, "Demand changed in transit", site.name + " no longer has enough unmet demand for " + a.id + ".", "critical"); }); }, "Site demand updated."); }}>Edit demand</button></div></article>)}</div></section></div></div>;

  const renderReservations = () => <div className="page-content"><section className="page-heading"><div><p className="eyebrow">TIME-BOUND COMMITMENTS</p><h1>Reservations</h1><p className="page-subtitle">Pending claims expire after five minutes; the countdown runs automatically in this browser.</p></div><button className="secondary-button" onClick={() => mutate(next => { expireReservations(next, Date.now()); expireAidBatches(next, Date.now()); }, "Expired reservations and aid deadlines checked.")}><RotateCcw size={14} /> Check expiry now</button></section>{allocationResult?.allocations?.length > 0 && <section className="surface allocation-notice"><strong>Latest plan</strong><p>{allocationResult.allocations.reduce((sum,a) => sum + a.quantity,0)} units reserved; {allocationResult.unallocated} units unallocated. Confirm each reservation before pickup.</p></section>}<section className="surface"><PanelHeading eyebrow="CLAIM QUEUE" title="Reservations and timeouts" detail="Stock stays reserved until confirmation, expiry, or explicit cancellation before pickup." /><div className="reservation-list">{data.reservations.length ? data.reservations.map(r => { const d = data.donations.find(x => x.id === r.donationId); const rider = data.riders.find(x => x.id === r.riderId); const site = data.shelters.find(x => x.id === r.shelterId); const mins = Math.ceil((new Date(r.expiresAt).getTime() - now) / 60000); return <article className="reservation-card" key={r.id}><div className="reservation-main"><div className="reservation-head"><strong>{r.id}</strong><Badge tone={r.status === "pending" ? "warning" : r.status === "expired" ? "danger" : r.status === "delivered" ? "success" : "neutral"}>{statusLabel(r.status)}</Badge></div><h3>{d?.name || r.donationId}</h3><p>{r.quantity} units · {rider?.name || r.riderId} → {site?.name || r.shelterId}</p>{["pending", "confirmed"].includes(r.status) && <p className="countdown">{mins > 0 ? (r.status === "confirmed" ? "Pickup deadline in about " : "Claim expires in about ") + mins + " min" : "Expiry processing…"} · automatic stock release enabled</p>}</div><div className="reservation-actions">{r.status === "pending" && <button className="primary-button" onClick={() => confirm(r.id)}><CheckCircle2 size={14} /> Confirm claim</button>}{r.status === "confirmed" && <span className="muted-note">Awaiting pickup confirmation in dispatch board.</span>}</div></article>}) : <EmptyState title="No reservations yet" detail="Run a dispatch plan to create a time-limited claim." />}</div></section></div>;

  const renderAlerts = () => <div className="page-content"><section className="page-heading"><div><p className="eyebrow">EXCEPTIONS AND TRACEABILITY</p><h1>Alerts & audit</h1><p className="page-subtitle">Blocked decisions, reservation releases and recovery actions remain traceable.</p></div><Badge>{data.alerts.filter(a => a.status === "open").length} open alerts</Badge></section><section className="surface"><PanelHeading eyebrow="ALERT CENTER" title="Operational exceptions" detail="Resolve an alert only after its operational issue has been reviewed." />{data.alerts.length ? <div className="event-list">{data.alerts.map(a => <article className="event-row" key={a.id}><span className={"event-icon event-" + a.level}>{a.level === "critical" ? <AlertTriangle size={17} /> : a.level === "warning" ? <Clock3 size={17} /> : <Activity size={17} />}</span><div className="event-main"><strong>{a.title}</strong><p>{a.detail}</p><small>{new Date(a.at).toLocaleString()}</small></div><div className="event-actions"><Badge tone={a.level === "critical" ? "danger" : a.level === "warning" ? "warning" : "neutral"}>{a.level}</Badge>{a.status === "open" && <button className="small-button" onClick={() => mutate(next => { const item = next.alerts.find(x => x.id === a.id); if (item) item.status = "resolved"; addEvent(next, "Alert resolved", a.title); }, "Alert marked reviewed.")}>Resolve</button>}</div></article>)}</div> : <EmptyState title="No active alerts" detail="Safety blocks and scenario failures will be recorded here." />}</section><section className="surface section-gap"><PanelHeading eyebrow="AUDIT TRAIL" title="Recent decisions" detail="Synthetic event records are stored in this browser." /><div className="event-list">{data.audit.slice(0,80).map(e => <article className="audit-row" key={e.id}><span className="audit-time">{new Date(e.at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span><div><strong>{e.action}</strong><p>{e.detail}</p></div><Badge tone={e.level === "critical" ? "danger" : e.level === "warning" ? "warning" : "neutral"}>{e.level || "info"}</Badge></article>)}</div></section></div>;

  const renderScenarios = () => <div className="page-content"><section className="page-heading"><div><p className="eyebrow">JUDGE-READY FAILURE SIMULATION</p><h1>Resilience lab</h1><p className="page-subtitle">Run the exact failure modes from the problem statement against synthetic records.</p></div><button className="secondary-button" onClick={resetDemo}><RotateCcw size={14} /> Reset scenario data</button></section><section className="scenario-grid">{[
    ["expiry","01","Urgent safe-use deadline","Prioritise the batch closest to expiry without bypassing travel and safety margin.",Clock3],
    ["split","02","Split 180 meals","Allocate 180 meals across riders capped at 40 units each.",Boxes],
    ["ghost","03","Unresponsive volunteer","Simulate a 30-minute ghost claim; expire the five-minute reservation and release stock once.",XCircle],
    ["direct-drop","04","Direct drop fills demand","A direct community drop-off fills Shelter A's demand while a rider is carrying 40 meals.",Truck],
    ["closure","05","Shelter closes in transit","Close the destination after pickup and review safe alternate sites or escalate.",Warehouse],
    ["resources","06","Missing cooking resources","Block raw ration kits from a site without clean water or cooking fuel.",ShieldCheck]
  ].map(([key,num,title,detail,Icon]) => <button className="scenario-card" key={key} onClick={() => runDemoScenario(key)}><span className="scenario-number">{num}</span><span className="scenario-icon"><Icon size={19} /></span><strong>{title}</strong><p>{detail}</p><span className="scenario-run">Run scenario <ArrowRight size={14} /></span></button>)}</section><section className="surface section-gap"><PanelHeading eyebrow="SCENARIO OUTPUT" title="Execution log" detail="Each run reports the rule applied and any resulting state changes." />{data.scenarioLog.length ? <div className="scenario-results">{data.scenarioLog.map(s => <article className="scenario-result" key={s.id}><div className="scenario-result-head"><div><strong>{s.title}</strong><small>{new Date(s.at).toLocaleString()}</small></div><Badge tone="success">Executed</Badge></div><ul>{s.lines.map((line,index) => <li key={index}>{line}</li>)}</ul></article>)}</div> : <EmptyState title="No scenarios run" detail="Choose one of the six simulations above to see the engine respond to operational uncertainty." />}</section></div>;

  const pageContent = {
    Overview: renderOverview, "Aid batches": renderBatches, "Dispatch board": renderDispatch,
    Riders: renderRiders, "Receiving sites": renderSites, Reservations: renderReservations,
    "Alerts & audit": renderAlerts, "Resilience lab": renderScenarios
  }[page]();
  const pageWithRelatedLinks = <div className="page-route" id={pageRoutes[page]}>{pageContent}<RelatedLinks page={page} onNavigate={navigateTo} /></div>;

  if (isThankYouPath) return <ThankYouPage />;
  if (isNotFoundPath) return <main className="not-found-page">
    <a href="/" className="not-found-brand" aria-label="AidFlow home"><span className="not-found-mark"><AidFlowMark /></span><span><strong>AidFlow</strong><small>CIVIC MICRO-LOGISTICS</small></span></a>
    <section className="not-found-content" aria-labelledby="not-found-title">
      <p className="not-found-code">ERROR 404 · ROUTE NOT FOUND</p>
      <h1 id="not-found-title">This route has<br /><em>gone missing.</em></h1>
      <p className="not-found-copy">We couldn’t find the page you’re looking for. The address may be incorrect, or the page may have moved. Your aid operations are still one step away.</p>
      <div className="not-found-actions">
        <a className="not-found-primary" href="/">Return to homepage <ArrowRight size={16} aria-hidden="true" /></a>
        <a className="not-found-secondary" href="/?section=overview">Open operations</a>
      </div>
      <div className="not-found-links"><span>GO TO A SECTION</span>
        <a className="not-found-section-link" href="/?section=aid-batches">Aid batches <ArrowRight size={13} aria-hidden="true" /></a>
        <a className="not-found-section-link" href="/?section=dispatch-board">Dispatch board <ArrowRight size={13} aria-hidden="true" /></a>
        <a className="not-found-section-link" href="/?section=resilience-lab">Resilience lab <ArrowRight size={13} aria-hidden="true" /></a>
      </div>
    </section>
    <footer className="not-found-footer"><span>© {new Date().getFullYear()} AidFlow</span><span>Built around safer handovers.</span></footer>
  </main>;
  if (!entered) return <LandingPage onEnter={() => { try { sessionStorage.setItem("aidflow-entered", "1"); } catch {} setEntered(true); }} onExplore={() => { try { sessionStorage.setItem("aidflow-entered", "1"); } catch {} setPage("Resilience lab"); setEntered(true); }} />;

  return <div className={"app-shell" + (mobileMenuOpen ? " mobile-nav-open" : "")}>
    {isMobileNavViewport && mobileMenuOpen && <button className="mobile-nav-backdrop" type="button" aria-label="Close navigation menu" onClick={() => { setMobileMenuOpen(false); mobileMenuButtonRef.current?.focus(); }} />}
    <aside className={"sidebar" + (mobileMenuOpen ? " is-mobile-open" : "")} id="primary-navigation-panel" ref={mobileNavRef} aria-label="Workspace navigation" aria-hidden={isMobileNavViewport && !mobileMenuOpen ? true : undefined} inert={isMobileNavViewport && !mobileMenuOpen ? "" : undefined}>
      <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); navigateTo("Overview"); }} aria-label="AidFlow home — Overview"><span className="brand-mark"><AidFlowMark /></span><span className="brand-copy"><strong>aidflow</strong><small>CIVIC OPERATIONS</small></span></a>
      {isMobileNavViewport && <button className="mobile-drawer-close" type="button" aria-label="Close navigation menu" onClick={() => { setMobileMenuOpen(false); mobileMenuButtonRef.current?.focus(); }}><XCircle size={20} aria-hidden="true" /></button>}
      <div className="workspace-label">WORKSPACE</div>
      <nav className="primary-nav" aria-label="Primary navigation">{navItems.map(([label, Icon]) => <button className={"nav-item " + (page === label ? "is-active" : "")} key={label} type="button" onClick={() => navigateTo(label)} aria-current={page === label ? "page" : undefined}><Icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>{label === "Dispatch board" && <span className="nav-count" aria-label={activeAssignments.length + " active assignments"}>{activeAssignments.length}</span>}{label === "Reservations" && <span className="nav-count" aria-label={pendingReservations.length + " pending reservations"}>{pendingReservations.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><button className="back-home-button" type="button" onClick={returnToLanding}><ArrowLeft size={16} aria-hidden="true" /><span>Back to home</span></button><div className="safety-note"><span className="safety-icon"><ShieldCheck size={17} /></span><div><strong>Safety-first dispatch</strong><p>Time, capacity and compatibility are hard constraints.</p></div></div><button className="profile-button" type="button" onClick={resetDemo}><span className="avatar">DEMO</span><span className="profile-copy"><strong>Demo workspace</strong><small>Browser-local simulation</small></span><RotateCcw size={16} className="profile-settings" /></button></div>
    </aside>
    <main className="main-content" id="overview"><header className="topbar">
      {isMobileNavViewport && <button ref={mobileMenuButtonRef} className="mobile-menu-toggle" type="button" aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"} aria-expanded={mobileMenuOpen} aria-controls="primary-navigation-panel" onClick={() => setMobileMenuOpen(open => !open)}><span className="mobile-menu-icon" aria-hidden="true">{mobileMenuOpen ? <XCircle size={20} /> : <span className="hamburger-lines"><i /><i /><i /></span>}</span><span className="mobile-menu-label">{mobileMenuOpen ? "Close" : "Menu"}</span></button>}
      <div className="breadcrumb"><PageLink to="Overview" onNavigate={navigateTo} className="breadcrumb-home">AidFlow</PageLink><span className="breadcrumb-slash">/</span><strong aria-live="polite">{page}</strong></div><div className="topbar-right"><span className="environment-chip"><span className="status-dot" /> DEMO ENVIRONMENT</span><span className="topbar-avatar" aria-label="Operations user">AO</span></div>
    </header><div className="page-wrap">{pageWithRelatedLinks}<footer className="app-footer"><div className="app-footer-main"><div className="app-footer-brand"><span className="app-footer-brand-name"><span className="footer-mark"><AidFlowMark /></span><strong>AidFlow</strong><span className="footer-separator">/</span><span>Civic micro-logistics</span></span><p>Moving surplus food and essential aid with safety-first coordination.</p><span className="app-footer-disclaimer">Prototype demo · Synthetic data · Browser-local state · No live dispatch</span></div><nav className="footer-nav" aria-label="Quick links"><PageLink to="Overview" onNavigate={navigateTo} className="footer-nav-link">Overview</PageLink><PageLink to="Aid batches" onNavigate={navigateTo} className="footer-nav-link">Aid batches</PageLink><PageLink to="Dispatch board" onNavigate={navigateTo} className="footer-nav-link">Dispatch board</PageLink><PageLink to="Reservations" onNavigate={navigateTo} className="footer-nav-link">Reservations</PageLink><PageLink to="Resilience lab" onNavigate={navigateTo} className="footer-nav-link">Resilience lab</PageLink></nav></div><div className="app-footer-bottom"><span>© {new Date().getFullYear()} AidFlow. All rights reserved.</span><span>Built for safer, more accountable civic aid coordination.</span></div></footer></div></main>
    {toast && <div className={"toast-message " + (toastKind === "error" ? "toast-error" : "")} role={toastKind === "error" ? "alert" : "status"} aria-live={toastKind === "error" ? "assertive" : "polite"} aria-atomic="true">{toast}</div>}
  </div>;
}

function AssignmentRow({ assignment, data, now, onMove, onReroute, rerouteOptions, rerouteChoice, setRerouteChoice, onDispose }) {
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
  return <article className="assignment-card"><div className="assignment-top"><div><span className="assignment-id">{assignment.id}</span><h3>{d?.name || assignment.donationId}</h3></div><Badge tone={assignment.status === "delivered" ? "success" : ["failed","escalated"].includes(assignment.status) ? "danger" : ["in_transit","reroute_required"].includes(assignment.status) ? "warning" : "neutral"}>{statusLabel(assignment.status)}</Badge></div><div className="assignment-route"><div><span>RIDER</span><strong>{r?.name || assignment.riderId}</strong></div><ArrowRight size={15} /><div><span>DESTINATION</span><strong>{s?.name || assignment.shelterId}</strong></div><div className="route-quantity"><strong>{assignment.quantity}</strong><span>units</span></div></div><div className="assignment-deadline"><Clock3 size={14} /> Safe-use deadline in {remainingMinutes(assignment.deadline, now)} min · route estimate {assignment.travelMinutes} min</div>{assignment.history?.length > 0 && <p className="assignment-history">{assignment.history.join(" → ")}</p>}{options.length > 0 && <div className="assignment-controls">{options.map(([status,label]) => <button key={status} className={status === "delivered" ? "primary-button" : "small-button"} onClick={() => onMove(assignment.id, status)}>{label}</button>)}</div>}{assignment.status === "failed" && <div className="assignment-controls"><button className="small-button" onClick={() => onDispose(assignment.id, "spoiled")}>Mark spoiled</button><button className="small-button" onClick={() => onDispose(assignment.id, "rejected")}>Mark rejected</button></div>}{assignment.status === "reroute_required" && <div className="reroute-controls"><label className="field"><span>Feasible alternate destination</span><select value={rerouteChoice[assignment.id] || ""} onChange={e => setRerouteChoice(prev => ({ ...prev, [assignment.id]: e.target.value }))}><option value="">Choose site…</option>{rerouteOptions.map(site => <option key={site.id} value={site.id}>{site.name} · {shelterRemaining(data, site.id)} demand</option>)}</select></label><button className="primary-button" disabled={!rerouteChoice[assignment.id]} onClick={() => onReroute(assignment.id, rerouteChoice[assignment.id])}>Approve reroute</button>{rerouteOptions.length === 0 && <p className="danger-note">No safe alternate destination. Escalate rather than discard cargo or mark it delivered.</p>}</div>}</article>;
}
