import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const script=fileURLToPath(new URL("../scripts/preflight.mjs",import.meta.url));
test("W4 Cloudflare production deployment fails closed without owner approval",()=>{
  const env={...process.env,NINGMAO_W4_DEPLOY_APPROVED:""};
  const result=spawnSync(process.execPath,[script,"--deploy"],{env,encoding:"utf8"});
  assert.notEqual(result.status,0,"an unapproved production deploy must be blocked");
  assert.match(result.stderr,/缺少明确的公网部署审批/);
});
test("W4 source preflight still runs with only placeholder configuration",()=>{
  const result=spawnSync(process.execPath,[script,"--source"],{encoding:"utf8"});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/PASS: --source/);
});
