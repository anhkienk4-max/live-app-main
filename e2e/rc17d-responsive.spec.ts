import { test, expect } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
const routes = ['/', '/calendar?tab=calendar&calendar_view=month&calendar_date=2026-10-14', '/live', '/shifts', '/staffing', '/registration', '/swaps', '/storage', '/storage/setup', '/reports', '/workforce', '/analytics', '/payroll', '/brands', '/platforms', '/campaigns', '/staff', '/audit', '/settings', '/notifications', '/profile', '/data-quality']
const widths=[320,360,375,390,430,768,1024,1280,1440]
const phase=process.env.RC17D_PHASE || 'after'
for(const role of ['1','2','3']) test('responsive route matrix role '+role, async({page},info)=>{
 test.setTimeout(1200000)
 await page.addInitScript(id=>{localStorage.setItem('livestream-ops-current-user',id);localStorage.setItem('livestream-ops-language','vi')},role)
 await page.route('**/api/workforce/capabilities',r=>r.fulfill({json:{ok:true,capabilities:{actual_staffing:false,team_performance:false,own_performance:false,payroll:false}}}))
 await page.route('**/api/operational-files?**',r=>r.fulfill({json:new URL(r.request().url()).searchParams.has('catalog')?{ok:true,brands:[{id:'1',name:'Local Brand'}],platforms:[{id:'1',name:'Local Platform'}],campaigns:[],categories:[],max_single_upload_bytes:10485760,confidential_write_ready:false}:{ok:true,files:[],total:0,page:1,pageSize:10}}))
 await page.route('**/api/operational-storage-setup?**',r=>r.fulfill({json:{ok:true,schema_ready:true,missing:[],root_configured:false,brands:[],platforms:[],routes:[],unclassified_shifts_sample:[],unclassified_shifts_count:0,sample_limit:20,offset:0}}))
 const evidence: Array<{status:string} & Record<string,unknown>>=[]; const errors:string[]=[]
 page.on('pageerror',e=>errors.push(e.message))
 for(const route of routes){
  await page.setViewportSize({width:1440,height:1000})
  await page.goto(route,{waitUntil:'networkidle'})
  await expect(page.getByTestId('production-main-content')).toBeVisible()
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0)
  for(const width of widths){
   await page.setViewportSize({width,height:width===375?811:1000})
   await page.waitForTimeout(200)
   const geometry=await page.evaluate(()=>{
    const main=document.querySelector('main')!; const box=main.getBoundingClientRect()
    const visible=(e:Element)=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).opacity!=='0'&&!(r.width<=1||r.height<=1)}
    const controls=[...main.querySelectorAll('button,a,input,select,[role=combobox],[role=tab]')].filter(visible)
    const shortTargets=controls.filter(e=>{let r=e.getBoundingClientRect();if(e instanceof HTMLInputElement && (e.type==='checkbox'||e.type==='radio')){const label=e.labels?.[0];if(label)r=label.getBoundingClientRect()}return r.height<43.5||r.width<43.5}).slice(0,40).map(e=>({tag:e.tagName,text:(e.textContent||e.getAttribute('aria-label')||'').slice(0,85),testId:e.getAttribute('data-testid'),height:e.getBoundingClientRect().height,width:e.getBoundingClientRect().width}))
    const escaped=controls.filter(e=>{const r=e.getBoundingClientRect();if(r.left>=box.left-1&&r.right<=box.right+1)return false;for(let p=e.parentElement;p&&p!==main;p=p.parentElement){if(/auto|scroll/.test(getComputedStyle(p).overflowX)&&p.scrollWidth>p.clientWidth)return false}return true}).slice(0,15).map(e=>({tag:e.tagName,text:(e.textContent||'').slice(0,70)}))
    const shellControls=[...document.querySelectorAll('[data-testid="production-topbar"] button,[data-testid="production-bottom-nav"] a,[data-testid="production-bottom-nav"] button')].filter(visible)
    const shellEscaped=shellControls.filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+1}).map(e=>(e.textContent||e.getAttribute('aria-label')||'').slice(0,60))
    const shellShortTargets=shellControls.filter(e=>{const r=e.getBoundingClientRect();return r.height<43.5||r.width<43.5}).map(e=>e.getAttribute('aria-label')||e.textContent)
    return {shellEscaped,shellShortTargets,documentWidth:document.documentElement.scrollWidth,mainWidth:main.clientWidth,mainScrollWidth:main.scrollWidth,viewport:innerWidth,shortTargets,escaped,headings:[...main.querySelectorAll('h1')].map(e=>e.textContent)}
   })
   const slug=new URL(route,'http://localhost').pathname.replaceAll('/','-')||'dashboard'
   let screenshot:string|undefined
   if([375,768,1440].includes(width)){screenshot=role+'-'+slug+'-'+width+'.png';await page.screenshot({path:info.outputPath(screenshot),fullPage:true})}
   const passed=geometry.documentWidth<=width&&geometry.mainScrollWidth<=geometry.mainWidth+1&&geometry.escaped.length===0&&geometry.shellEscaped.length===0&&(width>=768||(geometry.shortTargets.length===0&&geometry.shellShortTargets.length===0))
   evidence.push({route,role,width,height:width===375?811:1000,scope:'LOCAL_FIXTURE_BROWSER',phase,status:passed?'PASS':'FAIL',...geometry,screenshot})
  }
 }
 await mkdir(info.outputPath(),{recursive:true});await writeFile(info.outputPath('matrix.json'),JSON.stringify({evidence,errors},null,2))
 if(phase==='after'){expect(errors).toEqual([]);expect(evidence.filter(e=>e.status==='FAIL')).toEqual([])}
})
test('public auth viewport matrix',async({page},info)=>{
 const evidence=[]
 for(const route of ['/login','/register','/forgot-password','/reset-password']){
  await page.goto(route,{waitUntil:'networkidle'})
  for(const width of widths){await page.setViewportSize({width,height:width===375?811:1000});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)
   let screenshot:string|undefined
   if([375,768,1440].includes(width)){screenshot=route.slice(1)+'-'+width+'.png';await page.screenshot({path:info.outputPath(screenshot),fullPage:true})}
   evidence.push({route,role:'public',width,scope:'LOCAL_PUBLIC_AUTH_BROWSER',phase,status:overflow?'FAIL':'PASS',screenshot})
  }
 }
 await mkdir(info.outputPath(),{recursive:true});await writeFile(info.outputPath('matrix.json'),JSON.stringify({evidence},null,2))
 if(phase==='after')expect(evidence.filter(e=>e.status==='FAIL')).toEqual([])
})
