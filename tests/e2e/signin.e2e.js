const { chromium } = require('playwright');
const B='http://localhost:' + (process.env.CS_E2E_PORT || 8765) + '/';
(async()=>{const b = require('./_test-config.js').withTestConfig(await chromium.launch());const p=await b.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)process.exitCode=1;};
await p.goto(B+'index.html'); ok(await p.locator('#nav-bnet').isHidden(),'entry hidden by default');
await p.goto(B+'signin.html'); ok(await p.locator('#si-disabled').isVisible(),'signin disabled when flag off');
await p.goto(B+'index.html?ff_bnet=1'); ok(await p.locator('#nav-bnet').isVisible(),'entry visible with flag');
await p.click('#nav-bnet a'); await p.waitForSelector('#si-start:not([hidden])');
ok(await p.evaluate(()=>document.activeElement.id)==='si-start-h','focus on start heading');
await p.click('#si-signin'); await p.waitForSelector('#si-authorize:not([hidden])');
await p.click('#si-authorize-cancel'); await p.waitForSelector('#si-cancelled:not([hidden])'); ok(true,'cancelled state');
await p.click('#si-cancelled [data-action=restart]'); await p.click('#si-signin'); await p.waitForSelector('#si-authorize:not([hidden])');
await p.keyboard.press('Tab'); // focus moves via keyboard
await p.focus('#si-authorize-ok'); await p.keyboard.press('Enter');
// web#42: return_to=/profile/ -> the user lands on the profile (no main/alt picker)
await p.waitForURL(/\/profile\/$/); ok(true,'mock callback honours return_to=/profile/');
await p.waitForSelector('#pf-ready:not([hidden])'); ok(await p.isVisible('#pf-choose'),'first visit: choose characters to display step');
ok(await p.locator('input[name=main], input[name=alt], [data-role=main]').count()===0,'no main/alt UI on profile');
await p.goto(B+'signin.html'); await p.waitForURL(/\/profile\/$/); ok(true,'signed-in visit to signin.html goes to profile');
await p.goto(B+'signin.html?auth=error&reason=upstream_unavailable'); await p.waitForSelector('#si-error:not([hidden])'); ok((await p.textContent('#si-error-msg')).includes('not responding'),'callback reason message');
await p.goto(B+'signin.html?auth=error&reason=bogus'); await p.waitForSelector('#si-error:not([hidden])');
const bad=async(w)=>{const t=await p.evaluate(()=>document.body.innerText);ok(!/\b(undefined|null)\b/i.test(t),'no undefined/null ('+w+')');};
await bad('unknown reason');
await p.evaluate(()=>CSAuthMock.logout()); await p.goto(B+'signin.html'); await p.waitForSelector('#si-start:not([hidden])');
ok((await p.textContent('#si-signin')).trim()==='Login / Create account with Battle.net','button reads Login / Create account with Battle.net');
// real-API start URL carries return_to=/profile/
const p2=await b.newPage(); await require('./_test-config.js').forceTestConfig(p2.context(),{FEATURE_BNET_SIGNIN:true,USE_MOCK_AUTH:false,USE_MOCK_PROFILE:false});
let startUrl=null; await p2.route('https://api.crusaderstrike.com/**',r=>{const u=r.request().url(); if(/auth\/blizzard\/login/.test(u)){startUrl=u;return r.fulfill({status:200,body:'ok'});} return r.fulfill({status:401,headers:{'access-control-allow-origin':B.slice(0,-1),'access-control-allow-credentials':'true','content-type':'application/json'},body:'{"error":{"code":"unauthorized"}}'});});
await p2.goto(B+'signin.html'); await p2.waitForSelector('#si-start:not([hidden])'); await p2.click('#si-signin'); await p2.waitForTimeout(800);
ok(startUrl && new URL(startUrl).searchParams.get('return_to')==='/profile/','live sign-in return_to=/profile/: '+startUrl);
await p.setViewportSize({width:375,height:800}); await p.goto(B+'signin.html');await p.waitForSelector('#si-start:not([hidden])');
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=375),'no horizontal overflow at 375px');
await p.goto(B+'leaderboards.html'); const c1=await p.textContent('#lb-caption'); console.log(' caption:',c1);
await p.selectOption('#filter-realm','Emberfall'); await p.click('button.cs-sort[data-sort=score]'); const c2=await p.textContent('#lb-caption'); console.log(' caption:',c2);
ok(c2.includes('Emberfall')&&c2.includes('sorted by Score, descending'),'caption reflects filter+sort');
ok(errs.length===0,'no page errors '+errs.join('|'));
const html=await p.evaluate(async()=>{let s='';for(const f of ['js/signin.js','js/auth-mock.js','js/leaderboards.js'])s+=await (await fetch(f)).text();return s});
ok(!/innerHTML/.test(html),'no innerHTML in JS');
await b.close();})();
