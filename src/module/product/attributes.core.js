const languages=['en','fa','ar','tr'];
const fail=()=>{throw new Error('Each attribute needs a name (1–80) and value (1–500) in the same language',{cause:{code:400}});};
const clean=(value,max)=>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(code=>!languages.includes(code)))fail();
 const map={};
 for(const [code,text]of Object.entries(value)){
  if(typeof text!=='string'||!text.trim()||text.length>max)fail();
  map[code]=text.trim();
 }
 return map;
};
export function validateAttributes(value=[]){
 if(!Array.isArray(value)||value.length>8)throw new Error('Key attributes must contain at most 8 rows',{cause:{code:400}});
 return value.map(row=>{
  if(!row)fail();
  if(typeof row.name==='string'&&typeof row.value==='string'){
   if(!row.name.trim()||!row.value.trim()||row.name.length>80||row.value.length>500)fail();
   return {name:row.name.trim(),value:row.value.trim()};
  }
  const name=clean(row.name,80),value=clean(row.value,500);
  if(!Object.keys(name).length||languages.some(code=>(name[code]!==undefined)!==(value[code]!==undefined)))fail();
  return {name,value};
 });
}
