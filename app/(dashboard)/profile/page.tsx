'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { User as UserIcon, Mail, Phone, Calendar, Briefcase } from 'lucide-react'

export default function ProfilePage() {
  const user = {
    email: 'admin@livestream.com',
    user_metadata: {
      full_name: 'Admin User',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    },
  }

  const profile = {
    full_name: 'Admin User',
    email: 'admin@livestream.com',
    phone: '+1234567890',
    department: 'Management',
    role: 'admin',
    join_date: '2024-01-01',
  }

  const initials = profile.full_name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Profile</h1>
        <p className="text-gray-600">Account information</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-0 shadow-md">
          <CardHeader className="text-center">
            <div className="flex flex-col items-center space-y-4">
              <Avatar className="h-24 w-24">
                <AvatarImage src={user.user_metadata.avatar_url} />
                <AvatarFallback className="bg-gradient-to-br from-blue-600 to-blue-700 text-white text-2xl">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-xl">{profile.full_name}</CardTitle>
                <CardDescription className="mt-1">{profile.email}</CardDescription>
              </div>
              <Badge variant="default">{profile.role}</Badge>
            </div>
          </CardHeader>
        </Card>

        <Card className="border-0 shadow-md lg:col-span-2">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <UserIcon className="h-4 w-4" />
                  Full Name
                </label>
                <Input value={profile.full_name} disabled className="bg-gray-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </label>
                <Input value={profile.email} disabled className="bg-gray-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Phone
                </label>
                <Input value={profile.phone} disabled className="bg-gray-50" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Department
                </label>
                <Input value={profile.department} disabled className="bg-gray-50" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
