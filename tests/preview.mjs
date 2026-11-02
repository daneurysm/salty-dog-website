// Local QA harness only. Never deploy this server: it uses synthetic logins and
// an in-memory database so the portal can be reviewed without real credentials.
import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {cmsRequest} from '../lib/cms.mjs';
const raw=new DatabaseSync(':memory:');raw.exec(readFileSync('migrations/0001_cms.sql','utf8'));
const adminId='00000000-0000-4000-8000-000000000001';
const editorId='00000000-0000-4000-8000-000000000002';
raw.prepare('INSERT INTO cms_users(id,email,name,role,must_change_password) VALUES(?,?,?,?,0)').run(adminId,'admin@example.test','Preview administrator','superuser');
raw.prepare('INSERT INTO cms_users(id,email,name,role,must_change_password) VALUES(?,?,?,?,0)').run(editorId,'editor@example.test','Preview editor','editor');
raw.exec(readFileSync('setup/import-dogs.sql','utf8'));
const DB={prepare(sql){return {bind(...args){return {async first(){return raw.prepare(sql).get(...args)||null;},async all(){return {results:raw.prepare(sql).all(...args)};},async run(){const r=raw.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}};}};},async all(){return {results:raw.prepare(sql).all()};}};},async batch(stmts){raw.exec('BEGIN');try{const results=[];for(const s of stmts)results.push(await s.run());raw.exec('COMMIT');return results;}catch(e){raw.exec('ROLLBACK');throw e;}}};
const user=id=>({id,aud:'authenticated',role:'authenticated',email:id===adminId?'admin@example.test':'editor@example.test',app_metadata:{provider:'email',providers:['email']},user_metadata:{},identities:[],factors:[],created_at:new Date().toISOString()});
const jwt=id=>`${Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')}.${Buffer.from(JSON.stringify({sub:id,aal:'aal1',role:'authenticated',aud:'authenticated',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.dGVzdC1vbmx5`;
const decode=token=>{try{if(!token.endsWith('.dGVzdC1vbmx5'))return null;return JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub;}catch{return null;}};
const originalFetch=globalThis.fetch;
globalThis.fetch=async (url,opts)=>{
 if(String(url).includes('/auth/v1/user')){const id=decode(opts.headers.Authorization?.slice(7)||'');return Response.json(id?user(id):{error:'Invalid token'},{status:id?200:401});}
 return originalFetch(url,opts);
};
const server=createServer(async(req,res)=>{
 try{
  const origin=`http://${req.headers.host}`;const url=new URL(req.url,origin);let response;
  if(url.pathname==='/config.js') response=new Response('window.SALTY_DOG_API_ORIGIN=window.location.origin;',{headers:{'Content-Type':'text/javascript'}});
  else if(url.pathname==='/auth/v1/token'){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=JSON.parse(Buffer.concat(chunks));const id=body.email==='editor@example.test'?editorId:adminId;
   response=Response.json({access_token:jwt(id),refresh_token:'test-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user(id)});
  }else if(url.pathname==='/auth/v1/user'){
   const id=decode(req.headers.authorization?.slice(7)||'');response=Response.json(user(id||adminId));
  }else if(url.pathname==='/auth/v1/logout') response=new Response(null,{status:204});
  else if(url.pathname.startsWith('/api/cms/')){
   const chunks=[];for await(const chunk of req)chunks.push(chunk);
   const headers=new Headers(req.headers);if(!headers.has('origin'))headers.set('origin',origin);
   const request=new Request(url,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
   response=await cmsRequest({request,env:{DB,SUPABASE_URL:origin,SUPABASE_PUBLISHABLE_KEY:'sb_publishable_preview_only',CMS_ORIGIN:origin},params:{path:url.pathname.slice('/api/cms/'.length).split('/')}});
  }else{
   const publicAsset=url.pathname.startsWith('/assets/');const root=resolve(publicAsset?'public':'admin/public');const file=resolve(root,`.${url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)}`);
   if(!file.startsWith(root+'/')||!existsSync(file))response=new Response('Not found',{status:404});
   else response=new Response(readFileSync(file),{headers:{'Content-Type':({'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png'})[extname(file)]||'application/octet-stream'}});
  }
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(error){res.writeHead(500);res.end(String(error));}
});
server.listen(Number(process.env.PORT||4173),'0.0.0.0',()=>console.log('Local synthetic CMS preview ready.'));
