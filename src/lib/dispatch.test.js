import test from "node:test";
import assert from "node:assert/strict";
import { allocateBatch, canDeliver, releaseExpiredReservations, rerouteAssignment } from "./dispatch.js";

const batch = (overrides = {}) => ({id:"B1",type:"meals",remaining:80,status:"available",deadline:new Date(Date.now()+90*60000).toISOString(),requires:[],...overrides});
const rider = (overrides = {}) => ({id:"R1",capacity:40,status:"available",...overrides});
const shelter = (overrides = {}) => ({id:"S1",status:"open",demand:{meals:50},resources:[],...overrides});

test("rejects a load that exceeds rider capacity", () => {
  const result=canDeliver({batch:batch(),rider:rider(),shelter:shelter(),quantity:41,etaMinutes:10});
  assert.equal(result.ok,false);
  assert.ok(result.reasons.includes("Quantity exceeds rider capacity"));
});

test("rejects arrivals that violate the expiry safety buffer", () => {
  const result=canDeliver({batch:batch({deadline:new Date(Date.now()+18*60000).toISOString()}),rider:rider(),shelter:shelter(),quantity:20,etaMinutes:10});
  assert.equal(result.ok,false);
  assert.ok(result.reasons.includes("Arrival would violate expiry safety buffer"));
});

test("rejects ration delivery when shelter prerequisites are missing", () => {
  const ration=batch({type:"ration",requires:["clean-water","cooking-fuel"]});
  const result=canDeliver({batch:ration,rider:rider(),shelter:shelter({demand:{ration:20}}),quantity:10,etaMinutes:10});
  assert.equal(result.ok,false);
  assert.ok(result.reasons.includes("Shelter lacks required resources"));
});

test("split allocation never assigns the same rider twice", () => {
  const result=allocateBatch(batch(),[rider({id:"R1"}),rider({id:"R2"}),rider({id:"R3"})],[shelter({id:"S1",demand:{meals:50}}),shelter({id:"S2",demand:{meals:50}})],10);
  const riderIds=result.assignments.map(a=>a.riderId);
  assert.equal(new Set(riderIds).size,riderIds.length);
  assert.ok(result.assignments.every(a=>a.quantity>0&&a.quantity<=40));
  assert.ok(result.assignments.reduce((n,a)=>n+a.quantity,0)<=80);
});

test("expired reservations release to a terminal state", () => {
  const expired={id:"A1",state:"reserved",expiresAt:new Date(Date.now()-1000).toISOString()};
  const live={id:"A2",state:"reserved",expiresAt:new Date(Date.now()+60000).toISOString()};
  const result=releaseExpiredReservations([expired,live]);
  assert.equal(result[0].state,"released");
  assert.equal(result[1].state,"reserved");
});

test("reroute escalates when no compatible fallback has demand", () => {
  const assignment={id:"A1",shelterId:"S1",quantity:20,state:"in_transit"};
  const result=rerouteAssignment(assignment,[shelter({id:"S1"}),shelter({id:"S2",demand:{meals:0}})],batch(),10);
  assert.equal(result.state,"escalated");
});
