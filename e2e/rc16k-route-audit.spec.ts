import {test,expect} from '@playwright/test'
import {mkdir,writeFile} from 'node:fs/promises'
import path from 'node:path'

const routes=['/','/calendar','/registration','/shifts','/staffing','/swaps','/live','/reports','/storage','/storage/setup','/analytics','/data-quality','/workforce','/payroll','/staff','/brands','/platforms','/campaigns','/audit','/notifications','/settings','/profile']
const widths=[1440,1024,768,390]
async function configureLocalReadScope(page:import('@playwright/test').Page,role:string){
    await page.addInitScript(id=>{
      localStorage.setItem('livestream-ops-current-user',id)
      localStorage.setItem('livestream-ops-language','vi')
    },role)
    await page.route('**/api/workforce/capabilities',route=>route.fulfill({json:{ok:true,capabilities:{actual_staffing:false,team_performance:false,own_performance:false,payroll:false}}}))
    // Local API fixtures exercise presentation only; no cloud/runtime PASS is inferred.
    await page.route('**/api/operational-files?**',route=>{
      const q=new URL(route.request().url()).searchParams
      if(q.has('catalog'))return route.fulfill({json:{ok:true,brands:[{id:'1',name:'Local Brand'}],platforms:[{id:'1',name:'Local Platform'}],campaigns:[],categories:[{id:'schedule_source',label:'Lịch gốc'}],max_single_upload_bytes:10485760,confidential_write_ready:false}})
      return route.fulfill({json:{ok:true,files:[],total:0,page:1,pageSize:Number(q.get('pageSize')??10)}})
    })
    await page.route('**/api/operational-storage-setup?**',route=>route.fulfill({json:{ok:true,schema_ready:true,missing:[],root_configured:false,brands:[],platforms:[],routes:[],unclassified_shifts_sample:[],unclassified_shifts_count:0,sample_limit:20,offset:0}}))
}
for(const role of ['1','2','3']) for(const width of widths) {
  test('Local route audit role '+role+' width '+width,async({page},info)=>{
    test.setTimeout(300000)
    await page.setViewportSize({width,height:1000})
    await configureLocalReadScope(page,role)
    const errors:string[]=[]
    const failures:string[]=[]
    page.on('pageerror',error=>errors.push(error.message))
    page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())})
    page.on('response',response=>{if(response.status()>=400&&new URL(response.url()).origin==='http://127.0.0.1:3108')failures.push(response.status()+' '+new URL(response.url()).pathname)})
    const evidence=[]
    for(const route of routes) {
      const begin=Date.now()
      await page.goto(route)
      await expect(page.locator('body')).not.toHaveText('')
      await expect(page.locator('main').first()).toBeVisible()
      await page.waitForTimeout(400)
      const metrics=await page.evaluate(()=>{
        const requests=performance.getEntriesByType('resource') as PerformanceResourceTiming[]
        return {domNodes:document.querySelectorAll('*').length,overflow:document.documentElement.scrollWidth>innerWidth,
          requests:requests.length,transferredBytes:requests.reduce((sum,r)=>sum+r.transferSize,0),
          heapBytes:(performance as Performance&{memory?:{usedJSHeapSize:number}}).memory?.usedJSHeapSize??null,
          headings:[...document.querySelectorAll('h1')].map(h=>h.textContent)}
      })
      const file=info.outputPath((route==='/'?'dashboard':route.slice(1).replaceAll('/','-'))+'.png')
      await page.screenshot({path:file,fullPage:true})
      evidence.push({route,role,width,scope:'LOCAL_SYNTHETIC',elapsedMs:Date.now()-begin,...metrics,screenshot:path.basename(file)})
      expect(metrics.overflow,route+' horizontal overflow').toBe(false)
      expect(metrics.domNodes,route+' unbounded DOM').toBeLessThan(6000)
    }
    await mkdir(info.outputPath(),{recursive:true})
    await writeFile(info.outputPath('route-matrix.json'),JSON.stringify({evidence,errors,failures},null,2))
    expect(errors).toEqual([])
    expect(failures).toEqual([])
  })
}

for(const role of ['1','3'])test('Storage localized hydration and role boundary '+role,async({page})=>{
  await configureLocalReadScope(page,role)
  const errors:string[]=[]
  page.on('pageerror',e=>errors.push(e.message))
  page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())})
  for(const route of ['/storage','/storage/setup']){
    await page.goto(route)
    await page.waitForTimeout(1000)
    if(role==='3')await expect(page.getByRole('alert').filter({hasText:/không có quyền/}).first()).toBeVisible()
  }
  expect(errors).toEqual([])
})
