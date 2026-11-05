const { chromium } = require('playwright');
const B='http://localhost:8765/';
(async()=>{const b=await chromium.launch();const ctx=await b.newContext();const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)process.exitCode=1;};
const vis=s=>p.waitForSelector(s+':not([hidden])',{timeout:5000}).then(()=>true,()=>false);
await p.goto(B+'profile/'); ok(await vis('#pf-disabled'),'flag off -> coming soon');
await p.goto(B+'profile/?ff_bnet=1'); ok(await vis('#pf-signedout'),'signed out state');
// sign in (mock) with a saved main
await p.evaluate(()=>{CSAuthMock.devSignIn();localStorage.setItem('cs_mock_selection',JSON.stringify({main_id:'ch_us_1001',alt_ids:['ch_us_1003'],updated_at:'2026-11-04T18:00:00Z'}));});
await p.goto(B+'profile/'); ok(await p.isVisible('#pf-loading'),'loading state'); ok(await vis('#pf-ready'),'ready');
ok((await p.textContent('#pf-battletag'))==='Crusader#1234','battletag');
ok(await p.locator('#pf-list > li').count()===6,'6 WoW Forever cards incl. stale (non-Forever filtered)');
const card=id=>p.locator(`#pf-list > li[data-id=${id}]`);
ok((await card('ch_us_1001').locator('[data-role]').textContent())==='Main' && await card('ch_us_1001').evaluate(e=>e.classList.contains('is-main')),'main marked');
ok((await card('ch_us_1002').locator('[data-role]').textContent())==='Alt','others alts');
ok((await card('ch_us_1001').locator('.pf-meta').textContent())==='Emberfall · US · Level 60 · Human Paladin','meta');
// web#26 no faction
const nf=card('ch_us_1005').locator('.cs-badge').first();
ok((await nf.textContent())==='No faction' && await nf.getAttribute('aria-label')==='Faction: none' && !(await nf.getAttribute('class')).includes('horde'),'no-faction neutral badge, not Horde');
ok((await card('ch_us_1003').locator('.cs-badge').first().textContent())==='Horde','horde still Horde');
ok(await p.locator('fieldset#pf-fieldset legend').textContent()==='Main character','labelled radio group');
ok(await p.getAttribute('#pf-main-ch_us_1002','aria-describedby')==='pf-name-ch_us_1002','radio described by name');
// stale (platform#30)
const sc=card('ch_eu_2001');
ok(await sc.locator('.pf-stale').count()===1 && await p.isDisabled('#pf-main-ch_eu_2001') && (await sc.locator('[data-role]').textContent())==='Not available','stale flagged, not selectable');
const r400=await p.evaluate(()=>CSAuthMock.session().then(s=>CSAuthMock.saveSelection({main_id:'ch_eu_2001',alt_ids:[]},s.body.csrf_token)));
ok(r400.status===400 && r400.body.errors.main_id,'mock: stale main -> 400');
const r400b=await p.evaluate(()=>CSAuthMock.session().then(s=>CSAuthMock.saveSelection({main_id:'ch_us_1001',alt_ids:['ch_eu_2001']},s.body.csrf_token)));
ok(r400b.status===400 && r400b.body.errors.alt_ids,'mock: stale alt -> 400');
// profile endpoint + region
ok(await p.inputValue('#pf-region')==='us','preferred_region from GET /me/profile');
await p.selectOption('#pf-region','eu'); await p.waitForFunction(()=>/Preferred region saved/.test(document.getElementById('pf-status').textContent));
const prof=await p.evaluate(()=>CSAuthMock.profile().then(r=>r.body)); ok(prof.preferred_region==='eu' && prof.main_character_id==='ch_us_1001' && prof.battletag==='Crusader#1234','PUT /me/profile saved; UserProfile shape');
await p.selectOption('#pf-region','tw'); await p.waitForFunction(()=>CSAuthMock.profile().then(r=>r.body.preferred_region==='tw'));
const kr=await p.evaluate(()=>CSAuthMock.session().then(s=>CSAuthMock.updateProfile({preferred_region:'kr'},s.body.csrf_token)));
ok(kr.status===200&&kr.body.preferred_region==='kr','regions kr/tw accepted');
const bad=await p.evaluate(()=>CSAuthMock.session().then(s=>CSAuthMock.updateProfile({preferred_region:'cn'},s.body.csrf_token)));
ok(bad.status===400&&bad.body.errors.preferred_region,'unknown region -> 400');
await p.evaluate(()=>CSAuthMock.session().then(s=>CSAuthMock.updateProfile({preferred_region:'eu'},s.body.csrf_token)));
const pb=await p.evaluate(()=>CSAuthMock.session().then(s=>CSAuthMock.updateProfile({main_character_id:'x'},s.body.csrf_token))); ok(pb.status===400 && pb.body.errors.body,'mock: unknown profile field -> 400 errors.body');
// keyboard select via arrow keys within radio group
await p.focus('#pf-main-ch_us_1001'); await p.keyboard.press('ArrowDown');
await p.waitForFunction(()=>document.querySelector('[data-id=ch_us_1002]').classList.contains('is-main'));
await p.waitForFunction(()=>/Main saved/.test(document.getElementById('pf-status').textContent));
ok(true,'keyboard sets main + announced');
const sel=await p.evaluate(()=>JSON.parse(localStorage.getItem('cs_mock_selection')));
ok(sel.main_id==='ch_us_1002' && sel.alt_ids.length===4 && !sel.alt_ids.includes('ch_us_1002'),'PUT body: main + all others alts');
await p.reload(); await vis('#pf-ready'); ok(await p.isChecked('#pf-main-ch_us_1002'),'persists across reload');
// 403 csrf_failed
await p.evaluate(()=>{const s=JSON.parse(sessionStorage.getItem('cs_mock_session'));s.csrf_token='rotated';sessionStorage.setItem('cs_mock_session',JSON.stringify(s));});
await p.check('#pf-main-ch_us_1003'); ok(await vis('#pf-save-error'),'csrf error shown');
ok((await p.textContent('#pf-save-error')).includes('Security check failed. Reload'),'403 csrf_failed message');
ok(await p.isChecked('#pf-main-ch_us_1002'),'rolled back after 403');
await p.reload(); await vis('#pf-ready');
// 429 + 400 body on save
await p.goto(B+'profile/?mock_scenario=save_ratelimit'); await vis('#pf-ready'); await p.check('#pf-main-ch_us_1004'); await vis('#pf-save-error');
ok((await p.textContent('#pf-save-error')).includes('Try again in 5 seconds'),'429 Retry-After on save: '+await p.textContent('#pf-save-error'));
await p.goto(B+'profile/?mock_scenario=save_body'); await vis('#pf-ready'); await p.check('#pf-main-ch_us_1004'); await vis('#pf-save-error');
ok((await p.textContent('#pf-save-error')).includes('Request body is invalid.'),'400 errors.body message');
// rollback on save error
await p.goto(B+'profile/?mock_scenario=save_error'); await vis('#pf-ready');
await p.check('#pf-main-ch_us_1004');
ok(await p.evaluate(()=>document.querySelector('[data-id=ch_us_1004]').classList.contains('is-main')),'optimistic update');
ok(await vis('#pf-save-error'),'save error shown');
ok(await p.isChecked('#pf-main-ch_us_1002') && !(await p.isChecked('#pf-main-ch_us_1004')),'rolled back');
// refresh
await p.goto(B+'profile/'); await vis('#pf-ready'); await p.click('#pf-refresh');
ok((await p.textContent('#pf-refresh'))==='Refreshing…' && await p.isDisabled('#pf-refresh'),'refresh loading');
await p.waitForFunction(()=>document.getElementById('pf-refresh').textContent==='Refresh characters'); ok(await p.isHidden('#pf-refresh-error'),'refresh ok');
await p.goto(B+'profile/?mock_scenario=refresh_error'); await vis('#pf-ready'); await p.click('#pf-refresh'); ok(await vis('#pf-refresh-error'),'refresh error');
ok((await p.textContent('#pf-refresh-error'))==='Battle.net is unavailable, try again later','502 message');
// CSRF header: real client sends X-CSRF-Token on refresh
await p.goto(B+'profile/?mock_scenario=refresh_ratelimit'); await vis('#pf-ready'); await p.click('#pf-refresh');
await p.waitForFunction(()=>/Refresh again in \d+s/.test(document.getElementById('pf-refresh').textContent));
ok(await p.isDisabled('#pf-refresh') && (await p.textContent('#pf-refresh-error')).includes('3 seconds'),'429 Retry-After countdown, button disabled: '+await p.textContent('#pf-refresh'));
await p.waitForFunction(()=>document.getElementById('pf-refresh').textContent==='Refresh characters'&&!document.getElementById('pf-refresh').disabled,null,{timeout:6000});
ok(true,'button re-enabled after countdown');
// refresh clears selection (main went stale) -> picker
await p.goto(B+'profile/?mock_scenario=refresh_stale'); await vis('#pf-ready'); await p.click('#pf-refresh'); await p.waitForURL(/signin\.html/);
ok(true,'refresh cleared selection -> sent to picker');
await vis('#si-picker'); ok(await p.locator('#si-main-ch_eu_2001').count()===0 && await p.locator('#si-main-ch_us_1002').count()===0,'picker hides stale characters');
await p.evaluate(()=>{CSAuthMock.devReset();localStorage.setItem('cs_mock_selection',JSON.stringify({main_id:'ch_us_1002',alt_ids:[],updated_at:'2026-11-04T18:00:00Z'}));});
// states
await p.goto(B+'profile/?mock_scenario=empty'); await vis('#pf-ready'); ok(await p.isVisible('#pf-empty') && await p.isHidden('#pf-fieldset'),'empty state');
await p.goto(B+'profile/?mock_scenario=upstream'); ok(await vis('#pf-error'),'error state'); ok((await p.textContent('#pf-error-msg'))==='Battle.net is unavailable, try again later','502 load message');
// no main -> picker
await p.goto(B+'profile/?mock_scenario=nomain'); await p.waitForURL(/signin\.html/); ok(true,'no main -> sent to picker');
await vis('#si-picker'); const nb=p.locator('#si-list li:has(#si-main-ch_us_1005) .cs-badge');
ok((await nb.textContent())==='No faction','signin picker no-faction badge (web#26)');
// real client: CSRF + Retry-After with USE_MOCK_PROFILE=false (route-mocked network)
const p2=await ctx.newPage(); const hdrs={};
const CORS={'Access-Control-Allow-Origin':'http://localhost:8765','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Headers':'Content-Type, X-CSRF-Token, Accept','Access-Control-Allow-Methods':'GET, POST, PUT, DELETE','Access-Control-Expose-Headers':'Retry-After'};
await p2.route('https://api.crusaderstrike.com/**',async r=>{const u=r.request().url();
 if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:CORS});
 hdrs[r.request().method()+' '+new URL(u).pathname]=r.request().headers();const f=r.fulfill.bind(r);r={fulfill:o=>f(Object.assign({},o,{headers:Object.assign({},CORS,o.headers||{})}))};
 if(u.endsWith('/auth/session'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({battletag:'Crusader#1234',active_guild_id:null,memberships:[],csrf_token:'tok123'})});
 if(u.endsWith('/me/profile'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({battletag:'Crusader#1234',main_character_id:'c1',preferred_region:'eu',created_at:'2026-10-01T00:00:00Z',updated_at:'2026-11-04T00:00:00Z'})});
 if(u.endsWith('/me/characters'))return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({game:'wow_forever',characters:[{id:'c1',character_name:'Lightbringer',realm:'Emberfall',faction:'alliance',level:60,game:'wow_forever'},{id:'c2',character_name:'Wispwander',realm:'Duskhollow',faction:null,game:'wow_forever'}],selection:{main_id:'c1',alt_ids:['c2'],updated_at:'2026-11-04T18:00:00Z'}})});
 if(u.endsWith('/me/characters/refresh'))return r.fulfill({status:429,headers:{'Retry-After':'2'},contentType:'application/json',body:JSON.stringify({error:{code:'rate_limited',message:'Slow down.'}})});
 r.fulfill({status:404,body:'{}'});});
await p2.addInitScript(()=>{Object.defineProperty(window,'CS_CONFIG',{configurable:true,set(v){Object.defineProperty(window,'CS_CONFIG',{value:Object.freeze(Object.assign({},v,{USE_MOCK_PROFILE:false})),writable:false});},get(){return undefined;}});});
await p2.goto(B+'profile/?ff_bnet=1'); await p2.waitForSelector('#pf-ready:not([hidden])');
ok((await p2.locator('[data-id=c2] .cs-badge').first().textContent())==='No faction','real client: null faction neutral');
await p2.click('#pf-refresh'); await p2.waitForFunction(()=>/Refresh again in/.test(document.getElementById('pf-refresh').textContent));
const rh=hdrs['POST /api/v1/me/characters/refresh']||{}; ok(rh['x-csrf-token']==='tok123','real client sends X-CSRF-Token on refresh');
ok(await p2.inputValue('#pf-region')==='eu','real client reads GET /me/profile');
ok((await p2.textContent('#pf-refresh-error')).includes('2 seconds'),'real client honours Retry-After header');
await p2.close();
// XSS
await p.evaluate(()=>localStorage.setItem('cs_mock_selection',JSON.stringify({main_id:'ch_us_1001',alt_ids:[],updated_at:'2026-11-04T18:00:00Z'})));
await p.goto(B+'profile/'); await vis('#pf-ready');
await p.evaluate(()=>{const o=CSAuthMock.characters;CSAuthMock.characters=function(){return o.call(CSAuthMock).then(r=>{r.body.characters[0].character_name='<img src=x onerror="window.__x=1">';r.body.characters[0].realm='<b>x</b>';return r;});};});
await p.click('#pf-refresh'); await p.waitForFunction(()=>document.getElementById('pf-refresh').textContent==='Refresh characters');
ok(await p.evaluate(()=>!window.__x && !document.querySelector('#pf-list img, #pf-list b')),'hostile data rendered as text');
const t=await p.evaluate(()=>document.body.innerText); ok(!/\b(undefined|null|retail|classic)\b/i.test(t),'no undefined/null, WoW Forever wording');
await p.setViewportSize({width:375,height:800}); await p.goto(B+'profile/'); await vis('#pf-ready');
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=375),'no horizontal overflow at 375px');
const src=await p.evaluate(async()=>{let s='';for(const f of ['../js/profile.js','../js/profile-api.js','../js/faction-badge.js','../js/auth-mock.js','../js/signin.js'])s+=await (await fetch(f)).text();return s});
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src),'no HTML sinks');
ok(errs.length===0,'no page errors '+errs.join('|'));
await b.close();})();
