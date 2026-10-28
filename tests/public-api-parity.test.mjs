import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const packages=[{name:pkg.name,base:root,entries:pkg.exports}];
for(const name of ['core','earth','raster','launches','orbit','math','engineering']){
 const base=join(root,'packages',name);
 const manifest=JSON.parse(await readFile(join(base,'package.json'),'utf8'));
 packages.push({name:manifest.name,base,entries:{'.':manifest.exports['.']}});
}
for(const pack of packages){
 for(const [sub,entry] of Object.entries(pack.entries)){
  if(!entry?.import||!entry?.require)continue;
  test(`${pack.name}${sub} all runtime exports agree across ESM and CommonJS`,async()=>{
   const esm=await import(pathToFileURL(join(pack.base,entry.import)).href);
   const cjs=require(join(pack.base,entry.require));
   const a=Object.keys(esm).sort(),b=Object.keys(cjs).sort();
   assert.ok(a.length>0,'Unexpectedly empty exports');
   assert.deepEqual(a,b,'All exports must be present in both runtime formats');
   for(const key of a){
    assert.notEqual(esm[key],undefined,`ESM ${key} is undefined`);
    assert.equal(typeof esm[key],typeof cjs[key],`${key} type mismatched`);
   }
  });
 }
}
async function walk(folder){
 const files=[];
 for(const entry of await readdir(folder,{withFileTypes:true})){
  const path=join(folder,entry.name);
  if(entry.isDirectory())files.push(...await walk(path));
  else if(entry.isFile()&&path.endsWith('.ts'))files.push(relative(join(root,'examples'),path).replaceAll('\\','/'));
 }
 return files;
}
test('Every TypeScript example is uploaded and registered exactly once in catalog.json',async()=>{
 const catalog=JSON.parse(await readFile(join(root,'examples','catalog.json'),'utf8'));
 assert.ok(Array.isArray(catalog.examples));
 const files=(await walk(join(root,'examples'))).sort();
 const declared=catalog.examples.map(e=>e.path).sort();
 assert.deepEqual(files,declared,'Missing or unregistered examples');
 for(const item of catalog.examples){
  assert.ok(item.title&&item.category&&item.description,item.path);
  assert.equal(typeof item.network,'boolean',item.path);
  assert.ok(Array.isArray(item.symbols)&&item.symbols.length>0,item.path);
 }
});
