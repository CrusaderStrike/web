const { chromium } = require('playwright');
const B='http://localhost:8765/';
(async()=>{const b = require('./_test-config.js').withTestConfig(await chromium.launch());const p=await b.newPage();await p.route('https://render.worldofwarcraft.com/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));const errs=[];p.on('pageerror',e=>errs.push(e.message));
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c)process.exitCode=1;};
const vis=s=>p.waitForSelector(s+':not([hidden])',{timeout:5000}).then(()=>true,()=>false);
await p.goto(B+'gear/?character=ch_us_1001'); ok(await vis('#gr-disabled'),'flag off -> coming soon');
await p.goto(B+'gear/?character=ch_us_1001&ff_bnet=1'); ok(await vis('#gr-signedout'),'signed out');
await p.evaluate(()=>{CSAuthMock.devSignIn();localStorage.setItem('cs_mock_selection',JSON.stringify({main_id:'ch_us_1001',alt_ids:[],updated_at:'2026-11-04T18:00:00Z'}));});
// from profile card
await p.goto(B+'profile/'); await vis('#pf-ready');
await p.click('[data-id=ch_us_1001] .pf-gear-link'); await p.waitForURL(/gear\/\?character=ch_us_1001/);
ok(await p.isVisible('#gr-loading'),'loading state'); ok(await vis('#gr-ready'),'ready via profile link');
ok(/^Lightbringer Dawnmantle \([A-Z][\w' ]+ US\) — gear$/.test(await p.textContent('#gr-h')),'heading with realm and region: '+await p.textContent('#gr-h'));
ok(/^Last updated /.test(await p.textContent('#gr-updated')),'updated_at shown');
const rows=await p.$$eval('#gr-body tr',t=>t.map(r=>[...r.cells].map(c=>c.textContent)));
ok(rows.length===9,'9 items (empty slots omitted)'); ok(rows.map(r=>r[0]).join(',')==='Head,Neck,Shoulder,Chest,Shirt,Hands,Feet,Finger 1,Main hand','slot order: '+rows.map(r=>r[0]));
ok(rows[0][1]==='Helm of the Dawnward Vigil'&&rows[0][2]==='Epic'&&rows[0][3]==='66','row cells');
ok(await p.$eval('#gr-body tr:first-child .gr-item',e=>e.classList.contains('q-epic')),'name colored by quality');
const cols=await p.$$eval('#gr-body .gr-name',n=>[...new Set(n.map(e=>getComputedStyle(e).color))].length); ok(cols>=5,'distinct quality colors: '+cols);
ok(await p.$$eval('#gr-body .gr-icon',i=>i.length===9&&i.every(x=>x.getAttribute('aria-hidden')==='true'&&x.offsetWidth===36&&x.offsetHeight===36)),'icon frames 36x36, aria-hidden');
ok(await p.$$eval('#gr-body .gr-icon img',i=>i.every(x=>x.alt==='')),'img alt empty');
ok(await p.$$eval('th[scope=col]',t=>t.length)===4,'table headers scoped');
ok((await p.textContent('#gr-caption')).includes('9 items'),'caption');
const nul=rows.find(r=>r[0]==='Finger 1'); ok(nul[1]==='Unknown item'&&nul[2]==='Unknown'&&nul[3]==='–','null name/quality/ilvl handled: '+nul.join('|'));
{const s=await p.$$eval('#gr-body tr',t=>t.map(r=>{const i=r.querySelector('.gr-icon img'),g=r.querySelector('.gr-icon svg');return r.cells[0].textContent+'='+(i?i.getAttribute('src'):'PH:'+(g&&g.dataset.glyph))}));const g=k=>s.find(x=>x.startsWith(k+'=')).slice(k.length+1);
ok(g('Head')==='https://render.worldofwarcraft.com/us/icons/56/inv_helmet_03.jpg','icon_url rendered');
ok(g('Shirt')==='PH:shirt','icon-only item -> slot placeholder');
ok(g('Chest')==='PH:chest'&&g('Finger 1')==='PH:ring'&&g('Main hand')==='PH:sword','null icon_url -> slot glyphs');
ok(await p.$eval('#gr-body tr:nth-child(2) .gr-icon',e=>e.closest('.gr-item').classList.contains('q-rare')&&getComputedStyle(e).borderTopColor===getComputedStyle(e.closest('.gr-item')).color),'border colored by quality');
ok(g('Feet')==='PH:boots','no icon/icon_url -> placeholder');}
// states
await p.goto(B+'gear/?character=ch_us_1004'); await vis('#gr-ready'); ok(await p.isVisible('#gr-empty'),'character with no gear -> empty');
await p.goto(B+'gear/?character=ch_us_1001&mock_scenario=gear_empty'); await vis('#gr-ready'); ok(await p.isVisible('#gr-empty')&&await p.isHidden('#gr-table-wrap'),'empty state');
await p.goto(B+'gear/?character=bogus'); ok(await vis('#gr-notfound'),'404 -> not found');
await p.goto(B+'gear/?character=ch_us_9999'); ok(await vis('#gr-notfound'),'non-owner id -> 404 not found');
await p.goto(B+'gear/?character=ch_us_1001&mock_scenario=gear_ratelimit'); await vis('#gr-error'); ok((await p.textContent('#gr-error-msg')).includes('7 seconds'),'429 Retry-After message');
await p.goto(B+'gear/'); ok(await vis('#gr-notfound'),'no id -> not found');
await p.goto(B+'gear/?character=ch_us_1001&mock_scenario=gear_upstream'); ok(await vis('#gr-error'),'error state');
ok((await p.textContent('#gr-error-msg'))==='Battle.net is unavailable, try again later','502 message');
await p.goto(B+'gear/?character=ch_us_1001&mock_scenario=gear_error'); await vis('#gr-error'); ok((await p.textContent('#gr-error-msg')).length>0,'500 message');
// XSS + icon sanitizing
await p.goto(B+'gear/?character=ch_us_1001'); await vis('#gr-ready');
await p.evaluate(()=>{const o=CSGearMock.gear;CSGearMock.gear=id=>o(id).then(r=>{r.body.items[0].name='<img src=x onerror="window.__x=1">';r.body.items[1].icon='javascript:alert(1)';r.body.items[1].icon_url='javascript:alert(1)';r.body.items[3].icon_url='http://render.worldofwarcraft.com/us/icons/56/x.jpg';r.body.items[4].icon_url='https://evil.example/x.jpg';r.body.items[5].icon_url='https://render.worldofwarcraft.com.evil.com/x.jpg';r.body.items[6].icon_url='https://cdn.render.worldofwarcraft.com/x.jpg';r.body.items[3].icon='bad name';r.body.items[2].quality='<b>bad</b>';r.body.items.push({slot:'<script>',itemId:1,name:'bad slot',quality:'epic',ilvl:1});return r;});});
await p.click('#gr-retry').catch(()=>{}); await p.evaluate(()=>document.getElementById('gr-retry').click()); await vis('#gr-ready'); await p.waitForTimeout(500);
ok(await p.evaluate(()=>!window.__x&&!document.querySelector('#gr-body b, #gr-body script, #gr-body img:not(.gr-icon img)')),'hostile data rendered as text');
ok((await p.$eval('#gr-body tr:nth-child(2)',r=>r.querySelector('.gr-icon img')?r.querySelector('.gr-icon img').getAttribute('src'):'PH'))==='PH','javascript: icon_url rejected');
ok((await p.$eval('#gr-body tr:nth-child(4)',r=>r.querySelector('.gr-icon img')?r.querySelector('.gr-icon img').getAttribute('src'):'PH'))==='PH','http icon_url rejected');
for(const [n,m] of [[6,'evil host'],[9,'lookalike host'],[5,'subdomain']])ok((await p.$eval('#gr-body tr:nth-child('+n+')',r=>r.querySelector('.gr-icon img')?r.querySelector('.gr-icon img').getAttribute('src'):'PH'))==='PH',m+' icon_url rejected');
ok((await p.$eval('#gr-body tr:nth-child(1) img',i=>i.getAttribute('src'))).startsWith('https://render.worldofwarcraft.com/'),'allowed icon_url kept');
ok((await p.$$eval('#gr-body tr',t=>t.length))===9,'unknown slot dropped');
const t=await p.evaluate(()=>document.body.innerText); ok(!/\b(undefined|null|NaN|retail|classic)\b/i.test(t),'no undefined/null, WoW Forever wording');
// real client path
const p2=await b.newPage(); let url='';
await p2.route('https://render.worldofwarcraft.com/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'}));
await p2.route('https://api.crusaderstrike.com/**',r=>{url=r.request().url();r.fulfill({status:200,headers:{'Access-Control-Allow-Origin':'http://localhost:8765','Access-Control-Allow-Credentials':'true'},contentType:'application/json',body:JSON.stringify({character_id:'ch_us_1001',updated_at:'2026-11-04T18:00:00Z',items:[{slot:'head',itemId:1,name:'Real Helm',quality:'rare',ilvl:60,icon:'inv_helmet_03'},{slot:'chest',itemId:3,name:'Url Chest',quality:'rare',ilvl:60,icon:'inv_x',icon_url:'https://render.worldofwarcraft.com/us/icons/56/inv_chest_plate03.jpg'},{slot:'neck',itemId:2,name:'Bad Icon',quality:'epic',ilvl:60,icon:'../../evil"x'}]})});});
await p2.goto(B+'profile/?ff_bnet=1'); await p2.evaluate(()=>{CSAuthMock.devSignIn();});
await p2.addInitScript(()=>{Object.defineProperty(window,'CS_CONFIG',{configurable:true,set(v){Object.defineProperty(window,'CS_CONFIG',{value:Object.freeze(Object.assign({},v,{USE_MOCK_GEAR:false})),writable:false});},get(){return undefined;}});});
await p2.goto(B+'gear/?character=ch_us_1001'); await p2.waitForSelector('#gr-ready:not([hidden])');
ok(url==='https://api.crusaderstrike.com/api/v1/characters/ch_us_1001/gear','real client path: '+url);
ok((await p2.textContent('#gr-body .gr-name'))==='Real Helm','real client renders');
const srcs=await p2.$$eval('#gr-body .gr-icon',i=>i.map(x=>x.querySelector('img')?x.querySelector('img').getAttribute('src'):'PH'));
ok(srcs[0]==='PH'&&srcs.includes('https://render.worldofwarcraft.com/us/icons/56/inv_chest_plate03.jpg')&&!srcs.some(s=>s.endsWith('inv_helmet_03.jpg')),'real client: icon_url used, no URL built from icon: '+srcs.join(' '));
await p2.close();
await p.setViewportSize({width:375,height:800}); await p.goto(B+'gear/?character=ch_us_1001'); await vis('#gr-ready');
ok(await p.evaluate(()=>document.documentElement.scrollWidth<=375),'no horizontal overflow at 375px');
const src=await p.evaluate(async()=>{let s='';for(const f of ['../js/gear.js','../js/gear-api.js','../js/gear-mock.js','../js/profile.js'])s+=await (await fetch(f)).text();return s});
ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(src),'no HTML sinks');
{const src=await p.evaluate(async()=>{let s='';for(const f of ['/js/gear.js','/js/gear-api.js','/js/config.js'])s+=await (await fetch(f)).text();return s});
ok(!/https?:\/\/render\.worldofwarcraft\.com/.test(src)&&!/\{icon\}|GEAR_ICON_URL|iconUrl/.test(src)&&!/\.icon\s*\+|\+\s*[\w.]*\.icon\b/.test(src),'code never constructs a Blizzard icon URL');}
await p.evaluate(()=>localStorage.setItem('cs_mock_stale',JSON.stringify(['ch_us_1001'])));
await p.goto(B+'gear/?character=ch_us_1001&ff_bnet=1'); await vis('#gr-ready');
ok((await p.textContent('#gr-h .gr-stale'))==='Stale','stale badge in header');
await p.evaluate(()=>localStorage.removeItem('cs_mock_stale'));
await p.goto(B+'gear/?character=ch_us_1001&ff_bnet=1'); await vis('#gr-ready');
ok(await p.$('#gr-h .gr-stale')===null,'no stale badge when fresh');
{await p.goto(B+'gear/?character=ch_us_1001&ff_bnet=1'); await vis('#gr-ready');
await p.evaluate(()=>{const o=CSGearMock.gear;});
for(const [w,h,f,dpr] of [[1280,900,(process.env.SHOT_DIR||'/workspace')+'/gear-placeholder-desktop.png',2],[375,812,(process.env.SHOT_DIR||'/workspace')+'/gear-placeholder-mobile.png',2]]){
 const c=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr});const q=await c.newPage();
 await q.route('https://render.worldofwarcraft.com/**',r=>r.fulfill({status:404,body:''}));
 await q.goto(B+'gear/?character=ch_us_1001&ff_bnet=1');await q.evaluate(()=>{CSAuthMock.devSignIn();localStorage.setItem('cs_mock_selection',JSON.stringify({main_id:'ch_us_1001',alt_ids:[],updated_at:'2026-11-04T18:00:00Z'}));});
 await q.reload();await q.waitForSelector('#gr-ready:not([hidden])');await q.waitForTimeout(300);
 const n=await q.$$eval('#gr-body .gr-icon svg',s=>s.length);ok(n===9,w+'px: all 9 placeholders (failed img falls back): '+n);
 ok(await q.$$eval('#gr-body .gr-icon',i=>i.every(x=>x.getBoundingClientRect().width===36)),w+'px: no layout shift, 36px frames');
 ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),w+'px: no horizontal overflow');
 await q.screenshot({path:f,fullPage:true});ok(require('fs').statSync(f).size>5000,'screenshot '+f);await c.close();}}
{const r=await p.evaluate(()=>{const ok='https://render.worldofwarcraft.com/us/icons/56/inv_helmet_03.jpg';
 const bad=['http://render.worldofwarcraft.com/us/icons/56/a.jpg','javascript:alert(1)','//render.worldofwarcraft.com/us/icons/56/a.jpg',
 'https://x.render.worldofwarcraft.com/us/icons/56/a.jpg','https://render.worldofwarcraft.com.evil.com/us/icons/56/a.jpg',
 'https://render.worldofwarcraft.com@evil.com/us/icons/56/a.jpg','https://render.worldofwarcraft.com./us/icons/56/a.jpg',
 'https://evil.com@render.worldofwarcraft.com/us/icons/56/a.jpg','https://u:p@render.worldofwarcraft.com/us/icons/56/a.jpg',
 'https://render.worldofwarcraft.com:8443/us/icons/56/a.jpg','https://render.worldofwarcraft.com/evil.svg',
 'https://render.worldofwarcraft.com/us/icons/56/a.jpg?x=1#','data:image/png;base64,AAAA','not a url',42,null,undefined,{}];
 return {ok:CSGearApi.iconFor({icon_url:ok})===ok, bad:bad.filter(u=>CSGearApi.iconFor({icon_url:u})!==null).map(String)};});
ok(r.ok,'allowlisted icon_url accepted');ok(r.bad.length===0,'hostile icon_url list rejected: '+r.bad.join(' '));}
ok(errs.length===0,'no page errors '+errs.join('|'));
await b.close();})();
