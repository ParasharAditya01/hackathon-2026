import { Activity, AlertTriangle, ArrowUpRight, Bike, Boxes, Clock3, Command, HandHeart, LayoutDashboard, MapPinned, PackageCheck, Settings2, ShieldCheck, Warehouse } from "lucide-react";

const navigation = [
  { label: "Overview", icon: LayoutDashboard, active: true },
  { label: "Aid batches", icon: Boxes },
  { label: "Dispatch board", icon: MapPinned },
  { label: "Riders", icon: Bike },
  { label: "Receiving sites", icon: Warehouse },
];

function Sidebar() {
  return <aside className="sidebar">
    <a className="brand" href="#" aria-label="AidFlow home">
      <span className="brand-mark"><HandHeart size={21} /></span>
      <span className="brand-copy"><strong>aidflow</strong><small>CIVIC OPERATIONS</small></span>
    </a>
    <div className="workspace-label">WORKSPACE</div>
    <nav className="primary-nav" aria-label="Primary navigation">
      {navigation.map(({ label, icon: Icon, active }) => <button className={`nav-item ${active ? "is-active" : ""}`} key={label} type="button" disabled={!active} aria-current={active ? "page" : undefined}>
        <Icon size={18} strokeWidth={1.8} /><span>{label}</span>{label === "Dispatch board" && <span className="nav-count">0</span>}
      </button>)}
    </nav>
    <div className="sidebar-bottom">
      <div className="safety-note"><span className="safety-icon"><ShieldCheck size={17} /></span><div><strong>Safety-first dispatch</strong><p>Every route must pass deadline and compatibility checks.</p></div></div>
      <button className="profile-button" type="button" disabled><span className="avatar">AO</span><span className="profile-copy"><strong>Operations team</strong><small>Demo workspace</small></span><Settings2 size={17} className="profile-settings" /></button>
    </div>
  </aside>;
}

function MetricCard({ label, value, detail, icon: Icon, tone = "neutral" }) {
  return <article className="metric-card"><div className="metric-topline"><span>{label}</span><span className={`metric-icon tone-${tone}`}><Icon size={17} /></span></div><div className="metric-value">{value}</div><p className="metric-detail">{detail}</p></article>;
}

function EmptyBoard() {
  return <div className="empty-board"><div className="empty-icon"><PackageCheck size={23} /></div><h3>Operations data will appear here</h3><p>The foundation is ready. The next phase adds donation batches, rider capacity, shelter demand, and dispatch decisions.</p></div>;
}

export default function App() {
  return <div className="app-shell">
    <Sidebar />
    <main className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>Overview</strong></div><div className="topbar-right"><span className="environment-chip"><span className="status-dot" /> DEMO ENVIRONMENT</span><button className="icon-button" type="button" aria-label="Activity log" disabled><Activity size={18} /></button><span className="topbar-avatar" aria-label="Operations user">AO</span></div></header>
      <div className="page-wrap">
        <section className="page-heading"><div><p className="eyebrow">CIVIC AID NETWORK <span className="eyebrow-line" /></p><h1>Operations overview</h1><p className="page-subtitle">Coordinate urgent surplus. Protect every handover.</p></div><div className="date-stamp"><Clock3 size={15} /><span>Simulation clock pending</span></div></section>
        <section className="readiness-banner" aria-label="Foundation status"><div className="readiness-symbol"><Command size={20} /></div><div className="readiness-copy"><strong>Dispatch foundation initialized</strong><p>Safety constraints are documented. Operational data and dispatch actions are next.</p></div><span className="readiness-tag">PHASE 02</span></section>
        <section className="metrics-grid" aria-label="Operations metrics">
          <MetricCard label="Active batches" value="--" detail="Awaiting donation data" icon={Boxes} tone="green" />
          <MetricCard label="Available riders" value="--" detail="Capacity not yet loaded" icon={Bike} tone="blue" />
          <MetricCard label="At-risk aid" value="--" detail="Expiry monitoring pending" icon={AlertTriangle} tone="amber" />
          <MetricCard label="Safe deliveries" value="--" detail="No deliveries recorded" icon={ShieldCheck} tone="neutral" />
        </section>
        <section className="board-section"><div className="section-heading"><div><h2>Dispatch activity</h2><p>Assignment and recovery events will be tracked here.</p></div><span className="activity-state"><span className="state-ring" /> Awaiting first event</span></div><EmptyBoard /></section>
        <section className="principles-grid" aria-label="Dispatch principles">
          <article className="principle"><span className="principle-icon principle-green"><ShieldCheck size={18} /></span><div><h3>Safety gates first</h3><p>Expiry and aid compatibility are hard constraints.</p></div><ArrowUpRight size={16} className="principle-arrow" /></article>
          <article className="principle"><span className="principle-icon principle-blue"><Bike size={18} /></span><div><h3>Capacity-aware allocation</h3><p>Assignments must fit riders and receiving demand.</p></div><ArrowUpRight size={16} className="principle-arrow" /></article>
          <article className="principle"><span className="principle-icon principle-amber"><Clock3 size={18} /></span><div><h3>Reservations expire</h3><p>Unconfirmed claims must release capacity.</p></div><ArrowUpRight size={16} className="principle-arrow" /></article>
        </section>
        <footer className="app-footer"><span><span className="footer-mark"><HandHeart size={13} /></span> AidFlow <span className="footer-separator">/</span> Civic micro-logistics</span><span>Prototype foundation · Synthetic data only</span></footer>
      </div>
    </main>
  </div>;
}
