import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings as SettingsIcon } from 'lucide-react'

export default function SettingsPage() {
  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600">Configure system settings and preferences</p>
      </div>
      <Card className="border-0 shadow-md">
        <CardHeader>
          <CardTitle>System Configuration</CardTitle>
          <CardDescription>Manage app settings and configurations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-16 text-gray-500">
            <SettingsIcon className="h-16 w-16 mx-auto mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">Settings Coming Soon</p>
            <p className="text-sm">Admin settings will be available in a future update</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
