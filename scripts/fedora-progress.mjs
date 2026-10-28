/** Allowlist only cookbook RUN/PASS/FAIL lines from child stdout on terminal. */
const MARKER=/^\[\s*\d{1,3}\/\d{1,3}\]\s+(?:RUN|PASS|FAIL)\s+[A-Za-z0-9_.\/-]+\.ts$/;
export function createCookbookProgress(onLine){
 let carry="";
 const accept=(line)=>{
  const cleaned=line.replace(/\r$/,"");
  if(cleaned.length<=512&&MARKER.test(cleaned))onLine(cleaned);
 };
 return {
  push(chunk){
   carry+=String(chunk);
   let end;
   while((end=carry.indexOf("\n"))>=0){
    accept(carry.slice(0,end));
    carry=carry.slice(end+1);
   }
   if(carry.length>512)carry="";
  },
  flush(){if(carry)accept(carry);carry="";}
 };
}
