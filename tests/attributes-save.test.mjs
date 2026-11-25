import assert from 'node:assert/strict';
import {tables} from './review-db.mjs';
import {updateProductService} from '../src/module/product/product.service.js';
const id='507f1f77bcf86cd799439015',sid='507f1f77bcf86cd799439013',uid='507f1f77bcf86cd799439020';
tables.users=[{_id:uid,role:'admin'}];tables.stores=[{_id:sid,user:uid}];tables.products=[{_id:id,store_id:sid,seller_id:uid,name:'Receiver',brand:'Brand',price:{amount:100,currency:'USD'},status:'ACTIVE',visibility:'PUBLIC',stock:10,dimensions:{width:{value:10,unit:'CM'},height:{value:10,unit:'CM'}},weight:{value:200,unit:'G'},key_attributes:[]}];
for(const key_attributes of [[{name:'IP Rating',value:'IP67'}],[{name:'درجه حفاظت',value:'ضد آب IP67'}],Array.from({length:8},(_,i)=>({name:'Feature '+i,value:'Value '+i})),[]]){
 await updateProductService(id,{key_attributes},{_id:uid,role:'admin'});
 assert.deepEqual(tables.products[0].key_attributes,key_attributes);
}
await assert.rejects(()=>updateProductService(id,{key_attributes:[{name:'Missing value',value:''}]},{_id:uid,role:'admin'}));
await assert.rejects(()=>updateProductService(id,{key_attributes:Array.from({length:9},()=>({name:'x',value:'y'}))},{_id:uid,role:'admin'}));
assert.deepEqual(tables.products[0].name,{en:'Receiver'});
await updateProductService(id,{name:{fa:'گیرنده'}},{_id:uid,role:'admin'});
assert.equal(tables.products[0].name.en,'Receiver');
assert.equal(tables.products[0].name.fa,'گیرنده');
// Attribute-only edits must not crash on legacy products without measurements.
delete tables.products[0].dimensions;
await updateProductService(id,{key_attributes:[{name:'کیفیت',value:'IP67'}]},{_id:uid,role:'admin'});
assert.equal(tables.products[0].dimensions.width.value,null);
console.log('PASS actual product update service: English/Persian attributes, 8 rows, explicit clear; partial/9 rows rejected');
