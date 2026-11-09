import {test,expect} from '@playwright/test';
import {promises as fs} from 'node:fs';
import {createHash} from 'node:crypto';
test('native desktop invitation transfers the actual synthetic source',async({page})=>{
  test.setTimeout(120000);
  const source=process.env.NINGMAO_NATIVE_SOURCE!;
  const expected=await fs.readFile(source);
  await page.goto(process.env.NINGMAO_NATIVE_RECEIVE_URL!);
  const panel=page.locator('.receive-panel');
  await expect(panel.getByRole('button',{name:'Download files',exact:true})).toBeVisible();
  await page.evaluate(()=>Object.defineProperty(window,'showDirectoryPicker',{configurable:true,value:undefined}));
  const downloading=page.waitForEvent('download');
  await panel.getByRole('button',{name:'Download files',exact:true}).click();
  const download=await downloading;
  const bytes=await fs.readFile((await download.path())!);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(createHash('sha256').update(expected).digest('hex'));
  expect(bytes).toEqual(expected);
  expect(await fs.readFile(source)).toEqual(expected);
});
