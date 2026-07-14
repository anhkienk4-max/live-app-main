import { ShiftTemplate } from '@/lib/utils/shiftUtils'

// In-memory template storage
let templates: ShiftTemplate[] = [
  {
    id: 't1',
    name: 'Morning TikTok',
    brand_id: 'b1',
    platform_id: 'p1',
    start_time: '09:00',
    end_time: '13:00',
    duration: 240,
    product_notes: 'Focus on trending products',
    is_default: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 't2',
    name: 'Afternoon Shopee',
    brand_id: 'b2',
    platform_id: 'p2',
    start_time: '14:00',
    end_time: '18:00',
    duration: 240,
    product_notes: 'Fashion items showcase',
    is_default: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
]

const generateId = () => Math.random().toString(36).substring(2, 11)

export const templateService = {
  async getAll(): Promise<ShiftTemplate[]> {
    return Promise.resolve([...templates])
  },

  async getById(id: string): Promise<ShiftTemplate | null> {
    return Promise.resolve(templates.find(t => t.id === id) || null)
  },

  async getDefault(): Promise<ShiftTemplate | null> {
    return Promise.resolve(templates.find(t => t.is_default) || null)
  },

  async create(data: Omit<ShiftTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<ShiftTemplate> {
    const template: ShiftTemplate = {
      ...data,
      id: generateId(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    templates.push(template)
    return Promise.resolve(template)
  },

  async update(id: string, data: Partial<ShiftTemplate>): Promise<ShiftTemplate | null> {
    const index = templates.findIndex(t => t.id === id)
    if (index === -1) return Promise.resolve(null)
    templates[index] = { ...templates[index], ...data, updated_at: new Date().toISOString() }
    return Promise.resolve(templates[index])
  },

  async delete(id: string): Promise<boolean> {
    const index = templates.findIndex(t => t.id === id)
    if (index === -1) return Promise.resolve(false)
    templates.splice(index, 1)
    return Promise.resolve(true)
  },

  async setDefault(id: string): Promise<boolean> {
    templates.forEach(t => t.is_default = false)
    const template = templates.find(t => t.id === id)
    if (!template) return Promise.resolve(false)
    template.is_default = true
    return Promise.resolve(true)
  },
}
