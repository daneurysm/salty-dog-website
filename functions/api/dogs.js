import { json, publicDog } from '../../lib/cms.mjs';
export async function onRequestGet({ env }) {
  if(env.CMS_ENABLED!=='true') return json({enabled:false});
  if(!env.DB) return json({error:'Dog profiles are temporarily unavailable.'},503);
  try {
    const { results }=await env.DB.prepare('SELECT * FROM dogs WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE').all();
    return json({enabled:true,profiles:results.map(publicDog)});
  } catch {return json({error:'Dog profiles are temporarily unavailable.'},503);}
}
