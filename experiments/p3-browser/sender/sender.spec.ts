import {test,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {promises as fs} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

function sender(paths:string[],code='acid-acorn-acre'){
  const child=spawn(process.env.NINGMAO_SENDER_BINARY!,[],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='';child.stdout.on('data',data=>output+=data.toString());
  const done=new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
  child.stdin.write(JSON.stringify({relay:`127.0.0.1:${process.env.CROC_E2E_RELAY_PORTS!.split(',')[0]}`,password:'pass123',code,paths})+'\n');
  return {child,done,events:()=>output.trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)),output:()=>output};
}

test('Ningmao sender waits for browser verification and preserves source',async({page},info)=>{
  const path=info.outputPath('中文 合成.txt'),bytes=Buffer.from('Ningmao structured browser sender\n'.repeat(5000));
  await fs.writeFile(path,bytes);
  const code=randomUUID(),transfer=sender([path],code);
  try{
    await expect.poll(()=>transfer.events().map(e=>e.phase)).toEqual(['queued','waiting']);
    await page.goto('/');
    await page.getByRole('button',{name:'Receive files',exact:true}).click();
    const panel=page.locator('.receive-panel');
    await panel.getByLabel('Croc code or stored link').fill(code);
    await panel.getByLabel('Croc code or stored link').press('Enter');
    await expect(panel.getByRole('button',{name:'Download files',exact:true})).toBeVisible();
    expect(transfer.events().map(e=>e.phase)).toEqual(['queued','waiting']);
    await page.evaluate(()=>Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:undefined}));
    const downloading=page.waitForEvent('download');
    await panel.getByRole('button',{name:'Download files',exact:true}).click();
    const download=await downloading;
    const received=await fs.readFile((await download.path())!);
    const sha=(value:Buffer)=>createHash('sha256').update(value).digest('hex');
    expect(sha(received)).toBe(sha(bytes));expect(sha(await fs.readFile(path))).toBe(sha(bytes));
    expect(await transfer.done).toBe(0);
    expect(transfer.events().map(e=>e.phase)).toEqual(['queued','waiting','verified']);
    expect(transfer.events().at(-1)).toEqual({version:1,phase:'verified',files:1,total:bytes.length});
    expect(transfer.output()).not.toContain('acid');expect(transfer.output()).not.toContain(path);
    expect(transfer.output()).not.toContain(code);
    await fs.writeFile(process.env.NINGMAO_EVENT_PROOF!,transfer.output());
  }finally{if(transfer.child.exitCode===null)transfer.child.kill();}
});

test('Ningmao sender cancellation is terminal without a receiver',async({},info)=>{
  const path=info.outputPath('cancel.txt');await fs.writeFile(path,'synthetic cancel');
  const transfer=sender([path]);
  try{
    await expect.poll(()=>transfer.events().map(e=>e.phase)).toEqual(['queued','waiting']);
    transfer.child.stdin.write('{"cancel":true}\n');
    expect(await transfer.done).not.toBe(0);
    expect(transfer.events().map(e=>e.phase)).toEqual(['queued','waiting','cancelled']);
    await fs.writeFile(process.env.NINGMAO_CANCEL_PROOF!,transfer.output());
  }finally{if(transfer.child.exitCode===null)transfer.child.kill();}
});
