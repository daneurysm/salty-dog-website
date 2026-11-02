import { build } from 'esbuild';
await build({entryPoints:['admin/src/cms.js'],outfile:'admin/public/cms.js',bundle:true,format:'esm',target:'es2022',minify:true});
console.log('Built the separate management portal in admin/public.');
