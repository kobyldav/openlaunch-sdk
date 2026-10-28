#!/usr/bin/env node
/** Public runtime export inventory and textual reference audit.
 * A reference in an example is NOT proof that the API behavior is correct.
 */
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const root=fileURLToPath(new URL('../',import.meta.url));
const require=createRequire(import.meta.url);
const option=process.argv.find(x=>x.startsWith('--output='));
const dest=resolve(root,option?.slice(9)??'test-results/api-surface');
if(process.argv.some(x=>x.startsWith('--')&&!x.startsWith('--output=')))
 throw Error('Usage: node scripts/api-surface-audit.mjs [--output=directory]');
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8'));
const packages=[{name:pkg.name,exports:pkg.exports,base:root}];
for(const name of ['core','earth','raster','launches','orbit','math','engineering']){
 const base=join(root,'packages',name);
 const manifest=JSON.parse(await readFile(join(base,'package.json'),'utf8'));
 packages.push({name:manifest.name,exports:{'.':manifest.exports['.']},base});
}
const collected=[],errors=[];
for(const pack of packages){
 for(const [subpath,paths] of Object.entries(pack.exports)){
  if(!paths||!paths.import||!paths.require)continue;
  const moduleId=pack.name+(subpath==='.'?'':subpath.slice(1));
  try{
   const esm=await import(pathToFileURL(join(pack.base,paths.import)).href);
   const cjs=require(join(pack.base,paths.require));
   const esmKeys=Object.keys(esm).sort(),cjsKeys=Object.keys(cjs).sort();
   const missingInCjs=esmKeys.filter(x=>!Object.hasOwn(cjs,x));
   const missingInEsm=cjsKeys.filter(x=>!Object.hasOwn(esm,x));
   if(missingInCjs.length||missingInEsm.length)errors.push({module:moduleId,missingInCjs,missingInEsm});
   const exports=esmKeys.map(name=>({name,kind:typeof esm[name]}));
   const methods=[];
   for(const key of esmKeys){
    const value=esm[key];
    if(typeof value!=='function'||!/^class\s/.test(Function.prototype.toString.call(value)))continue;
    for(const method of Object.getOwnPropertyNames(value.prototype??{}).filter(x=>x!=='constructor')){
     if(typeof Object.getOwnPropertyDescriptor(value.prototype,method)?.value==='function')methods.push({class:key,method});
    }
   }
   collected.push({module:moduleId,publicExportCount:esmKeys.length,exports,methods,missingInCjs,missingInEsm});
  }catch(err){errors.push({module:moduleId,error:String(err)});}
 }
}
const catalog=JSON.parse(await readFile(join(root,'examples/catalog.json'),'utf8'));
const entries=catalog.examples??[];
async function walk(dir){
 const result=[];
 for(const ent of await readdir(dir,{withFileTypes:true})){
  const p=join(dir,ent.name);
  if(ent.isDirectory())result.push(...await walk(p));
  else if(ent.isFile()&&p.endsWith('.ts'))result.push(p);
 }
 return result;
}
const examplePaths=(await walk(join(root,'examples'))).map(p=>relative(join(root,'examples'),p).replaceAll('\\','/')).sort();
const registered=entries.map(e=>e.path).sort();
const unregistered=examplePaths.filter(p=>!registered.includes(p));
const missing=registered.filter(p=>!examplePaths.includes(p));
const duplicates=registered.filter((p,i)=>registered.indexOf(p)!==i);
if(unregistered.length||missing.length||duplicates.length)errors.push({catalog:{unregistered,missing,duplicates}});
const testFiles=(await readdir(join(root,'tests'))).filter(p=>p.endsWith('.test.mjs'));
const exampleTokens=new Set(),testTokens=new Set();
const tokenRe=/[A-Za-z_$][\w$]*/g;
function tokens(source,set){for(const word of source.match(tokenRe)??[])set.add(word);}
for(const path of examplePaths)tokens(await readFile(join(root,'examples',path),'utf8'),exampleTokens);
for(const path of testFiles)tokens(await readFile(join(root,'tests',path),'utf8'),testTokens);
const distinct=new Set(collected.flatMap(m=>m.exports.map(e=>e.name)));
const noExample=[...distinct].filter(n=>!exampleTokens.has(n)).sort();
const noTest=[...distinct].filter(n=>!testTokens.has(n)).sort();
const methods=collected.flatMap(mod=>mod.methods.map(item=>({...item,module:mod.module,seenInExamples:exampleTokens.has(item.method),seenInTests:testTokens.has(item.method)})));
const stats={packages:packages.length,entrypoints:collected.length,distinctRuntimeSymbols:distinct.size,exportRecords:collected.reduce((n,m)=>n+m.publicExportCount,0),classMethods:methods.length,examples:examplePaths.length,offlineExamples:entries.filter(e=>e.network===false).length,onlineExamples:entries.filter(e=>e.network===true).length,exampleSymbolsReferenced:distinct.size-noExample.length,testSymbolsReferenced:distinct.size-noTest.length,unreferencedExportNames:noExample.length,unreferencedClassMethods:methods.filter(x=>!x.seenInExamples).length,errors:errors.length};
const report={purpose:'API shape and textual reference audit, NOT functional coverage proof',sdkVersion:pkg.version,stats,errors,modules:collected,unreferencedExportNames:noExample,unreferencedTestExportNames:noTest,methods};
await mkdir(dest,{recursive:true});
await writeFile(join(dest,'public-api.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(join(dest,'public-api.txt'),[
 'OpenLaunch public API audit - '+pkg.version,
 'IMPORTANT: a text reference or matching export is not proof of behavioral correctness.',
 ...Object.entries(stats).map(([k,v])=>k+': '+v),
 'Unreferenced symbols in examples: '+noExample.join(', '),
 'ESM/CJS parity errors: '+JSON.stringify(errors)
].join('\n')+'\n');
console.log('API AUDIT',JSON.stringify(stats));
console.log('Unreferenced example export names (first 30):',noExample.slice(0,30).join(', ')||'none');
console.log('Report:',dest);
if(errors.length)process.exitCode=1;
