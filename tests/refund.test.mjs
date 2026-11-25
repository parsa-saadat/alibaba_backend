import assert from 'node:assert/strict';
import { createRefundService } from '../src/module/payment/refund.core.js';
import { createZarinpalRefundGateway } from '../src/module/payment/refund.gateway.js';
import { rialSnapshot, convert, displayPrices } from '../src/module/fx/fx.service.js';
const actor = {_id:'admin',role:'admin'};
const get=(x,k)=>k.split('.').reduce((v,p)=>v?.[p],x);
const set=(x,k,v)=>{const a=k.split('.');let t=x;for(const p of a.slice(0,-1))t=t[p]??={};t[a.at(-1)]=structuredClone(v)};
function fixture({gatewayResult='PENDING', timeout=false, definitive=false, amount=90000}={}){
 const state={order:{_id:'parent',currency:'IRR',paid_amount:200000,payment:{status:'paid',method:'zarinpal',ref_id:'123456'},paid_sub_orders:['one','two'],refund_lock:null},subs:[{_id:'one',parent_order_id:'parent',status:'cancelled',currency:'IRR',amount:100000,discount_applied:0,refund:{status:'pending',amount}},{_id:'two',parent_order_id:'parent',status:'cancelled',currency:'IRR',amount:100000,refund:{status:'pending',amount:100000}}],calls:0,summaries:0};
 const match=(obj,q)=>Object.entries(q).every(([k,v])=>get(obj,k)===v || (get(obj,k)==null&&v===null));
 const update=(obj,q,data)=>{if(!match(obj,q))return{matchedCount:0};for(const [k,v]of Object.entries(data))set(obj,k,v);return{matchedCount:1}};
 let seq=0;
 const repo={sub:async id=>structuredClone(state.subs.find(s=>s._id===id)),order:async()=>structuredClone(state.order),subs:async()=>structuredClone(state.subs),updateSub:async(q,d)=>update(state.subs.find(s=>s._id===q._id),q,d),updateOrder:async(q,d)=>update(state.order,q,d),summarize:async()=>state.summaries++};
 const gateway={ready(){},async add(input){state.calls++;assert.equal(input.amount,amount);assert.equal(input.session_id,'123456');await new Promise(r=>setTimeout(r,5));if(timeout||definitive){let e=Error('gateway');e.definitive=definitive;throw e;}return{id:'999',timeline:{refund_status:gatewayResult,refund_amount:amount}}},async inquiry(id){assert.equal(id,'999');return{id:'999',timeline:{refund_status:gatewayResult,refund_amount:amount}}}};
 return {state,gateway,service:createRefundService({repo,gateway,id:()=>`op-${++seq}`})};
}
for(const currency of ['IRR','IRT',' irr ']){const r=await rialSnapshot({amount:20000,currency});assert.equal(r.amount,currency==='IRT'?200000:20000);assert.equal(r.quote,null)}
assert.equal(convert(100,'IRT','IRR'),1000);assert.equal(convert(1000,'IRR','IRT'),100);
const displayed=await displayPrices({price:{amount:100,currency:'IRT'}},'IRR',()=>{throw Error('must not fetch remote FX')});assert.equal(displayed.price.amount,1000);
await assert.rejects(()=>rialSnapshot({amount:Infinity,currency:'IRR'}));await assert.rejects(()=>rialSnapshot({amount:0,currency:'IRT'}));
console.log('PASS IRR/IRT normalization, exact ×10 settlement, no remote FX for local currencies, invalid amounts rejected');
{
 const{service,state}=fixture();await assert.rejects(()=>service.request('one',{}, {_id:'buyer',role:'user'}),/administrator/);assert.equal(state.calls,0);
 const result=await service.request('one',{},actor);assert.equal(result.refund.status,'submitted');assert.equal(state.calls,1);assert.ok(state.order.refund_lock);await assert.rejects(()=>service.request('one',{},actor),/progress/);await assert.rejects(()=>service.request('two',{},actor),/progress/);assert.equal(state.calls,1);
}
{
 const {service,state}=fixture({gatewayResult:'SUCCESS'});const r=await service.request('one',{},actor);assert.equal(r.refund.status,'completed');assert.equal(state.order.refund_lock,null);await service.request('one',{},actor);assert.equal(state.calls,1);
}
{
 const {service,state,gateway}=fixture();await service.request('one',{},actor);gateway.inquiry=async()=>({id:'999',timeline:{refund_status:'SUCCESS',refund_amount:90000}});await service.reconcile('one',actor);assert.equal(state.subs[0].refund.status,'completed');assert.equal(state.calls,1);assert.equal(state.order.refund_lock,null);
}
{
 const {service,state}=fixture();const results=await Promise.allSettled([service.request('one',{},actor),service.request('one',{},actor)]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(state.calls,1);
}
{
 const {service,state}=fixture({timeout:true});await assert.rejects(()=>service.request('one',{},actor),/unknown/);assert.equal(state.subs[0].refund.status,'unknown');assert.ok(state.order.refund_lock);await assert.rejects(()=>service.request('one',{},actor));await assert.rejects(()=>service.reconcile('one',actor),/Manual reconciliation/);assert.equal(state.calls,1);
}
{
 const {service,state}=fixture({definitive:true});await assert.rejects(()=>service.request('one',{},actor));assert.equal(state.subs[0].refund.status,'failed');assert.equal(state.order.refund_lock,null);
}
for(const change of [s=>s.subs[0].refund.amount=10000,s=>s.subs[0].refund.amount=110000,s=>s.order.paid_amount=80000,s=>s.order.currency='IRT',s=>s.order.payment.status='pending',s=>s.order.paid_sub_orders=[]]){
 const {service,state}=fixture();change(state);await assert.rejects(()=>service.request('one',{},actor));assert.equal(state.calls,0);
}
{
 const {service,state,gateway}=fixture();gateway.add=async()=>({id:'999',timeline:{refund_status:'SUCCESS',refund_amount:1}});await assert.rejects(()=>service.request('one',{},actor));assert.equal(state.subs[0].refund.status,'unknown');assert.ok(state.order.refund_lock);
}
console.log('PASS admin-only, paid snapshot eligibility, exact amount, min/max/budget, concurrent request lock, completion idempotency, submitted ≠ completed, reconciliation, timeout blocks retries');
{
 const calls=[];const gateway=createZarinpalRefundGateway({env:{ZARINPAL_ACCESS_TOKEN:'token-for-fixture-only'},http:{post:async(...args)=>{calls.push(args);return{data:{data:{resource:{id:'99',timeline:{refund_status:'PENDING'}}}}}}}});await gateway.add({session_id:'12',amount:20000,method:'PAYA',reason:'CUSTOMER_REQUEST'});assert.equal(calls[0][0],'https://next.zarinpal.com/api/v4/graphql/');assert.equal(calls[0][2].headers.Authorization,'Bearer token-for-fixture-only');assert.ok(calls[0][1].query.includes('AddRefund'));assert.equal(calls[0][2].timeout,20000);
 assert.throws(()=>createZarinpalRefundGateway({env:{}}).ready(),/ACCESS_TOKEN/);
}
console.log('PASS documented Zarinpal GraphQL shape, Bearer auth, timeout and missing refund credential guard; no live money moved');
