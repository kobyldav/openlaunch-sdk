/**
 * Capture actual map views rendered by the public MyWeb application using OpenLaunch SDK.
 * No synthetic pixels, SVG illustrations, or fabricated fallback images.
 *
 * npm run gallery -- --only nasa-modis,sentinel2,ndvi
 * npm run gallery -- --only nasa-modis --date 2026-08-15
 * npm run gallery -- --all
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { createRequire } from "node:module";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const requireTools=createRequire(join(root,"tools/readme-gallery/package.json"));
let chromium;
try {
  ({chromium}=requireTools("playwright"));
} catch {
  console.error("Playwright not installed. Run: npm install --prefix tools/readme-gallery");
  process.exit(1);
}
const targets={
  "sentinel2":{button:"Sentinel-2",kind:"copernicus",file:"sentinel2-real-ui.png",title:"Sentinel-2 RGB"},
  "nasa-modis":{button:"NASA MODIS",kind:"nasa",file:"nasa-modis-real-ui.png",title:"NASA Terra MODIS"},
  "ndvi":{button:"Vegetace",kind:"copernicus",file:"ndvi-real-ui.png",title:"Sentinel-2 NDVI"},
  "radar":{button:"Radar SAR",kind:"copernicus",file:"radar-real-ui.png",title:"Sentinel-1 SAR"},
};
function parseOptions(argv){
  const opts={url:"https://www.kobylkadavid.cz",only:["sentinel2","nasa-modis","ndvi"],date:"2026-08-15",
    timeout:85000,out:join(root,"docs/images/live"),strict:false};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==="--help"||a==="-h"){
      console.log("npm run gallery -- [--all | --only sentinel2,nasa-modis,ndvi,radar] [--date YYYY-MM-DD] [--out DIR] [--strict] [--url https://...]");
      process.exit(0);
    }
    if(a==="--all"){opts.only=Object.keys(targets);continue;}
    if(a==="--strict"){opts.strict=true;continue;}
    if(!["--url","--only","--date","--out"].includes(a))throw Error("Unknown option: "+a);
    const value=argv[++i];if(!value)throw Error("Missing value for "+a);
    opts[a.slice(2)]=a==="--only"?value.split(",").filter(Boolean):value;
  }
  if(!Array.isArray(opts.only)||!opts.only.length||opts.only.some(x=>!Object.hasOwn(targets,x)))throw Error("Invalid --only selection");
  const url=new URL(opts.url);
  if(url.protocol!=="https:"||url.username||url.password)throw Error("Website URL must be HTTPS");
  if(!/^\d{4}-\d\d-\d\d$/.test(opts.date)||new Date(opts.date+"T00:00:00Z").toISOString().slice(0,10)!==opts.date)throw Error("Invalid date");
  opts.out=resolve(opts.out);
  return opts;
}
const opts=parseOptions(process.argv.slice(2));

async function capture(browser, spec, page){
  const button=page.locator("button.sx2-source").filter({hasText:spec.button}).first();
  await button.waitFor({state:"visible",timeout:25000});
  const alreadySelected=(await button.getAttribute("aria-pressed"))==="true";
  if(!alreadySelected){
    if(await button.isDisabled())throw Error(spec.title+" source is disabled on the live site");
    await button.click();
  }
  await page.waitForFunction(label=>{
    const el=[...document.querySelectorAll("button.sx2-source")].find(x=>x.textContent.includes(label));
    return el?.getAttribute("aria-pressed")==="true";
  },spec.button,{timeout:10000});
  if(spec.kind==="nasa"){
    await page.locator("input.sx2-date").fill(opts.date);
  }
  const start=Date.now();
  while(Date.now()-start<opts.timeout){
    const status=await page.evaluate(({kind})=>{
      const panel=document.querySelector(".sx2-shell");
      const selectors=kind==="nasa"
        ? [".sx2-map-images img"]
        : [".sx2-georaster.optical",".sx2-eo-detail img",".sx2-eo-background img"];
      const images=selectors.flatMap(selector=>[...(panel?.querySelectorAll(selector)||[])])
        .filter(el=>el.complete&&el.naturalWidth>=64&&el.naturalHeight>=64);
      return {count:images.length,error:panel?.querySelector(".sx2-alert")?.textContent?.trim()||null,
        status:panel?.querySelector(".sx2-health")?.textContent?.trim()||""};
    },{kind:spec.kind});
    if(status.error)throw Error("Live site displayed: "+status.error.slice(0,180));
    if(status.count>=(spec.kind==="nasa"?2:1)){
      // Capture only after decoded real provider imagery is present in the page.
      await page.waitForTimeout(1700);
      const file=join(opts.out,spec.file);
      await page.locator(".sx2-shell").screenshot({path:file,animations:"disabled",timeout:20000});
      console.log("Captured actual UI:",spec.title,"/",file,"/ images:",status.count);
      return {file:spec.file,provider:spec.title,loadedImages:status.count,requestedDate:spec.kind==="nasa"?opts.date:null};
    }
    await page.waitForTimeout(1100);
  }
  throw Error("No validated rendered image appeared within "+opts.timeout/1000+" seconds for "+spec.title);
}
async function run(){
  await mkdir(opts.out,{recursive:true});
  const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
  const saved=[],errors=[];
  try{
    const context=await browser.newContext({
      viewport:{width:1600,height:1000},deviceScaleFactor:1.5,
      locale:"cs-CZ",colorScheme:"dark",reducedMotion:"reduce"
    });
    const page=await context.newPage();
    page.setDefaultTimeout(25000);
    const browserErrors=[];
    page.on("pageerror",error=>browserErrors.push("pageerror: "+error.message.slice(0,300)));
    page.on("console",msg=>{if(msg.type()==="error")browserErrors.push("console: "+msg.text().slice(0,300));});
    await page.goto(opts.url,{waitUntil:"domcontentloaded",timeout:45000});
    // MyWeb mounts the map lazily when the systems section enters the viewport.
    await page.locator("#systems").scrollIntoViewIfNeeded({timeout:25000});
    try{
      await page.locator(".sx2-shell").waitFor({state:"visible",timeout:15000});
    }catch(error){
      const state=await page.evaluate(()=>({
        title:document.title,
        url:location.href,
        sectionText:document.querySelector("#systems")?.innerText.slice(0,1400)||null,
        sectionHtml:document.querySelector("#systems")?.innerHTML.slice(0,2400)||null,
        bodyStart:document.body?.innerText.slice(0,1200)||null,
        sdkPanels:document.querySelectorAll(".sx2-shell").length
      }));
      console.error("LIVE SITE DOM DIAGNOSTIC:",JSON.stringify({state,browserErrors},null,2));
      await page.screenshot({path:join(opts.out,"diagnostic-not-for-readme.png"),fullPage:false}).catch(()=>{});
      throw error;
    }
    for(const name of opts.only){
      try{
        saved.push(await capture(browser,targets[name],page));
      }catch(error){
        console.error("Capture failed:",name,error.message);
        errors.push({name,reason:error.message});
      }
    }
    await context.close();
  }finally{await browser.close();}
  const manifest={site:opts.url,capturedAt:new Date().toISOString(),kind:"actual-browser-screenshots",
    technicalSource:"MyWeb web application consuming OpenLaunch SDK",selected:opts.only,saved,errors,
    notes:["Captured only after actual browser image decoding; no synthetic fallback.",
      "Provider data quality, freshness and scientific provenance remain dependent on the live service.",
      "Live site can be unavailable or rate-limited; failures are reported, never filled with stock imagery."]};
  await writeFile(join(opts.out,"capture-manifest.json"),JSON.stringify(manifest,null,2)+"\n");
  console.log("Completed",saved.length,"/",opts.only.length,"real captures");
  if(errors.length){process.exitCode=1;}
}
run().catch(e=>{console.error(e.stack||e);process.exitCode=1;});