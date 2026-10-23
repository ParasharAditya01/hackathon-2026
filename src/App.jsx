import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowRight, Bike, Boxes, CheckCircle2, Clock3, HandHeart, LayoutDashboard, MapPinned, PackagePlus, RefreshCw, ShieldCheck, Warehouse, Zap } from "lucide-react";
import { allocateBatch, releaseExpiredReservations, rerouteAssignment } from "./lib/dispatch.js";

const future = (minutes) => new Date(Date.now() + minutes * 60000).toISOString();
const seedBatches = [
  { id:"FD-104", donor:"Mango Tree Banquets", type:"meals", quantity:180, remaining:180, deadline:future(75), requires:[], status:"available", pickup:"Koregaon Park" },
  { id:"FD-105", donor:"Campus Mess North", type:"meals", quantity:64, remaining:64, deadline:future(42), requires:[], status:"available", pickup:"Shivajinagar" },
  { id:"RK-021", donor:"Community Relief Store", type:"ration", quantity:30, remaining:30, deadline:future(180), requires:["clean-water","cooking-fuel"], status:"available", pickup:"Deccan" }
];
const seedRiders = [
  {id:"R-01",name:"Aarav S.",capacity:40,status:"available",lastSeen:"Just now"},
  {id:"R-02",name:"Meera K.",capacity:35,status:"available",lastSeen:"1 min ago"},
  {id:"R-03",name:"Kabir P.",capacity:25,status:"available",lastSeen:"2 min ago"}
];
const seedShelters = [
  {id:"SH-A",name:"Hope Night Shelter",status:"open",demand:{meals:50,ration:10},resources:["clean-water","cooking-fuel"],area:"Camp"},
  {id:"SH-B",name:"Riverbank Relief Camp",status:"open",demand:{meals:90,ration:20},resources:["clean-water"],area:"Yerawada"},
  {id:"SH-C",name:"Sakhi Community Centre",status:"open",demand:{meals:35,ration:15},resources:["clean-water","cooking-fuel"],area:"Kothrud"}
];
const initialEvents = [{id:1,time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),title:"AidFlow operations session started",detail:"Synthetic demonstration data loaded.",kind:"info"}];
const fmt = (iso) => { const n=Math.floor((new Date(iso).getTime()-Date.now())/60000); return n<=0?"Expired":`${n} min left`; };
const labelStatus = (s) => ({available:"Available",reserved:"Reserved",in_transit:"In transit",delivered:"Delivered",released:"Released",escalated:"Needs intervention",closed:"Closed"}[s] || s);

function Status({value}) { return <span className={`status status-${value}`}><i />{labelStatus(value)}</span>; }
function Metric({label,value,note,icon:Icon,tone}) { return <article className="metric-card"><div className="metric-topline"><span>{label}</span><span className={`metric-icon tone-${tone}`}><Icon size={17}/></span></div><div className="metric-value">{value}</div><p className="metric-detail">{note}</p></article>; }

export default function App() {
  const [batches,setBatches] = useState(seedBatches);
  const [riders,setRiders] = useState(seedRiders);
  const [shelters,setShelters] = useState(seedShelters);
  const [assignments,setAssignments] = useState([]);
  const [events,setEvents] = useState(initialEvents);
  const [tab,setTab] = useState("Overview");
  const [notice,setNotice] = useState("");
  const [draft,setDraft] = useState({donor:"",type:"meals",quantity:"40",minutes:"45",pickup:"Local donor"});
  const [selectedBatch,setSelectedBatch] = useState("FD-104");
  const [selectedRider,setSelectedRider] = useState("R-01");
  const [selectedShelter,setSelectedShelter] = useState("SH-A");

  const addEvent = (title,detail,kind="info") => setEvents((prev)=>[{id:Date.now()+Math.random(),time:new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),title,detail,kind},...prev].slice(0,12));
  const announce = (message) => {setNotice(message); window.setTimeout(()=>setNotice(""),4500);};
  const activeBatches = batches.filter(b=>b.status==="available"&&b.remaining>0).length;
  const atRisk = batches.filter(b=>b.status==="available"&&new Date(b.deadline).getTime()-Date.now()<30*60000).length;
  const delivered = assignments.filter(a=>a.state==="delivered").length;
  const currentBatch = batches.find(b=>b.id===selectedBatch);
  const activeAssignments = assignments.filter(a=>["reserved","in_transit","escalated"].includes(a.state));
  const demandAvailableShelters = (excludeAssignmentId = null) => shelters.map(s => {
    const held = assignments.filter(a => a.id !== excludeAssignmentId && ["reserved","in_transit","escalated"].includes(a.state) && a.shelterId === s.id)
      .reduce((tot,a) => { const b=batches.find(x=>x.id===a.batchId); if(b) tot[b.type]=(tot[b.type]||0)+a.quantity; return tot; }, {});
    return {...s,demand:Object.fromEntries(Object.entries(s.demand).map(([type,qty])=>[type,Math.max(0,qty-(held[type]||0))]))};
  });
  const nav = [{label:"Overview",icon:LayoutDashboard},{label:"Aid batches",icon:Boxes},{label:"Dispatch board",icon:MapPinned},{label:"Riders",icon:Bike},{label:"Receiving sites",icon:Warehouse}];

  function createBatch(e) {
    e.preventDefault();
    const quantity=Number(draft.quantity), minutes=Number(draft.minutes);
    if(!draft.donor.trim()||!Number.isFinite(quantity)||quantity<1||!Number.isFinite(minutes)||minutes<1){announce("Enter a donor, positive quantity and valid expiry window.");return;}
    const id=`FD-${Math.floor(106+Math.random()*890)}`;
    const batch={id,donor:draft.donor.trim(),type:draft.type,quantity,remaining:quantity,deadline:future(minutes),requires:draft.type==="ration"?["clean-water","cooking-fuel"]:[],status:"available",pickup:draft.pickup.trim()||"Unspecified"};
    setBatches(prev=>[batch,...prev]);setSelectedBatch(id);addEvent("Donation batch registered",`${id}: ${quantity} ${draft.type} from ${batch.donor}`);setDraft({donor:"",type:"meals",quantity:"40",minutes:"45",pickup:"Local donor"});setTab("Aid batches");announce("Batch added to the live demo state.");
  }
  function allocate() {
    const batch=batches.find(b=>b.id===selectedBatch), rider=riders.find(r=>r.id===selectedRider), shelter=demandAvailableShelters().find(s=>s.id===selectedShelter);
    if(!batch||!rider||!shelter){announce("Select a batch, rider and receiving site.");return;}
    const quantity=Math.min(batch.remaining,rider.capacity,shelter.demand[batch.type]||0);
    const result=allocateBatch({...batch,remaining:quantity},[rider],[shelter],15);
    if(!result.assignments.length){const why=result.rejected.flatMap(x=>x.reasons).join("; ")||"No eligible capacity or demand";addEvent("Dispatch blocked",why,"warning");announce(`Dispatch blocked: ${why}`);return;}
    const assignment={...result.assignments[0],quantity,state:"reserved"};
    setAssignments(prev=>[assignment,...prev]);setBatches(prev=>prev.map(b=>b.id===batch.id?{...b,remaining:b.remaining-quantity,status:b.remaining-quantity===0?"reserved":"available"}:b));
    setRiders(prev=>prev.map(r=>r.id===rider.id?{...r,status:"reserved"}:r));
    addEvent("Reservation created",`${quantity} ${batch.type} → ${shelter.name} with ${rider.name}. Claim expires in 5 minutes.`);announce(`Reserved ${quantity} units. Confirm pickup or test timeout recovery.`);
  }
  function splitBatch() {
    const batch=batches.find(b=>b.id===selectedBatch);
    if(!batch){announce("Choose a batch first.");return;}
    const result=allocateBatch(batch,riders,demandAvailableShelters(),15);
    if(!result.assignments.length){announce("No safe allocation found. Check capacity, demand, expiry and prerequisites.");addEvent("Split allocation blocked","No eligible rider/site combinations.","warning");return;}
    const created=result.assignments.map(a=>({...a,state:"reserved"}));
    const used=created.reduce((n,a)=>n+a.quantity,0);
    setAssignments(prev=>[...created,...prev]);setBatches(prev=>prev.map(b=>b.id===batch.id?{...b,remaining:result.remaining,status:result.remaining===0?"reserved":"available"}:b));
    const riderIds=new Set(created.map(a=>a.riderId));setRiders(prev=>prev.map(r=>riderIds.has(r.id)?{...r,status:"reserved"}:r));
    addEvent("Batch split across riders",`${used} units reserved across ${created.length} assignment(s); ${result.remaining} remain unallocated.`);announce(`Created ${created.length} assignment(s), allocating ${used} units. ${result.remaining} remain.`);
  }
  function timeoutReservations() {
    const now=Date.now();
    const expired=releaseExpiredReservations(assignments.map(a=>a.state==="reserved"?{...a,expiresAt:new Date(now-1000).toISOString()}:a),now);
    const freed=expired.filter(a=>a.state==="released"&&assignments.some(old=>old.id===a.id&&old.state==="reserved"));
    if(!freed.length){announce("No active reservations to release.");return;}
    setAssignments(expired);
    setBatches(prev=>prev.map(b=>({...b,remaining:Math.min(b.quantity,b.remaining+freed.filter(a=>a.batchId===b.id).reduce((n,a)=>n+a.quantity,0)),status:"available"})));
    const ids=new Set(freed.map(a=>a.riderId));setRiders(prev=>prev.map(r=>ids.has(r.id)?{...r,status:"available"}:r));
    addEvent("Reservation timeout simulated",`${freed.length} unconfirmed reservation(s) expired; stock and riders returned to the pool.`,"warning");announce(`Expired ${freed.length} reservation(s). Capacity is available again.`);
  }
  function sendInTransit(id) {
    setAssignments(prev=>prev.map(a=>a.id===id?{...a,state:"in_transit"}:a));
    const a=assignments.find(x=>x.id===id);if(a){setRiders(prev=>prev.map(r=>r.id===a.riderId?{...r,status:"in_transit"}:r));addEvent("Pickup confirmed",`${id} marked in transit. Shelter demand will be checked again at arrival.`);announce("Assignment marked in transit.");}
  }
  function closeDemandAndRecover() {
    const target=assignments.find(a=>a.state==="in_transit")||assignments.find(a=>a.state==="reserved");
    if(!target){announce("Create an assignment and mark it in transit first.");return;}
    const original=shelters.find(s=>s.id===target.shelterId);
    setShelters(prev=>prev.map(s=>s.id===target.shelterId?{...s,status:"closed",demand:{...s.demand,[batches.find(b=>b.id===target.batchId)?.type||"meals"]:0}}:s));
    const batch=batches.find(b=>b.id===target.batchId);
    const rerouteSites=demandAvailableShelters(target.id).map(s=>s.id===target.shelterId?{...s,status:"closed",demand:{...s.demand,[batch?.type||"meals"]:0}}:s);
    const recovered=rerouteAssignment(target,rerouteSites,batch,12);
    setAssignments(prev=>prev.map(a=>a.id===target.id?recovered:a));
    addEvent(recovered.state==="escalated"?"Reroute needs intervention":"Shelter demand changed; rerouted",`${original?.name||"Original site"} closed to this aid. ${recovered.reason}.`,recovered.state==="escalated"?"warning":"success");
    announce(recovered.state==="escalated"?"No safe fallback. Assignment escalated for coordinator review.":"Demand changed; assignment rerouted to a compatible site.");
  }
  function confirmDelivery(id) {
    const a=assignments.find(x=>x.id===id), batch=batches.find(b=>b.id===a?.batchId), shelter=shelters.find(s=>s.id===a?.shelterId);
    if(!a||!batch||!shelter||shelter.status!=="open"||(shelter.demand[batch.type]||0)<a.quantity){announce("Delivery blocked: receiving site is closed or demand has changed.");return;}
    if(batch.type==="meals"&&new Date(batch.deadline).getTime()<Date.now()){announce("Delivery blocked: batch expiry has passed. Do not distribute.");setAssignments(prev=>prev.map(x=>x.id===id?{...x,state:"escalated",reason:"Expired before delivery"}:x));return;}
    setAssignments(prev=>prev.map(x=>x.id===id?{...x,state:"delivered"}:x));
    setShelters(prev=>prev.map(s=>s.id===shelter.id?{...s,demand:{...s.demand,[batch.type]:Math.max(0,(s.demand[batch.type]||0)-a.quantity)}}:s));
    setRiders(prev=>prev.map(r=>r.id===a.riderId?{...r,status:"available"}:r));addEvent("Delivery recorded",`${a.quantity} ${batch.type} received by ${shelter.name}. Demo record only.`,"success");announce("Delivery recorded in the local demo state.");
  }
  const visibleBatches=useMemo(()=>batches,[batches]);
  const heading=tab==="Overview"?"Operations overview":tab;
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#overview" onClick={()=>setTab("Overview")}><span className="brand-mark"><HandHeart size={21}/></span><span className="brand-copy"><strong>aidflow</strong><small>CIVIC OPERATIONS</small></span></a>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="primary-nav" aria-label="Primary navigation">{nav.map(({label,icon:Icon})=><button key={label} className={`nav-item ${tab===label?"is-active":""}`} onClick={()=>setTab(label)} type="button"><Icon size={18}/><span>{label}</span>{label==="Dispatch board"&&<span className="nav-count">{activeAssignments.length}</span>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="safety-note"><span className="safety-icon"><ShieldCheck size={17}/></span><div><strong>Safety-first dispatch</strong><p>Expiry, capacity and compatibility are hard constraints.</p></div></div><div className="profile-button"><span className="avatar">AO</span><span className="profile-copy"><strong>Operations team</strong><small>Local simulation</small></span></div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{heading}</strong></div><div className="topbar-right"><span className="environment-chip"><span className="status-dot"/> LOCAL DEMO</span><span className="topbar-avatar">AO</span></div></header>
      <div className="page-wrap">
        <section className="page-heading"><div><p className="eyebrow">CIVIC AID NETWORK <span className="eyebrow-line"/></p><h1>{heading}</h1><p className="page-subtitle">Coordinate urgent surplus. Protect every handover.</p></div><div className="date-stamp"><Clock3 size={15}/><span>Demo clock · {new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></div></section>
        {notice&&<div className="notice" role="status"><CheckCircle2 size={17}/><span>{notice}</span><button onClick={()=>setNotice("")} aria-label="Dismiss notification">×</button></div>}
        <section className="readiness-banner"><div className="readiness-symbol"><ShieldCheck size={20}/></div><div className="readiness-copy"><strong>Safety checks enabled · simulated environment</strong><p>Assignments are checked against expiry, rider capacity, open demand and shelter prerequisites. No live GPS or backend persistence is connected.</p></div><span className="readiness-tag">PHASE 03</span></section>
        <section className="metrics-grid"><Metric label="Available batches" value={activeBatches} note="With stock remaining" icon={Boxes} tone="green"/><Metric label="Available riders" value={riders.filter(r=>r.status==="available").length} note="Capacity in demo units" icon={Bike} tone="blue"/><Metric label="At-risk batches" value={atRisk} note="Less than 30 minutes to expiry" icon={AlertTriangle} tone="amber"/><Metric label="Delivered assignments" value={delivered} note="Recorded in this session" icon={ShieldCheck} tone="neutral"/></section>
        {tab==="Overview"&&<><section className="action-panel"><div className="section-heading"><div><h2>Run an operation</h2><p>Use synthetic data to exercise the key dispatch decisions.</p></div><Zap size={19}/></div><div className="quick-actions"><button className="primary-button" onClick={()=>setTab("Aid batches")}><PackagePlus size={16}/> Create donation batch</button><button className="secondary-button" onClick={()=>setTab("Dispatch board")}><MapPinned size={16}/> Open dispatch board</button><button className="secondary-button" onClick={timeoutReservations}><Clock3 size={16}/> Simulate ghost reservation</button></div></section><div className="content-grid"><section className="board-section"><div className="section-heading"><div><h2>Urgent batches</h2><p>Sorted by remaining safe-use window.</p></div><button className="text-button" onClick={()=>setTab("Aid batches")}>View all <ArrowRight size={14}/></button></div><div className="batch-list">{[...batches].filter(b=>b.status==="available"&&b.remaining>0).sort((a,b)=>new Date(a.deadline)-new Date(b.deadline)).slice(0,4).map(b=><article className="batch-row" key={b.id}><div className="batch-symbol"><Boxes size={18}/></div><div className="batch-main"><strong>{b.donor}</strong><span>{b.id} · {b.remaining} {b.type} · {b.pickup}</span></div><div className="batch-deadline"><strong>{fmt(b.deadline)}</strong><span>safe-use window</span></div></article>)}</div></section><section className="board-section"><div className="section-heading"><div><h2>Live activity</h2><p>Latest decisions and exceptions.</p></div><Activity size={17}/></div><EventList events={events.slice(0,5)}/></section></div></>}
        {tab==="Aid batches"&&<section className="content-grid form-content"><section className="board-section"><div className="section-heading"><div><h2>Register surplus aid</h2><p>Create a new donor batch for the dispatch pool.</p></div><PackagePlus size={18}/></div><form className="batch-form" onSubmit={createBatch}><label>Donor / organization<input value={draft.donor} onChange={e=>setDraft({...draft,donor:e.target.value})} placeholder="e.g. Green Leaf Restaurant" required/></label><div className="form-row"><label>Aid type<select value={draft.type} onChange={e=>setDraft({...draft,type:e.target.value})}><option value="meals">Prepared meals</option><option value="ration">Raw ration kits</option></select></label><label>Quantity<input type="number" min="1" value={draft.quantity} onChange={e=>setDraft({...draft,quantity:e.target.value})} required/></label></div><div className="form-row"><label>Safe-use window (minutes)<input type="number" min="1" value={draft.minutes} onChange={e=>setDraft({...draft,minutes:e.target.value})} required/></label><label>Pickup area<input value={draft.pickup} onChange={e=>setDraft({...draft,pickup:e.target.value})}/></label></div>{draft.type==="ration"&&<p className="inline-warning"><AlertTriangle size={15}/> Ration kits require a shelter with clean water and cooking fuel.</p>}<button className="primary-button" type="submit"><PackagePlus size={16}/> Add batch</button></form></section><section className="board-section"><div className="section-heading"><div><h2>Donation inventory</h2><p>Remaining stock and deadline.</p></div><Boxes size={18}/></div><div className="table-wrap"><table><thead><tr><th>Batch / donor</th><th>Remaining</th><th>Deadline</th><th>Status</th></tr></thead><tbody>{visibleBatches.map(b=><tr key={b.id}><td><strong>{b.id}</strong><small>{b.donor}</small></td><td>{b.remaining} / {b.quantity}</td><td>{fmt(b.deadline)}</td><td><Status value={b.remaining>0?b.status:"reserved"}/></td></tr>)}</tbody></table></div></section></section>}
        {tab==="Dispatch board"&&<><section className="board-section dispatch-controls"><div className="section-heading"><div><h2>Build a safe assignment</h2><p>Hard constraints are evaluated before a reservation is created.</p></div><ShieldCheck size={19}/></div><div className="dispatch-form"><label>Donation batch<select value={selectedBatch} onChange={e=>setSelectedBatch(e.target.value)}>{batches.filter(b=>b.remaining>0&&b.status==="available").map(b=><option key={b.id} value={b.id}>{b.id} · {b.donor} · {b.remaining} left</option>)}</select></label><label>Volunteer rider<select value={selectedRider} onChange={e=>setSelectedRider(e.target.value)}>{riders.map(r=><option key={r.id} value={r.id}>{r.name} · capacity {r.capacity} · {labelStatus(r.status)}</option>)}</select></label><label>Receiving site<select value={selectedShelter} onChange={e=>setSelectedShelter(e.target.value)}>{shelters.map(s=><option key={s.id} value={s.id}>{s.name} · {labelStatus(s.status)}</option>)}</select></label><div className="dispatch-actions"><button className="primary-button" onClick={allocate}><ShieldCheck size={16}/> Reserve safe load</button><button className="secondary-button" onClick={splitBatch}><Boxes size={16}/> Auto-split batch</button></div></div>{currentBatch&&<p className="dispatch-hint"><Clock3 size={15}/> Selected batch: {fmt(currentBatch.deadline)} · {currentBatch.remaining} units remaining · 10-minute safety buffer enforced.</p>}</section><section className="board-section assignments-section"><div className="section-heading"><div><h2>Assignments & recovery</h2><p>Advance a reservation or simulate changing ground conditions.</p></div><button className="secondary-button small-button" onClick={timeoutReservations}><RefreshCw size={14}/> Release reservations</button></div><div className="table-wrap"><table><thead><tr><th>Assignment</th><th>Route</th><th>Load</th><th>State</th><th>Actions</th></tr></thead><tbody>{assignments.map(a=>{const b=batches.find(x=>x.id===a.batchId),r=riders.find(x=>x.id===a.riderId),s=shelters.find(x=>x.id===a.shelterId);return <tr key={a.id}><td><strong>{a.id}</strong><small>{b?.id||a.batchId} · {r?.name||a.riderId}</small></td><td>{s?.name||a.shelterId}<small>{a.etaMinutes} min estimated</small></td><td>{a.quantity} {b?.type}</td><td><Status value={a.state}/>{a.reason&&<small>{a.reason}</small>}{a.state==="reserved"&&<small>Claim: {fmt(a.expiresAt)}</small>}</td><td><div className="row-actions">{a.state==="reserved"&&<button className="mini-button" onClick={()=>sendInTransit(a.id)}>Start trip</button>}{a.state==="in_transit"&&<button className="mini-button" onClick={()=>confirmDelivery(a.id)}>Confirm delivery</button>}</div></td></tr>})}{assignments.length===0&&<tr><td colSpan="5" className="empty-cell">No assignments yet. Reserve a safe load or auto-split a batch.</td></tr>}</tbody></table></div><div className="failure-scenario"><div><strong>Failure injection</strong><p>Close a receiving site's demand while a rider is carrying aid. AidFlow will search for a compatible fallback or escalate.</p></div><button className="danger-button" onClick={closeDemandAndRecover}><AlertTriangle size={15}/> Close demand & recover</button></div></section></>}
        {tab==="Riders"&&<section className="board-section"><div className="section-heading"><div><h2>Volunteer fleet</h2><p>Capacity and operational status.</p></div><Bike size={19}/></div><div className="entity-grid">{riders.map(r=><article className="entity-card" key={r.id}><div className="entity-avatar"><Bike size={20}/></div><div className="entity-main"><strong>{r.name}</strong><span>{r.id} · {r.capacity} unit capacity</span></div><Status value={r.status}/><p>Last seen: {r.lastSeen}. Rider availability is simulated, not GPS-verified.</p></article>)}</div></section>}
        {tab==="Receiving sites"&&<section className="board-section"><div className="section-heading"><div><h2>Receiving sites</h2><p>Demand and prerequisites are rechecked before delivery.</p></div><Warehouse size={19}/></div><div className="entity-grid">{shelters.map(s=><article className="entity-card shelter-card" key={s.id}><div className="entity-avatar"><Warehouse size={20}/></div><div className="entity-main"><strong>{s.name}</strong><span>{s.id} · {s.area}</span></div><Status value={s.status}/><p>Open meal demand: {s.demand.meals||0} · ration demand: {s.demand.ration||0}</p><div className="resource-tags">{s.resources.map(x=><span key={x}>{x.replace("-"," ")}</span>)}</div><button className="secondary-button small-button" disabled={s.status==="closed"} onClick={()=>{setShelters(prev=>prev.map(x=>x.id===s.id?{...x,status:"closed"}:x));addEvent("Receiving site closed",`${s.name} marked closed by operations.`,"warning");announce(`${s.name} closed. Recheck any active assignments.`);}}>Close site</button></article>)}</div></section>}
        <section className="principles-grid"><article className="principle"><span className="principle-icon principle-green"><ShieldCheck size={18}/></span><div><h3>Safety gates first</h3><p>Expiry and resource compatibility are hard constraints.</p></div></article><article className="principle"><span className="principle-icon principle-blue"><Bike size={18}/></span><div><h3>Capacity-aware allocation</h3><p>Loads are capped by stock, rider capacity and demand.</p></div></article><article className="principle"><span className="principle-icon principle-amber"><Clock3 size={18}/></span><div><h3>Reservations expire</h3><p>Unconfirmed claims can be released to recover capacity.</p></div></article></section>
        <footer className="app-footer"><span><span className="footer-mark"><HandHeart size={13}/></span> AidFlow <span className="footer-separator">/</span> Civic micro-logistics</span><span>Prototype · Synthetic data · No live navigation</span></footer>
      </div>
    </main>
  </div>;
}

function EventList({events}) {
  return <div className="event-list">{events.map(e=><article className="event-row" key={e.id}><span className={`event-marker event-${e.kind}`}/><div><strong>{e.title}</strong><p>{e.detail}</p><time>{e.time}</time></div></article>)}</div>;
}
