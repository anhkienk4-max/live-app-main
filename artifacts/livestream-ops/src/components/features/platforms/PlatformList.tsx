import * as React from 'react'
import { platformService } from '@/lib/services/dataService'
import { Platform, PlatformDocument, PlatformFAQ, PlatformLink } from '@/lib/types/database.types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { useToast } from '@/components/ui/toast'
import { Plus, Pencil, Trash2, ExternalLink, BookOpen, Globe } from 'lucide-react'

const emptyForm = () => ({
  name: '',
  icon: '',
  policies: '',
  livestream_rules: '',
  penalty_rules: '',
  official_documents: [] as PlatformDocument[],
  faq: [] as PlatformFAQ[],
  useful_links: [] as PlatformLink[],
})

export function PlatformList() {
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selected, setSelected] = React.useState<Platform | null>(null)
  const [deleteId, setDeleteId] = React.useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = React.useState(false)
  const [formData, setFormData] = React.useState(emptyForm())
  const [newDoc, setNewDoc] = React.useState({ title: '', url: '' })
  const [newFaq, setNewFaq] = React.useState({ question: '', answer: '' })
  const [newLink, setNewLink] = React.useState({ title: '', url: '' })
  const { toast } = useToast()

  const load = React.useCallback(async () => {
    const data = await platformService.getAll()
    setPlatforms(data)
    setLoading(false)
  }, [])

  React.useEffect(() => { load() }, [load])

  const openForm = (platform: Platform | null) => {
    setSelected(platform)
    if (platform) {
      setFormData({
        name: platform.name,
        icon: platform.icon || '',
        policies: platform.policies || '',
        livestream_rules: platform.livestream_rules || '',
        penalty_rules: platform.penalty_rules || '',
        official_documents: platform.official_documents ? [...platform.official_documents] : [],
        faq: platform.faq ? [...platform.faq] : [],
        useful_links: platform.useful_links ? [...platform.useful_links] : [],
      })
    } else {
      setFormData(emptyForm())
    }
    setNewDoc({ title: '', url: '' })
    setNewFaq({ question: '', answer: '' })
    setNewLink({ title: '', url: '' })
    setIsFormOpen(true)
  }

  const set = (key: string, value: string) => setFormData(prev => ({ ...prev, [key]: value }))

  const addDoc = () => {
    if (!newDoc.title || !newDoc.url) return
    const doc: PlatformDocument = { id: Math.random().toString(36).slice(2), ...newDoc }
    setFormData(prev => ({ ...prev, official_documents: [...prev.official_documents, doc] }))
    setNewDoc({ title: '', url: '' })
  }
  const removeDoc = (id: string) =>
    setFormData(prev => ({ ...prev, official_documents: prev.official_documents.filter(d => d.id !== id) }))

  const addFaq = () => {
    if (!newFaq.question || !newFaq.answer) return
    const faq: PlatformFAQ = { id: Math.random().toString(36).slice(2), ...newFaq }
    setFormData(prev => ({ ...prev, faq: [...prev.faq, faq] }))
    setNewFaq({ question: '', answer: '' })
  }
  const removeFaq = (id: string) =>
    setFormData(prev => ({ ...prev, faq: prev.faq.filter(f => f.id !== id) }))

  const addLink = () => {
    if (!newLink.title || !newLink.url) return
    const link: PlatformLink = { id: Math.random().toString(36).slice(2), ...newLink }
    setFormData(prev => ({ ...prev, useful_links: [...prev.useful_links, link] }))
    setNewLink({ title: '', url: '' })
  }
  const removeLink = (id: string) =>
    setFormData(prev => ({ ...prev, useful_links: prev.useful_links.filter(l => l.id !== id) }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (selected) {
        await platformService.update(selected.id, formData)
        toast({ title: 'Success', description: 'Platform updated', variant: 'default' })
      } else {
        await platformService.create(formData)
        toast({ title: 'Success', description: 'Platform created', variant: 'default' })
      }
      load()
      setIsFormOpen(false)
    } catch {
      toast({ title: 'Error', description: 'Failed to save platform', variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    await platformService.delete(id)
    toast({ title: 'Success', description: 'Platform deleted', variant: 'default' })
    load()
  }

  const kbScore = (p: Platform) => {
    let score = 0
    if (p.policies) score++
    if (p.livestream_rules) score++
    if (p.penalty_rules) score++
    if (p.official_documents?.length) score++
    if (p.faq?.length) score++
    if (p.useful_links?.length) score++
    return score
  }

  if (loading) return <div className="text-center py-12">Loading…</div>

  return (
    <>
      <div className="flex justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Platform Management</h2>
          <p className="text-gray-600 mt-1">Manage livestream platforms and their knowledge bases</p>
        </div>
        <Button onClick={() => openForm(null)}>
          <Plus className="h-4 w-4 mr-2" /> Add Platform
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {platforms.map(p => {
          const score = kbScore(p)
          return (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Globe className="h-5 w-5 text-gray-600" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{p.name}</CardTitle>
                      {p.icon && <p className="text-xs text-gray-500">{p.icon}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openForm(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(p.id)}>
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <BookOpen className="h-4 w-4" />
                  <span>Knowledge Base:</span>
                  <Badge variant={score >= 4 ? 'default' : score >= 2 ? 'secondary' : 'outline'}
                    className="text-xs">
                    {score}/6 sections filled
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {p.policies && <Badge variant="outline" className="text-xs bg-green-50">Policies</Badge>}
                  {p.livestream_rules && <Badge variant="outline" className="text-xs bg-green-50">Rules</Badge>}
                  {p.penalty_rules && <Badge variant="outline" className="text-xs bg-green-50">Penalties</Badge>}
                  {p.official_documents?.length ? <Badge variant="outline" className="text-xs bg-green-50">{p.official_documents.length} Docs</Badge> : null}
                  {p.faq?.length ? <Badge variant="outline" className="text-xs bg-green-50">{p.faq.length} FAQs</Badge> : null}
                  {p.useful_links?.length ? <Badge variant="outline" className="text-xs bg-green-50">{p.useful_links.length} Links</Badge> : null}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selected ? 'Edit Platform' : 'Add Platform'}</DialogTitle>
            <DialogDescription>Manage platform info and knowledge base</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            <Tabs defaultValue="basic" className="w-full">
              <TabsList className="grid w-full grid-cols-5 mb-4">
                <TabsTrigger value="basic">Basic</TabsTrigger>
                <TabsTrigger value="policies">Policies</TabsTrigger>
                <TabsTrigger value="docs">Docs</TabsTrigger>
                <TabsTrigger value="faq">FAQ</TabsTrigger>
                <TabsTrigger value="links">Links</TabsTrigger>
              </TabsList>

              <TabsContent value="basic" className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Platform Name *</label>
                  <Input required value={formData.name} onChange={e => set('name', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">Icon / Identifier</label>
                  <Input value={formData.icon} onChange={e => set('icon', e.target.value)} placeholder="tiktok, shopee, lazada…" />
                </div>
              </TabsContent>

              <TabsContent value="policies" className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Platform Policies</label>
                  <Textarea rows={5} value={formData.policies} onChange={e => set('policies', e.target.value)}
                    placeholder="Overview of the platform's commerce and community policies…" />
                </div>
                <div>
                  <label className="text-sm font-medium">Livestream Rules</label>
                  <Textarea rows={5} value={formData.livestream_rules} onChange={e => set('livestream_rules', e.target.value)}
                    placeholder="1. No misleading claims&#10;2. Products must be active listings&#10;3. …" />
                </div>
                <div>
                  <label className="text-sm font-medium">Penalty Rules</label>
                  <Textarea rows={4} value={formData.penalty_rules} onChange={e => set('penalty_rules', e.target.value)}
                    placeholder="Violation levels, consequences, how strikes reset…" />
                </div>
              </TabsContent>

              <TabsContent value="docs" className="space-y-4">
                <div className="space-y-2">
                  {formData.official_documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <span className="text-sm flex-1">{doc.title}</span>
                      <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-blue-600"><ExternalLink className="h-4 w-4" /></a>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeDoc(doc.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <Input className="col-span-2" value={newDoc.title} onChange={e => setNewDoc({ ...newDoc, title: e.target.value })} placeholder="Document title" />
                  <Input className="col-span-3" value={newDoc.url} onChange={e => setNewDoc({ ...newDoc, url: e.target.value })} placeholder="URL" />
                  <Button type="button" className="col-span-5" variant="outline" onClick={addDoc}><Plus className="h-4 w-4 mr-2" />Add Document</Button>
                </div>
              </TabsContent>

              <TabsContent value="faq" className="space-y-4">
                <div className="space-y-3">
                  {formData.faq.map(item => (
                    <div key={item.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">{item.question}</p>
                          <p className="text-sm text-gray-600 mt-1">{item.answer}</p>
                        </div>
                        <Button type="button" variant="ghost" size="icon" onClick={() => removeFaq(item.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2 border-t pt-4">
                  <Input value={newFaq.question} onChange={e => setNewFaq({ ...newFaq, question: e.target.value })} placeholder="Question…" />
                  <Textarea rows={2} value={newFaq.answer} onChange={e => setNewFaq({ ...newFaq, answer: e.target.value })} placeholder="Answer…" />
                  <Button type="button" variant="outline" className="w-full" onClick={addFaq}><Plus className="h-4 w-4 mr-2" />Add FAQ</Button>
                </div>
              </TabsContent>

              <TabsContent value="links" className="space-y-4">
                <div className="space-y-2">
                  {formData.useful_links.map(link => (
                    <div key={link.id} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                      <span className="text-sm flex-1">{link.title}</span>
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600"><ExternalLink className="h-4 w-4" /></a>
                      <Button type="button" variant="ghost" size="icon" onClick={() => removeLink(link.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-2">
                  <Input className="col-span-2" value={newLink.title} onChange={e => setNewLink({ ...newLink, title: e.target.value })} placeholder="Link title" />
                  <Input className="col-span-3" value={newLink.url} onChange={e => setNewLink({ ...newLink, url: e.target.value })} placeholder="URL" />
                  <Button type="button" className="col-span-5" variant="outline" onClick={addLink}><Plus className="h-4 w-4 mr-2" />Add Link</Button>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>Cancel</Button>
              <Button type="submit">{selected ? 'Update' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteId}
        onOpenChange={open => !open && setDeleteId(null)}
        title="Delete Platform"
        description="Are you sure? This will also remove its knowledge base."
        onConfirm={() => deleteId && handleDelete(deleteId)}
        confirmText="Delete"
        variant="destructive"
      />
    </>
  )
}
