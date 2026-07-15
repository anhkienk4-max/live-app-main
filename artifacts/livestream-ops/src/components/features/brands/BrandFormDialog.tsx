import * as React from 'react'
import { brandService } from '@/lib/services/dataService'
import { Brand, TrainingDocument, DriveLink } from '@/lib/types/database.types'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { Plus, Trash2, ExternalLink } from 'lucide-react'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  brand: Brand | null
  onSuccess: () => void
}

const emptyForm = () => ({
  name: '',
  logo_url: '',
  color: '#2563EB',
  introduction: '',
  tone_of_voice: '',
  usp: '',
  product_information: '',
  key_messages: '',
  dos: '',
  donts: '',
  important_notes: '',
  training_documents: [] as TrainingDocument[],
  drive_links: [] as DriveLink[],
})

export function BrandFormDialog({ open, onOpenChange, brand, onSuccess }: Props) {
  const [loading, setLoading] = React.useState(false)
  const [formData, setFormData] = React.useState(emptyForm())
  const [newDoc, setNewDoc] = React.useState({ title: '', url: '', type: 'pdf' as TrainingDocument['type'] })
  const [newLink, setNewLink] = React.useState({ title: '', url: '' })
  const { toast } = useToast()

  React.useEffect(() => {
    if (brand) {
      setFormData({
        name: brand.name,
        logo_url: brand.logo_url || '',
        color: brand.color || '#2563EB',
        introduction: brand.introduction || '',
        tone_of_voice: brand.tone_of_voice || '',
        usp: brand.usp || '',
        product_information: brand.product_information || '',
        key_messages: brand.key_messages || '',
        dos: brand.dos || '',
        donts: brand.donts || '',
        important_notes: brand.important_notes || '',
        training_documents: brand.training_documents ? [...brand.training_documents] : [],
        drive_links: brand.drive_links ? [...brand.drive_links] : [],
      })
    } else {
      setFormData(emptyForm())
    }
    setNewDoc({ title: '', url: '', type: 'pdf' })
    setNewLink({ title: '', url: '' })
  }, [brand, open])

  const set = (key: string, value: string) => setFormData(prev => ({ ...prev, [key]: value }))

  const addDocument = () => {
    if (!newDoc.title.trim() || !newDoc.url.trim()) return
    const doc: TrainingDocument = { id: Math.random().toString(36).slice(2), ...newDoc }
    setFormData(prev => ({ ...prev, training_documents: [...prev.training_documents, doc] }))
    setNewDoc({ title: '', url: '', type: 'pdf' })
  }

  const removeDocument = (id: string) =>
    setFormData(prev => ({ ...prev, training_documents: prev.training_documents.filter(d => d.id !== id) }))

  const addLink = () => {
    if (!newLink.title.trim() || !newLink.url.trim()) return
    const link: DriveLink = { id: Math.random().toString(36).slice(2), ...newLink }
    setFormData(prev => ({ ...prev, drive_links: [...prev.drive_links, link] }))
    setNewLink({ title: '', url: '' })
  }

  const removeLink = (id: string) =>
    setFormData(prev => ({ ...prev, drive_links: prev.drive_links.filter(l => l.id !== id) }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        ...formData,
        logo_url: formData.logo_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(formData.name)}`,
      }
      if (brand) {
        await brandService.update(brand.id, payload)
        toast({ title: 'Success', description: 'Brand updated', variant: 'default' })
      } else {
        await brandService.create(payload)
        toast({ title: 'Success', description: 'Brand created', variant: 'default' })
      }
      onSuccess()
      onOpenChange(false)
    } catch {
      toast({ title: 'Error', description: 'Failed to save brand', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{brand ? 'Edit Brand' : 'Add New Brand'}</DialogTitle>
          <DialogDescription>
            {brand ? 'Update brand details and knowledge base' : 'Create a brand and populate its knowledge base for your team'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-4 mb-6">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="voice">Voice & USP</TabsTrigger>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="resources">Resources</TabsTrigger>
            </TabsList>

            {/* ── BASIC ───────────────────────────────── */}
            <TabsContent value="basic" className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Brand Name *</label>
                <Input required value={formData.name} onChange={e => set('name', e.target.value)} placeholder="TechGear Pro" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Brand Color *</label>
                <div className="flex gap-2">
                  <input type="color" value={formData.color} onChange={e => set('color', e.target.value)}
                    className="w-12 h-10 rounded border cursor-pointer" />
                  <Input value={formData.color} onChange={e => set('color', e.target.value)} placeholder="#2563EB" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Logo URL</label>
                <Input value={formData.logo_url} onChange={e => set('logo_url', e.target.value)} placeholder="https://…/logo.png" />
                <p className="text-xs text-gray-500">Leave empty to auto-generate from brand name</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Brand Introduction</label>
                <Textarea rows={4} value={formData.introduction} onChange={e => set('introduction', e.target.value)}
                  placeholder="Briefly describe this brand: what they sell, who they target, their story…" />
              </div>
            </TabsContent>

            {/* ── VOICE & USP ─────────────────────────── */}
            <TabsContent value="voice" className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Tone of Voice</label>
                <p className="text-xs text-gray-500">How should hosts communicate? What language style, energy level, personality?</p>
                <Textarea rows={4} value={formData.tone_of_voice} onChange={e => set('tone_of_voice', e.target.value)}
                  placeholder="Professional yet approachable. Confident, jargon-free. Speak like a knowledgeable friend…" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Unique Selling Proposition (USP)</label>
                <p className="text-xs text-gray-500">What makes this brand stand out? The core value proposition.</p>
                <Textarea rows={3} value={formData.usp} onChange={e => set('usp', e.target.value)}
                  placeholder="Premium audio quality at mid-range prices. 2-year warranty. 30-day money-back guarantee." />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Key Messages</label>
                <p className="text-xs text-gray-500">The 3–5 talking points hosts must always reinforce.</p>
                <Textarea rows={4} value={formData.key_messages} onChange={e => set('key_messages', e.target.value)}
                  placeholder="1. Best-in-class sound at honest prices&#10;2. Built to last — 2-year warranty&#10;3. Free same-day shipping on orders over $50" />
              </div>
            </TabsContent>

            {/* ── CONTENT ─────────────────────────────── */}
            <TabsContent value="content" className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Product Information</label>
                <Textarea rows={4} value={formData.product_information} onChange={e => set('product_information', e.target.value)}
                  placeholder="Core product lines, specifications, key models, pricing tiers…" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-green-700">✓ Do's</label>
                  <Textarea rows={4} value={formData.dos} onChange={e => set('dos', e.target.value)}
                    placeholder="Demonstrate real product use.&#10;Compare to premium brands on value.&#10;Mention warranty unprompted." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-red-700">✗ Don'ts</label>
                  <Textarea rows={4} value={formData.donts} onChange={e => set('donts', e.target.value)}
                    placeholder="Never name specific competitor brands.&#10;Avoid over-promising battery life.&#10;No political content." />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">⚠ Important Notes</label>
                <Textarea rows={3} value={formData.important_notes} onChange={e => set('important_notes', e.target.value)}
                  placeholder="Flash sale pricing every Friday 8–10 PM. Check inventory before going live. Voucher: TECH10…" />
              </div>
            </TabsContent>

            {/* ── RESOURCES ───────────────────────────── */}
            <TabsContent value="resources" className="space-y-6">
              {/* Training Documents */}
              <div>
                <label className="text-sm font-medium block mb-3">Training Documents</label>
                <div className="space-y-2 mb-3">
                  {formData.training_documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <Badge variant="outline" className="text-xs">{doc.type.toUpperCase()}</Badge>
                      <span className="text-sm flex-1 font-medium">{doc.title}</span>
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeDocument(doc.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <Input className="col-span-2" value={newDoc.title} onChange={e => setNewDoc({ ...newDoc, title: e.target.value })} placeholder="Document title" />
                  <Input className="col-span-2" value={newDoc.url} onChange={e => setNewDoc({ ...newDoc, url: e.target.value })} placeholder="URL" />
                  <Select value={newDoc.type} onValueChange={(v: TrainingDocument['type']) => setNewDoc({ ...newDoc, type: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="doc">Doc</SelectItem>
                      <SelectItem value="link">Link</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="button" className="col-span-5" variant="outline" onClick={addDocument}>
                    <Plus className="h-4 w-4 mr-2" /> Add Document
                  </Button>
                </div>
              </div>

              {/* Drive Links */}
              <div>
                <label className="text-sm font-medium block mb-3">Drive / Folder Links</label>
                <div className="space-y-2 mb-3">
                  {formData.drive_links.map(link => (
                    <div key={link.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
                      <span className="text-sm flex-1 font-medium">{link.title}</span>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeLink(link.id)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <Input className="col-span-2" value={newLink.title} onChange={e => setNewLink({ ...newLink, title: e.target.value })} placeholder="Folder / sheet name" />
                  <Input className="col-span-3" value={newLink.url} onChange={e => setNewLink({ ...newLink, url: e.target.value })} placeholder="https://drive.google.com/…" />
                  <Button type="button" className="col-span-5" variant="outline" onClick={addLink}>
                    <Plus className="h-4 w-4 mr-2" /> Add Link
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Saving…' : brand ? 'Update Brand' : 'Create Brand'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
