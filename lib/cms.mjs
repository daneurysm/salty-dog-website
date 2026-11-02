export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };
export const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export function requiredText(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `${label} is required (maximum ${max} characters).`);
  return value.trim();
}
export const wordCount = text => text.trim().split(/\s+/u).filter(Boolean).length;
export function validateDog(body) {
  const name = requiredText(body.name, 'Dog name', 100);
  const breed = requiredText(body.breed, 'Breed', 160);
  const description = requiredText(body.description, 'Description', 30000);
  if (wordCount(description) > 1000) fail(400, 'The description must be 1,000 words or fewer.');
  if (!['Male', 'Female'].includes(body.sex)) fail(400, 'Choose Male or Female.');
  if (!['available', 'adopted'].includes(body.status)) fail(400, 'Choose Available or Adopted.');
  const photos = body.photos;
  if (!Array.isArray(photos) || !photos.length || photos.length > 12 || new Set(photos).size !== photos.length) fail(400, 'Add between 1 and 12 different photos.');
  for (const photo of photos) {
    if (typeof photo !== 'string' || !(/^\/media\/dogs\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(photo) || /^\/assets\/dogs\/[a-z0-9-]+\/photos\/[a-zA-Z0-9%_.-]+\.(avif|gif|jpe?g|png|webp)$/i.test(photo))) fail(400, 'Choose a photo uploaded to this website.');
  }
  for (const key of ['good_dogs', 'good_small_animals', 'gentle_children']) if (typeof body[key] !== 'boolean') fail(400, 'Please check the compatibility options.');
  const age = typeof body.age === 'string' ? body.age.trim().slice(0,100) : '';
  return { name, breed, sex: body.sex, age, good_dogs: +body.good_dogs, good_small_animals: +body.good_small_animals, gentle_children: +body.gentle_children, status: body.status, description, photos };
}
export function requireSuperuser(actor) {
  if (actor.role !== 'superuser') fail(403, 'Only a superuser can do that.');
}
export async function bodyJSON(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, 'Send JSON data.');
  const text = await request.text();
  if (text.length > 60000) fail(413, 'This form is too large.');
  try { return JSON.parse(text); } catch { fail(400, 'The form could not be read. Please try again.'); }
}
export function authConfig(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) fail(503, 'The portal login has not been configured yet.');
  return { url: env.SUPABASE_URL.replace(/\/$/, ''), key: env.SUPABASE_PUBLISHABLE_KEY };
}
export async function supabaseRequest(env, path, { token, admin = false, method = 'GET', body } = {}) {
  const { url, key } = authConfig(env);
  const apiKey = admin ? env.SUPABASE_SECRET_KEY : key;
  if (!apiKey) fail(503, 'Account administration has not been configured yet.');
  const response = await fetch(`${url}/auth/v1${path}`, {
    method,
    headers: { apikey: apiKey, ...(token && !admin ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (path === '/user' && method === 'GET') fail(401, 'Your session has expired. Please sign in again.');
    fail(400, 'The account service could not complete that request. Check the details and try again.');
  }
  return data;
}
export async function getActor(request, env) {
  const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_.-]+)$/)?.[1];
  if (!token) fail(401, 'Please sign in.');
  const identity = await supabaseRequest(env, '/user', { token });
  if (!env.DB) fail(503, 'The portal database has not been connected yet.');
  const actor = await env.DB.prepare('SELECT * FROM cms_users WHERE id=? AND active=1').bind(identity.id).first();
  if (!actor) fail(403, 'This account does not have access to the rescue portal.');
  let claims;
  try { claims = JSON.parse(atob(token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))); } catch { fail(401, 'Please sign in again.'); }
  // Only inspect claims after the auth service has validated this exact token.
  const enrolled = (identity.factors || []).filter(factor => factor.status === 'verified');
  if (enrolled.length && claims.aal !== 'aal2') fail(403, 'MFA_REQUIRED');
  return { actor, token, identity };
}
export function decodeDog(row) {
  return { ...row, photos: JSON.parse(row.photos), health: JSON.parse(row.health), good_dogs: !!row.good_dogs, good_small_animals: !!row.good_small_animals, gentle_children: !!row.gentle_children };
}
export function publicDog(row) {
  const tags = [row.good_dogs && 'Good with other dogs', row.good_small_animals && 'Good with cats/small animals', row.gentle_children && 'Gentle with children'].filter(Boolean);
  return { slug: row.id, name: row.name, breed: row.breed, sex: row.sex, age: row.age, status: row.status === 'adopted' ? 'Adopted' : 'Available', description: row.description, photos: JSON.parse(row.photos), health: [...JSON.parse(row.health), ...tags] };
}
function audit(env, actor, action, target) {
  return env.DB.prepare('INSERT INTO cms_audit(actor_id,action,target_id) VALUES(?,?,?)').bind(actor.id, action, target);
}
function password(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) fail(400, 'Use a password between 12 and 128 characters.');
  return value;
}
export async function handleCms({ request, env, params }) {
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path || '');
  const method = request.method;
  if (path === 'config' && method === 'GET') {
    const config = authConfig(env);
    return json({ supabaseUrl: config.url, supabaseKey: config.key, smsMfaEnabled: env.CMS_SMS_MFA_ENABLED === 'true' });
  }
  const { actor, token } = await getActor(request, env);
  if (path === 'me' && method === 'GET') return json({ user: actor });
  if (path === 'password' && method === 'POST') {
    const body = await bodyJSON(request);
    await supabaseRequest(env, '/user', { token, method: 'PUT', body: { password: password(body.password) } });
    await env.DB.batch([
      env.DB.prepare('UPDATE cms_users SET must_change_password=0 WHERE id=?').bind(actor.id),
      audit(env, actor, 'password_changed', actor.id),
    ]);
    return json({ ok: true });
  }
  if (actor.must_change_password) fail(403, 'PASSWORD_CHANGE_REQUIRED');
  if (path === 'dogs' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM dogs ORDER BY deleted_at IS NOT NULL, name COLLATE NOCASE').all();
    return json({ dogs: results.filter(row => !row.deleted_at || actor.role === 'superuser').map(decodeDog) });
  }
  if (path === 'dogs' && method === 'POST') {
    const dog = validateDog(await bodyJSON(request));
    await checkPhotos(env, dog.photos);
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO dogs(id,name,breed,sex,age,good_dogs,good_small_animals,gentle_children,status,description,photos,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(id,dog.name,dog.breed,dog.sex,dog.age,dog.good_dogs,dog.good_small_animals,dog.gentle_children,dog.status,dog.description,JSON.stringify(dog.photos),actor.id),
      audit(env, actor, 'dog_created', id),
    ]);
    return json({ id }, 201);
  }
  const dogMatch = path.match(/^dogs\/([a-z0-9-]+)(\/restore)?$/);
  if (dogMatch) {
    const id = dogMatch[1];
    const current = await env.DB.prepare('SELECT * FROM dogs WHERE id=?').bind(id).first();
    if (!current) fail(404, 'That dog profile was not found.');
    if (method === 'DELETE' || (dogMatch[2] && method === 'POST')) {
      requireSuperuser(actor);
      const body = await bodyJSON(request);
      if (body.confirmName !== current.name) fail(400, 'Type the dog’s name exactly to confirm.');
      if (!Number.isInteger(body.version) || body.version !== current.version) fail(409, 'This profile changed. Reload it before continuing.');
      const restore = !!dogMatch[2];
      const result = await env.DB.prepare("UPDATE dogs SET deleted_at=?, version=version+1, updated_by=?, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND version=?")
        .bind(restore ? null : new Date().toISOString(),actor.id,id,body.version).run();
      if (!result.meta.changes) fail(409, 'This profile changed. Reload it before continuing.');
      await audit(env, actor, restore ? 'dog_restored' : 'dog_deleted', id).run();
      return json({ ok: true });
    }
    if (method === 'PUT' && !dogMatch[2]) {
      if (current.deleted_at) fail(409, 'Restore this profile before editing it.');
      const body = await bodyJSON(request);
      const dog = validateDog(body);
      if (!Number.isInteger(body.version)) fail(400, 'Reload this profile before saving.');
      await checkPhotos(env, dog.photos);
      const result = await env.DB.prepare("UPDATE dogs SET name=?,breed=?,sex=?,age=?,good_dogs=?,good_small_animals=?,gentle_children=?,status=?,description=?,photos=?,updated_by=?,version=version+1,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND version=? AND deleted_at IS NULL")
        .bind(dog.name,dog.breed,dog.sex,dog.age,dog.good_dogs,dog.good_small_animals,dog.gentle_children,dog.status,dog.description,JSON.stringify(dog.photos),actor.id,id,body.version).run();
      if (!result.meta.changes) fail(409, 'Someone else updated this profile. Reload it so you don’t overwrite their work.');
      await audit(env, actor, 'dog_updated', id).run();
      return json({ ok: true });
    }
  }
  if (path === 'photos' && method === 'POST') return uploadPhoto(request, env, actor);
  if (path === 'users' && method === 'GET') {
    requireSuperuser(actor);
    const { results } = await env.DB.prepare('SELECT id,email,name,role,active,must_change_password FROM cms_users ORDER BY name COLLATE NOCASE').all();
    return json({ users: results });
  }
  if (path === 'users' && method === 'POST') {
    requireSuperuser(actor);
    const body = await bodyJSON(request);
    const email = requiredText(body.email, 'Email address',254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email address.');
    const name = requiredText(body.name, 'Name',100);
    if (!['editor','superuser'].includes(body.role)) fail(400, 'Choose a valid account role.');
    if (await env.DB.prepare('SELECT id FROM cms_users WHERE email=?').bind(email).first()) fail(409, 'An account already uses that email address.');
    const user = await supabaseRequest(env, '/admin/users', { admin: true, method: 'POST', body: { email, password: password(body.password), email_confirm: true } });
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO cms_users(id,email,name,role) VALUES(?,?,?,?)').bind(user.id,email,name,body.role),
        audit(env, actor, 'user_created', user.id),
      ]);
    } catch (error) {
      await supabaseRequest(env, `/admin/users/${user.id}`, { admin: true, method:'DELETE' }).catch(() => {});
      throw error;
    }
    return json({ ok: true },201);
  }
  const userMatch = path.match(/^users\/([a-zA-Z0-9-]+)(\/reset-password)?$/);
  if (userMatch && method === 'PUT') {
    requireSuperuser(actor);
    const id = userMatch[1];
    if (id === actor.id) fail(400, 'Use My account for your own password. Ask another superuser to change your role or access.');
    const existing = await env.DB.prepare('SELECT id FROM cms_users WHERE id=?').bind(id).first();
    if (!existing) fail(404, 'That account was not found.');
    const body = await bodyJSON(request);
    if (userMatch[2]) {
      await supabaseRequest(env, `/admin/users/${id}`, { admin: true, method:'PUT', body: { password: password(body.password) } });
      await env.DB.batch([env.DB.prepare('UPDATE cms_users SET must_change_password=1 WHERE id=?').bind(id),audit(env,actor,'user_password_reset',id)]);
    } else {
      if (!['editor','superuser'].includes(body.role) || typeof body.active !== 'boolean') fail(400,'Choose a role and account status.');
      try {
        await env.DB.batch([env.DB.prepare('UPDATE cms_users SET name=?,role=?,active=? WHERE id=?').bind(requiredText(body.name,'Name',100),body.role,+body.active,id),audit(env,actor,'user_updated',id)]);
      } catch (error) {
        if (String(error).includes('Keep at least two')) fail(409,'Keep at least two active superusers. Add another superuser first.');
        throw error;
      }
    }
    return json({ ok: true });
  }
  fail(404, 'That portal action was not found.');
}
async function checkPhotos(env, photos) {
  for (const photo of photos) {
    if (!photo.startsWith('/media/')) {
      const known = await env.DB.prepare('SELECT dogs.id FROM dogs, json_each(dogs.photos) AS photo WHERE photo.value=? LIMIT 1').bind(photo).first();
      if (!known) fail(400,'That existing photo is not in the rescue’s photo collection.');
    } else {
      const upload = await env.DB.prepare('SELECT key FROM uploads WHERE key=?').bind(photo.slice('/media/'.length)).first();
      if (!upload) fail(400,'That upload could not be found. Please upload the photo again.');
    }
  }
}
async function uploadPhoto(request, env, actor) {
  if (!env.DOG_PHOTOS) fail(503, 'Photo storage has not been connected yet.');
  const max = 8 * 1024 * 1024;
  if (Number(request.headers.get('content-length')) > max) fail(413,'Each photo must be 8 MB or smaller.');
  const reader = request.body?.getReader();
  if (!reader) fail(400,'Choose a photo.');
  const chunks=[]; let length=0;
  while (true) {
    const {done,value}=await reader.read(); if (done) break;
    length+=value.byteLength;
    if (length>max) { await reader.cancel(); fail(413,'Each photo must be 8 MB or smaller.'); }
    chunks.push(value);
  }
  const bytes=new Uint8Array(length); let offset=0;
  for(const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.length;}
  const prefix=[...bytes.slice(0,12)];
  const png=prefix.slice(0,8).join(',')==='137,80,78,71,13,10,26,10';
  const jpg=prefix[0]===255 && prefix[1]===216 && prefix[2]===255;
  const webp=String.fromCharCode(...prefix.slice(0,4))==='RIFF' && String.fromCharCode(...prefix.slice(8,12))==='WEBP';
  if(!png&&!jpg&&!webp) fail(400,'Choose a JPEG, PNG, or WebP photo. SVG and other files are not accepted.');
  const ext=png?'png':jpg?'jpg':'webp';
  const key=`dogs/${crypto.randomUUID()}.${ext}`;
  await env.DOG_PHOTOS.put(key,bytes,{httpMetadata:{contentType:`image/${ext==='jpg'?'jpeg':ext}`}});
  try { await env.DB.batch([env.DB.prepare('INSERT INTO uploads(key,uploaded_by) VALUES(?,?)').bind(key,actor.id),audit(env,actor,'photo_uploaded',key)]); }
  catch(error) {await env.DOG_PHOTOS.delete(key);throw error;}
  return json({ photo:`/media/${key}` },201);
}
export async function cmsRequest(context) {
  const { request, env } = context;
  const origin=request.headers.get('origin');
  let allowedOrigin;
  try { allowedOrigin=new URL(env.CMS_ORIGIN).origin; } catch { return json({error:'The portal URL has not been configured yet.'},503); }
  if(origin!==allowedOrigin) return json({error:'Open the management portal to use this service.'},403);
  let response;
  try {
    if(request.method==='OPTIONS') response=new Response(null,{status:204});
    else response=await handleCms(context);
  } catch(error) {
    response=json({error:error instanceof HttpError ? error.message : 'The change could not be completed. Please try again.'},error instanceof HttpError?error.status:500);
  }
  response.headers.set('Access-Control-Allow-Origin',allowedOrigin);
  response.headers.set('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');
  response.headers.set('Access-Control-Allow-Headers','Authorization,Content-Type');
  response.headers.set('Vary','Origin');
  return response;
}
