import assert from 'node:assert/strict';
import {tables} from './review-db.mjs';
import {saveReview,listReviews,manageReviews} from '../src/module/review/review.service.js';
const uid='507f1f77bcf86cd799439011',seller='507f1f77bcf86cd799439010',admin='507f1f77bcf86cd799439020',pid='507f1f77bcf86cd799439015',sid='507f1f77bcf86cd799439013';
tables.users=[{_id:uid,role:'customer',firstname:{en:'Parsa',fa:'پارسا'},lastname:{en:'Saadat',fa:'سعادت'},username:'SECRET_USERNAME'},{_id:seller,role:'seller',firstname:'Mina',lastname:'Salehi'},{_id:admin,role:'admin',firstname:'Site',lastname:'Admin'}];tables.stores=[{_id:sid,user:seller,status:'ENABLE'}];tables.products=[{_id:pid,store_id:sid,seller_id:seller,status:'ACTIVE',visibility:'PUBLIC'}];
const root=await saveReview('product',pid,{rating:5,text:'Useful receiver for surveying work.'},{_id:uid});await saveReview('product',pid,{text:'Thank you for sharing your experience.'},{_id:seller},null,root._id);await saveReview('product',pid,{text:'Thank you for your detailed review.'},{_id:admin},null,root._id);
// Old snapshots must not leave masked names or role labels visible.
tables.reviews[0].author='P***';
let list=await listReviews('product',pid,{lang:'en'});assert.equal(list.data[0].author,'Parsa Saadat');assert.equal(list.data[0].replies[0].author,'Mina Salehi');assert.equal(list.data[0].replies[0].author_role,'seller');assert.equal(list.data[0].replies[1].author_role,'admin');assert.ok(!JSON.stringify(list).includes('SECRET_USERNAME'));assert.ok(!JSON.stringify(list).includes(uid));
list=await listReviews('product',pid,{lang:'fa'});assert.equal(list.data[0].author,'پارسا سعادت');tables.users[0].lastname.fa='نام جدید';list=await listReviews('product',pid,{lang:'fa'});assert.equal(list.data[0].author,'پارسا نام جدید');
for(const value of [uid,''])await assert.rejects(()=>manageReviews({user_id:value},{_id:seller,role:'admin'}),e=>e.cause?.code===403);
const managed=await manageReviews({},{_id:seller});assert.ok(managed.data.every(r=>!('user_id' in r)&&r.replies.every(x=>!('user_id' in x))));
assert.equal((await manageReviews({user_id:uid},{_id:admin})).total,1);
delete tables.users[0].firstname;delete tables.users[0].lastname;tables.users[0].username='survey_fallback';
const unnamed=await listReviews('product',pid,{});assert.equal(unnamed.data[0].author,'survey_fallback');assert.ok(!('username' in unnamed.data[0]));
console.log('PASS actual review service: live full names in English/Persian and replies, old masks replaced, only author display fields public, no raw username field/public IDs, username fallback only for unnamed profiles, seller filters including empty/stale admin rejected, admin filter works');
