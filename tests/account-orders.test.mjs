import assert from 'node:assert/strict';
import { ObjectId } from 'mongodb';
import { tables } from './review-db.mjs';
import { matchesAccountOrder } from '../src/utils/helpers/order-filter.helper.js';
import { getOrdersService, getOrderService } from '../src/module/order/order.service.js';
const buyer=new ObjectId().toString(), stranger=new ObjectId().toString();
const parent=(pay='paid')=>({_id:new ObjectId(),customer_id:buyer,payment:{status:pay},status:'pending',final_amount:1000,currency:'IRR'});
const add=(order,status,refund)=>{tables.orders.push(order);if(status)tables['sub-orders'].push({_id:new ObjectId(),parent_order_id:order._id,status,...(refund?{refund:{status:refund}}:{})});return order;};
tables.orders=[];tables['sub-orders']=[];
const awaiting=add(parent(),'awaiting_approval'), unpaid=add(parent('pending'),'awaiting_approval'),preparing=add(parent(),'preparing'),ready=add(parent(),'ready_to_ship'),shipped=add(parent(),'shipped'),cancelled=add(parent(),'cancelled','completed');
const other=add({...parent(),customer_id:stranger},'preparing');
const actor={_id:buyer,role:'customer',is_seller:true};
for(const [status,ids]of Object.entries({all:[awaiting,unpaid,preparing,ready,shipped,cancelled],confirming:[awaiting,unpaid],unpaid:[unpaid],paid:[awaiting,preparing,ready,shipped,cancelled],preparing:[preparing,ready],delivering:[shipped],refunds:[cancelled]})){
 const result=await getOrdersService({status,limit:1},actor);assert.equal(result.total,ids.length,status);assert.equal(result.totalPages,ids.length);assert.equal(result.data.length,1);assert.ok(ids.some(o=>String(o._id)===String(result.data[0]._id)));assert.equal(result.summary.count,6);assert.equal(result.summary.paid,5);assert.equal(result.summary.spent,5000);
 const all=await getOrdersService({status,limit:100},actor);assert.deepEqual(new Set(all.data.map(o=>String(o._id))),new Set(ids.map(o=>String(o._id))),status);
}
assert.equal((await getOrdersService({limit:100,scope:'buyer'},{...actor,role:'admin'})).total,6);
assert.equal((await getOrdersService({limit:100},{...actor,role:'admin'})).total,7);
assert.equal((await getOrdersService({status:'preparing',page:2,limit:1},actor)).data.length,1);
assert.equal(String((await getOrderService(String(awaiting._id),actor))._id),String(awaiting._id));
await assert.rejects(()=>getOrderService(String(other._id),actor),/No Access/);
await assert.rejects(()=>getOrdersService({status:'bogus'},actor),/filter/);
await assert.rejects(()=>getOrdersService({},null),/Authentication/);
console.log('PASS V41 actual account orders service: all seven filters before pagination, summaries, buyer scoping for sellers/admins, own detail allowed, third-party denial, invalid filter and auth guards');

assert.equal(matchesAccountOrder({status:'pending',payment:{status:'pending'}},[{status:'cancelled'}],'unpaid'),false);
