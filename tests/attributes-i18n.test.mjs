import assert from 'node:assert/strict';
import {tables} from './review-db.mjs';
import {updateProductService} from '../src/module/product/product.service.js';
import {validateAttributes} from '../src/module/product/attributes.core.js';
import {localize} from '../src/utils/helpers/localization.helper.js';
import {fieldDocument,domainDocument} from '../src/utils/helpers/content-fields.helper.js';
const id='507f1f77bcf86cd799439015',sid='507f1f77bcf86cd799439013',uid='507f1f77bcf86cd799439020';
tables.users=[{_id:uid,role:'admin'}];tables.stores=[{_id:sid,user:uid}];tables.products=[{_id:id,store_id:sid,seller_id:uid,name:'Receiver',brand:'Brand',price:{amount:100,currency:'USD'},status:'ACTIVE',visibility:'PUBLIC',stock:10,dimensions:{width:{value:10,unit:'CM'},height:{value:10,unit:'CM'}},weight:{value:200,unit:'G'},key_attributes:[]}];
const attrs=[{name:{en:'Accuracy',fa:'دقت',ar:'الدقة',tr:'Hassasiyet'},value:{en:'2 mm',fa:'۲ میلی‌متر',ar:'٢ مم',tr:'2 milimetre'}}];
assert.deepEqual(validateAttributes(attrs),attrs);
await updateProductService(id,{key_attributes:attrs},{_id:uid,role:'admin'});assert.deepEqual(tables.products[0].key_attributes,attrs);
// Updating another field cannot silently flatten or discard attribute locales.
await updateProductService(id,{stock:11},{_id:uid,role:'admin'});assert.deepEqual(tables.products[0].key_attributes,attrs);
const round=fieldDocument(domainDocument({key_attributes:attrs}),null,'en',true);assert.deepEqual(round.key_attributes,attrs);
for(const code of ['en','fa','ar','tr']){const row=localize(round,code).key_attributes[0];assert.equal(row.name,attrs[0].name[code]);assert.equal(row.value,attrs[0].value[code]);}
for(const row of [{name:{en:'X'},value:{fa:'Y'}},{name:{en:'X'},value:{en:''}},{name:{xx:'X'},value:{xx:'Y'}},{name:{en:{}},value:{en:'Y'}}])assert.throws(()=>validateAttributes([row]));
console.log('PASS V43 real update service: 4 independent attribute locales, save/reload/unrelated edit preservation, public localization, pair/unknown-language/type validation');
