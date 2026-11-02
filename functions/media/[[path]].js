export async function onRequestGet({request,env,params}) {
  const key=Array.isArray(params.path)?params.path.join('/'):params.path;
  if(!/^dogs\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(key||'')||!env.DB||!env.DOG_PHOTOS) return new Response('Not found',{status:404});
  const used=await env.DB.prepare('SELECT dogs.id FROM dogs, json_each(dogs.photos) AS photo WHERE dogs.deleted_at IS NULL AND photo.value=? LIMIT 1').bind(`/media/${key}`).first();
  if(!used) return new Response('Not found',{status:404});
  const object=await env.DOG_PHOTOS.get(key);
  if(!object) return new Response('Not found',{status:404});
  const headers=new Headers({'X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'public, max-age=60'});
  object.writeHttpMetadata(headers);
  headers.set('ETag',object.httpEtag);
  return new Response(request.method==='HEAD'?null:object.body,{headers});
}
export const onRequestHead=onRequestGet;
