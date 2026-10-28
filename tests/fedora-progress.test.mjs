import test from "node:test";
import assert from "node:assert/strict";
import {createCookbookProgress} from "../scripts/fedora-progress.mjs";

test("Streams split cookbook progress markers and hides provider output",()=>{
 const lines=[];
 const f=createCookbookProgress(line=>lines.push(line));
 f.push("[  1/65] R");
 f.push("UN 00-getting-started/01-next-launch.ts\n");
 f.push("Authorization: Bearer PRIVATE_SECRET\n");
 f.push("[  1/65] PASS 00-getting-started/01-next-launch.ts\n");
 f.push("[  2/65] FAIL 02-nasa/01-neows-feed.ts\n");
 f.push("COOKBOOK: provider returned private text\n");
 f.push("[  3/65] RUN 19-web-integration/02-verified-daily-tile.ts");
 f.flush();
 assert.deepEqual(lines,[
  "[  1/65] RUN 00-getting-started/01-next-launch.ts",
  "[  1/65] PASS 00-getting-started/01-next-launch.ts",
  "[  2/65] FAIL 02-nasa/01-neows-feed.ts",
  "[  3/65] RUN 19-web-integration/02-verified-daily-tile.ts"
 ]);
});
test("Rejects console escapes and overlong/untrusted lines",()=>{
 const lines=[];
 const f=createCookbookProgress(line=>lines.push(line));
 f.push("[1/65] PASS fake.ts\x1b[31m\n");
 f.push("x".repeat(3000));
 f.push("\n[5/65] RUN safe/05-example.ts\n");
 assert.deepEqual(lines,["[5/65] RUN safe/05-example.ts"]);
});
