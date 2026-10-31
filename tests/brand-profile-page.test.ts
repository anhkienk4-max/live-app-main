import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const detail = readFileSync(new URL('../components/features/brands/BrandDetailDialog.tsx', import.meta.url), 'utf8')
const form = readFileSync(new URL('../components/features/brands/BrandFormDialog.tsx', import.meta.url), 'utf8')

test('Brand detail uses canonical profile sections and remains linked to existing catalog records', () => {
  assert.match(detail, /data-testid="brand-profile-page"/)
  assert.match(detail, /brand\.brand_guideline/)
  assert.match(detail, /brand\.tone_of_voice/)
  assert.match(detail, /brand\.mandatory_claims/)
  assert.match(detail, /relatedCampaigns/)
  assert.match(detail, /brand-catalog\?brand_id=/)
})

test('Brand profile import only prefills the existing authorized edit form before save', () => {
  assert.match(form, /parseBrandProfileImport/)
  assert.match(form, /setForm\(current => \(\{ \.\.\.current, \.\.\.imported \}\)\)/)
  assert.match(form, /onSubmit=\{submit\}/)
  assert.match(form, /currentUser && !hasPermission|!currentUser \|\| !hasPermission/)
  assert.match(form, /brandService\.update|brandService\.create/)
})
