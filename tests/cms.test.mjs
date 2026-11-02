import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { cmsRequest, publicDog, validateDog } from '../lib/cms.mjs';
import { onRequestGet as publicProfiles } from '../functions/api/dogs.js';
import { onRequestGet as media } from '../functions/media/[[path]].js';
const raw=new DatabaseSync(':memory:');
raw.exec(readFileSync(new URL('../migrations/0001_cms.sql',import.meta.url),'utf8'));
const DB={prepare(sql){return {bind(...args){return {async first(){return raw.prepare(sql).get(...args)||null;},async all(){return {results:raw.prepare(sql).all(...args)};},async run(){const r=raw.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};},async all(){return {results:raw.prepare(sql).all()};}};},async batch(stmts){raw.exec('BEGIN');try{const results=[];for(const s of stmts) results.push(await s.run());raw.exec('COMMIT');return results;}catch(e){raw.exec('ROLLBACK');throw e;}}};
for(const [id,role] of [['super-one','superuser'],['super-two','superuser'],['editor','editor'],['mfa','editor'],['temp','editor']]) raw.prepare('INSERT INTO cms_users(id,email,name,role,must_change_password) VALUES(?,?,?,?,?)').run(id,`${id}@example.test`,id,role,id==='temp'?1:0);
const bytes=new Map();
const env={DB,DOG_PHOTOS:{async put(key,data,opts){bytes.set(key,{data,opts});},async delete(key){bytes.delete(key);},async get(key){const b=bytes.get(key);return b?{body:b.data,httpEtag:'etag',writeHttpMetadata(h){h.set('Content-Type',b.opts.httpMetadata.contentType);}}:null;}},SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',SUPABASE_SECRET_KEY:'sb_secret_test',CMS_ORIGIN:'https://manage.example.test',CMS_ENABLED:'true'};
const jwt=(id,aal='aal1')=>`e30.${Buffer.from(JSON.stringify({sub:id,aal,exp:9999999999})).toString('base64url')}.signed`;
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,opts)=>{
 assert.ok(String(url).startsWith('https://auth.example.test/auth/v1/'));
 if(String(url).endsWith('/user')&&(!opts.method||opts.method==='GET')){
  const token=opts.headers.Authorization?.slice(7);
  let claims;try{claims=JSON.parse(Buffer.from(token.split('.')[1],'base64url'));}catch{return Response.json({}, {status:401});}
  if(!token.endsWith('.signed')||!['super-one','super-two','editor','mfa','temp'].includes(claims.sub)) return Response.json({}, {status:401});
  return Response.json({id:claims.sub,factors:claims.sub==='mfa'?[{status:'verified',factor_type:'totp'}]:[]});
 }
 if(String(url).endsWith('/admin/users')){
  assert.equal(opts.headers.apikey,'sb_secret_test');assert.equal(opts.headers.Authorization,undefined);
  return Response.json({id:'new-user'});
 }
 return Response.json({id:'editor'});
};
const call=(path,method='GET',body,who='editor',options={})=>cmsRequest({request:new Request(`https://public.example.test/api/cms/${path}`,{method,headers:{Origin:options.origin||env.CMS_ORIGIN,...(who?{Authorization:`Bearer ${jwt(who,options.aal)}`} : {}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),env,params:{path:path.split('/')}});
let photo,id;
const dog=()=>({name:'Test dog',breed:'Mixed breed',sex:'Female',age:'3 years',good_dogs:true,good_small_animals:false,gentle_children:true,status:'available',description:'A friendly dog with a story.',photos:[photo]});
test('API refuses unauthenticated users and other origins',async()=>{
 assert.equal((await call('dogs','GET',null,null)).status,401);
 assert.equal((await call('dogs','GET',null,'editor',{origin:'https://evil.example.test'})).status,403);
});
test('preflight allows only the configured management origin',async()=>{
 const response=await call('dogs','OPTIONS',null,null);
 assert.equal(response.status,204);assert.equal(response.headers.get('access-control-allow-origin'),env.CMS_ORIGIN);
});
test('public configuration exposes no server secret',async()=>{
 const data=await (await call('config','GET',null,null)).json();
 assert.equal(data.supabaseKey,env.SUPABASE_PUBLISHABLE_KEY);assert.ok(!JSON.stringify(data).includes(env.SUPABASE_SECRET_KEY));
});
test('MFA enrollment requires an aal2 token; temporary passwords block editing',async()=>{
 assert.equal((await call('dogs','GET',null,'mfa')).status,403);
 assert.equal((await call('dogs','GET',null,'mfa',{aal:'aal2'})).status,200);
 assert.equal((await call('dogs','GET',null,'temp')).status,403);
 assert.equal((await call('me','GET',null,'temp')).status,200);
});
test('password change clears the temporary-password requirement',async()=>{
 assert.equal((await call('password','POST',{password:'a long example passphrase'},'temp')).status,200);
 assert.equal((await call('dogs','GET',null,'temp')).status,200);
});
test('rejects non-image uploads and accepts a real PNG signature',async()=>{
 const upload=async data=>cmsRequest({request:new Request('https://public.example.test/api/cms/photos',{method:'POST',headers:{Origin:env.CMS_ORIGIN,Authorization:`Bearer ${jwt('editor')}`},body:data}),env,params:{path:['photos']}});
 assert.equal((await upload('<svg onload="alert(1)"></svg>')).status,400);
 const response=await upload(new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0]));assert.equal(response.status,201);
 photo=(await response.json()).photo;
 assert.equal((await media({request:new Request('https://public.example.test'+photo),env,params:{path:photo.slice('/media/'.length).split('/')}})).status,404,'unpublished uploads must not be public');
});
test('editor creates a profile and regular users cannot change roles or delete dogs',async()=>{
 const response=await call('dogs','POST',dog());assert.equal(response.status,201);id=(await response.json()).id;
 assert.equal((await call(`dogs/${id}`,'DELETE',{confirmName:'Test dog',version:1})).status,403);
 assert.equal((await call('users','GET')).status,403);
 assert.equal((await call('users','POST',{role:'superuser'})).status,403);
 assert.equal((await call('users/super-one','PUT',{role:'editor',active:false,name:'x'})).status,403);
});
test('1,000-word limit, invalid status, compatibility booleans and photo URLs are enforced server-side',()=>{
 assert.equal(validateDog({...dog(),description:Array(1000).fill('word').join(' ')}).name,'Test dog');
 for(const invalid of [{description:Array(1001).fill('word').join(' ')},{status:'pending'},{good_dogs:'yes'},{photos:['https://evil.example.test/image.svg']}]) assert.throws(()=>validateDog({...dog(),...invalid}));
});
test('published photos are served as images',async()=>{
 const response=await media({request:new Request('https://public.example.test'+photo),env,params:{path:photo.slice('/media/'.length).split('/')}});
 assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/png');
});
test('status updates are public, and stale editors cannot overwrite changes',async()=>{
 assert.equal((await call(`dogs/${id}`,'PUT',{...dog(),status:'adopted',version:1})).status,200);
 assert.equal((await call(`dogs/${id}`,'PUT',{...dog(),version:1})).status,409);
 const response=await publicProfiles({env});const data=await response.json();
 assert.equal(data.profiles[0].status,'Adopted');assert.equal(data.profiles[0].health.includes('Gentle with children'),true);
 assert.equal(data.profiles[0].health.includes('Good with cats/small animals'),false);
 assert.equal('updated_by' in data.profiles[0],false);assert.equal('version' in data.profiles[0],false);
});
test('existing migrated photos remain usable and unregistered assets are rejected',async()=>{
 raw.prepare('INSERT INTO dogs(id,name,breed,sex,status,description,photos) VALUES(?,?,?,?,?,?,?)').run('legacy','Legacy','Mix','Male','available','Story',JSON.stringify(['/assets/dogs/legacy/photos/photo.jpg']));
 assert.equal((await call('dogs','POST',{...dog(),photos:['/assets/dogs/legacy/photos/photo.jpg']})).status,201);
 assert.equal((await call('dogs','POST',{...dog(),photos:['/assets/dogs/unknown/photos/photo.jpg']})).status,400);
});
test('superusers must confirm the name; deletion is recoverable and respects version checks',async()=>{
 assert.equal((await call(`dogs/${id}`,'DELETE',{confirmName:'Wrong name',version:2},'super-one')).status,400);
 assert.equal((await call(`dogs/${id}`,'DELETE',{confirmName:'Test dog',version:2},'super-one')).status,200);
 let list=(await (await call('dogs')).json()).dogs;assert.ok(!list.some(d=>d.id===id));
 list=(await (await call('dogs','GET',null,'super-one')).json()).dogs;assert.ok(list.find(d=>d.id===id).deleted_at);
 let published=await (await publicProfiles({env})).json();assert.ok(!published.profiles.some(d=>d.slug===id));
 assert.equal((await call(`dogs/${id}/restore`,'POST',{confirmName:'Test dog',version:2},'super-one')).status,409);
 assert.equal((await call(`dogs/${id}/restore`,'POST',{confirmName:'Test dog',version:3},'super-one')).status,200);
 published=await (await publicProfiles({env})).json();assert.ok(published.profiles.some(d=>d.slug===id));
});
test('superusers can create accounts; password stays with the managed auth service',async()=>{
 const response=await call('users','POST',{name:'New user',email:'new@example.test',role:'editor',password:'a temporary passphrase'},'super-one');
 assert.equal(response.status,201);
 const user=raw.prepare('SELECT * FROM cms_users WHERE id=?').get('new-user');assert.equal(user.must_change_password,1);assert.equal('password' in user,false);
});
test('the last two superusers cannot be demoted, disabled, or deleted',async()=>{
 const response=await call('users/super-two','PUT',{name:'Other admin',role:'editor',active:true},'super-one');assert.equal(response.status,409);
 assert.equal((await call('users/super-two','PUT',{name:'Other admin',role:'superuser',active:false},'super-one')).status,409);
 assert.throws(()=>raw.prepare('DELETE FROM cms_users WHERE id=?').run('super-two'),/two active superusers/);
 assert.equal((await call('users/super-one','PUT',{name:'Self',role:'editor',active:false},'super-one')).status,400);
});
test('deactivating an editor takes effect on their next API request',async()=>{
 assert.equal((await call('users/editor','PUT',{name:'Editor',role:'editor',active:false},'super-one')).status,200);
 assert.equal((await call('dogs')).status,403);
});
test('disabled CMS retains static mode; activated CMS fails closed if database is unavailable',async()=>{
 assert.deepEqual(await (await publicProfiles({env:{CMS_ENABLED:'false'}})).json(),{enabled:false});
 assert.equal((await publicProfiles({env:{CMS_ENABLED:'true'}})).status,503);
});
test('audit trail contains successful management actions',()=>{
 const actions=raw.prepare('SELECT action FROM cms_audit').all().map(r=>r.action);
 assert.ok(actions.includes('dog_created'));assert.ok(actions.includes('dog_updated'));assert.ok(actions.includes('dog_deleted'));assert.ok(actions.includes('dog_restored'));assert.ok(actions.includes('user_created'));
 globalThis.fetch=originalFetch;raw.close();
});
