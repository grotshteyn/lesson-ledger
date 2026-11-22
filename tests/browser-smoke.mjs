// Unauthenticated shell smoke only. Do not claim this verifies the 12 authenticated wireframes.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:8765';
await mkdir('browser-evidence',{recursive:true});
const browser=await chromium.launch({headless:true});
const report=[];
try{
  for(const width of [360,1280]){
    const context=await browser.newContext({viewport:{width,height:800},deviceScaleFactor:1,isMobile:width===360,hasTouch:width===360});
    const page=await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(2500);
    await page.screenshot({path:`browser-evidence/login-${width}.png`,fullPage:true});
    const snapshot=await page.evaluate(()=>({lang:document.documentElement.lang,title:document.title,body:document.body.innerText.slice(0,350),scrollWidth:document.documentElement.scrollWidth,innerWidth:window.innerWidth,hasPassword:!!document.querySelector('input[type=password]')}));
    report.push({width,...snapshot,pageErrors:errors});
    assert.equal(snapshot.lang,'de');
    assert.ok(snapshot.scrollWidth<=snapshot.innerWidth+1,`Horizontal overflow at ${width}: ${snapshot.scrollWidth} > ${snapshot.innerWidth}`);
    assert.equal(errors.length,0,`JS errors at ${width}: ${errors.join('; ')}`);
    if(snapshot.hasPassword){
      await page.locator('input[type=password]').focus();
      await page.screenshot({path:`browser-evidence/login-keyboard-focus-${width}.png`,fullPage:true});
    }
    await context.close();
  }
}finally{
  await writeFile('browser-evidence/smoke.json',JSON.stringify(report,null,2));
  await browser.close();
}
console.log('Unauthenticated browser smoke:',JSON.stringify(report));
