---
name: Brand KB field names
description: Exact field names on the Brand interface for knowledge-base completeness checks
---

## Brand interface KB fields (from database.types.ts)
- `introduction?: string`
- `tone_of_voice?: string`
- `usp?: string`
- `product_information?: string`
- `key_messages?: string`
- `dos?: string`
- `donts?: string`
- `important_notes?: string`
- `training_documents?: TrainingDocument[]`
- `drive_links?: DriveLink[]`

**Does NOT have:** `description`, `product_categories`, `product_info`.

**Why:** Common mistake is to reference `description` (which many ORM-generated types include) or `product_categories` — neither exists on this Brand.
