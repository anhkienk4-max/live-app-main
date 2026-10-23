import { expect, test } from '@playwright/test'

test('Reports Apply/Reset has a labelled toolbar, committed chips and no mobile overflow',async({page})=>{
  await page.setViewportSize({width:390,height:850})
  await page.addInitScript(()=>{
    localStorage.setItem('livestream-ops-current-user','1')
    localStorage.setItem('livestream-ops-language','vi')
  })
  await page.goto('/reports')
  const toolbar=page.getByTestId('command-toolbar')
  await expect(toolbar).toBeVisible({timeout:35_000})
  await expect(toolbar).toHaveAttribute('aria-label',/.+/)
  const search=toolbar.locator('input').first()
  await search.fill('Brand sample')
  const apply=page.getByTestId('reports-apply-filters')
  await expect(apply).toBeEnabled()
  await expect(page.getByTestId('reports-applied-filter-chips')).toHaveCount(0)
  await apply.click()
  const chips=page.getByTestId('reports-applied-filter-chips')
  await expect(chips).toBeVisible()
  await expect(chips).toContainText('Tìm kiếm')
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
  await chips.getByRole('button',{name:/Bỏ lọc/}).first().click()
  await expect(chips).toHaveCount(0)
})

test('Storage toolbar searches only applied text and never reuses filenames from another brand',async({page})=>{
  await page.setViewportSize({width:390,height:850})
  await page.addInitScript(()=>{
    localStorage.setItem('livestream-ops-current-user','1')
    localStorage.setItem('livestream-ops-language','vi')
  })
  const calls:Array<{brand:string;search:string;provider:string}>=[]
  await page.route(/\/api\/operational-files\?/,async route=>{
    const url=new URL(route.request().url())
    if(url.searchParams.get('catalog')==='1'){
      return route.fulfill({json:{
        ok:true,brands:[{id:'brand-1',name:'Brand One'},{id:'brand-2',name:'Brand Two'}],
        platforms:[{id:'platform-1',name:'TikTok'}],campaigns:[],
        categories:[{id:'schedule_source',label:'Source'}],
        max_single_upload_bytes:4*1024*1024,confidential_write_ready:false,active_route_count:0,
      }})
    }
    const brand=url.searchParams.get('brand_id')??''
    const search=url.searchParams.get('search')??''
    const provider=url.searchParams.get('provider_filter')??'all'
    calls.push({brand,search,provider})
    const files=(!search||'100% deal file'.includes(search.toLowerCase())) ? [{
      id:'file-'+brand,category:'schedule_source',
      file_name:brand==='brand-1'?'Brand One 100% deal file.xlsx':'Brand Two 100% deal file.xlsx',
      folder_path:'Sample/THANG_10',size_bytes:1600,mime_type:'application/vnd.ms-excel',
      checksum_sha256:'',created_at:'2026-10-23T00:00:00Z',scope_key:'period',
      provider:'google_drive',integrity_status:'provider_reference',
      access_url:'/api/operational-files?file_id=mock',
    }]:[]
    return route.fulfill({json:{ok:true,total:files.length,page:1,pageSize:10,files}})
  })
  await page.goto('/storage')
  const toolbar=page.getByTestId('command-toolbar')
  await expect(toolbar).toBeVisible({timeout:35_000})
  await expect(page.getByText('Chưa có Storage Route đang hoạt động.',{exact:false})).toBeVisible()
  await expect(page.getByText('Brand One 100% deal file.xlsx')).toBeVisible()
  const search=toolbar.getByRole('searchbox')
  await search.fill('100%')
  await expect.poll(()=>calls.some(c=>c.search==='100%')).toBe(false)
  await toolbar.getByRole('button',{name:'Tìm file'}).click()
  await expect.poll(()=>calls.some(c=>c.search==='100%')).toBe(true)
  await expect(page.getByText('Brand One 100% deal file.xlsx')).toBeVisible()
  await page.locator('select').filter({has:page.locator('option[value="brand-2"]')}).selectOption('brand-2')
  await expect(page.getByText('Brand Two 100% deal file.xlsx')).toBeVisible()
  await expect(page.getByText('Brand One 100% deal file.xlsx')).toHaveCount(0)
  expect(calls.some(c=>c.brand==='brand-2'&&c.search==='100%')).toBe(true)
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)
})
