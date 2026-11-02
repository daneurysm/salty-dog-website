import { readFileSync, writeFileSync } from 'node:fs';
const content=readFileSync('public/dogs.js','utf8');
const profiles=JSON.parse(content.slice(content.indexOf('=')+1).trim().replace(/;$/,''));
const sql=value=>`'${String(value).replaceAll("'","''")}'`;
const statements=profiles.map(d=>`INSERT INTO dogs(id,name,breed,sex,age,status,description,photos,health) VALUES(${[d.slug,d.name,d.breed,d.sex,d.age||'',String(d.status).toLowerCase()==='adopted'?'adopted':'available',d.description,JSON.stringify(d.photos.map(p=>p.startsWith('/')?p:`/${p}`)),JSON.stringify(d.health||[])].map(sql).join(',')}) ON CONFLICT(id) DO NOTHING;`);
writeFileSync('setup/import-dogs.sql','-- Imports existing profiles without overwriting CMS edits. Review adoption statuses before enabling CMS data.\n'+statements.join('\n')+'\n');
console.log(`Prepared ${profiles.length} existing profiles for import.`);
