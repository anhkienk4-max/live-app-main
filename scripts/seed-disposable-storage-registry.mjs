import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

const REGISTRY_PATH = path.resolve('docs/storage/ADA_OPS_FOLDER_REGISTRY_20261102.json')
const registryData = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'))

const connectionString = 'postgresql://postgres@127.0.0.1:55542/rc19_ab_c511_canonical_v6_20261125'

async function seed() {
  const client = new Client({ connectionString })
  await client.connect()
  console.log('Connected to rc19_ab_c511_canonical_v6_20261125 on 55542')

  try {
    await client.query('BEGIN')

    // 1. Seed operational_storage_domain_folders (all 148 verified folders, active = true)
    console.log(`Seeding ${registryData.folders.length} domain folders...`)
    let insertedFolders = 0
    for (const folder of registryData.folders) {
      await client.query(`
        INSERT INTO public.operational_storage_domain_folders (
          folder_path, folder_id, parent_folder_id, access_classification, active, verified_created
        ) VALUES ($1, $2, $3, $4, true, true)
        ON CONFLICT (folder_path) DO UPDATE SET
          folder_id = EXCLUDED.folder_id,
          parent_folder_id = EXCLUDED.parent_folder_id,
          access_classification = EXCLUDED.access_classification,
          active = true,
          verified_created = true
      `, [folder.path, folder.id, folder.parent_id, 'restricted_verified'])
      insertedFolders++
    }
    console.log(`Successfully seeded ${insertedFolders} domain folders.`)

    // 2. Fetch brands and platforms
    const brands = (await client.query('SELECT id, name FROM public.brands')).rows
    const platforms = (await client.query('SELECT id, name FROM public.platforms')).rows
    console.log(`Found ${brands.length} brands, ${platforms.length} platforms.`)

    // 3. Seed operational_storage_routes for each brand and platform
    let insertedRoutes = 0
    for (const brand of brands) {
      // Internal route per brand (platform null)
      await client.query(`
        INSERT INTO public.operational_storage_routes (
          provider, execution_source, brand_id, platform_id, subbrand_key,
          storage_profile, root_folder_id, base_folder_id, folder_labels,
          period_naming_style, period_label_overrides, period_date_ranges,
          folder_label_overrides, active
        ) VALUES (
          'google_drive', 'internal', $1, NULL, NULL,
          'CANONICAL_V1', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh', '{}'::jsonb,
          'THANG_M_DASH_YEAR', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, true
        )
        ON CONFLICT DO NOTHING
      `, [brand.id])
      insertedRoutes++

      for (const platform of platforms) {
        await client.query(`
          INSERT INTO public.operational_storage_routes (
            provider, execution_source, brand_id, platform_id, subbrand_key,
            storage_profile, root_folder_id, base_folder_id, folder_labels,
            period_naming_style, period_label_overrides, period_date_ranges,
            folder_label_overrides, active
          ) VALUES (
            'google_drive', 'internal', $1, $2, NULL,
            'CANONICAL_V1', '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm', '1T7r-SHC0yKylszPMoToHccZ3tTOnCDkh', '{}'::jsonb,
            'THANG_M_DASH_YEAR', '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, true
          )
          ON CONFLICT DO NOTHING
        `, [brand.id, platform.id])
        insertedRoutes++
      }
    }
    console.log(`Successfully seeded ${insertedRoutes} operational storage routes.`)

    await client.query('COMMIT')

    const folderCount = (await client.query('SELECT count(*) FROM public.operational_storage_domain_folders WHERE active = true')).rows[0].count
    const routeCount = (await client.query('SELECT count(*) FROM public.operational_storage_routes WHERE active = true')).rows[0].count
    console.log(`Active domain folders: ${folderCount}, Active routes: ${routeCount}`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    await client.end()
  }
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
