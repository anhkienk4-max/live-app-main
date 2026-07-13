# LiveStream Operations Management System

A modern, production-ready internal web application for managing livestream operations for e-commerce teams. Built with Next.js, TypeScript, Supabase, and Tailwind CSS.

## 🎯 Project Overview

This application helps livestream teams manage:
- **Schedules & Shifts**: Calendar-based shift management
- **Live Monitoring**: Real-time dashboard updates every 30 minutes during livestreams
- **Reports**: Post-live performance reports with image uploads
- **Analytics**: Performance metrics and insights
- **Staff Management**: Team member organization
- **Brand & Campaign Management**: Organize livestreams by brand and campaign

## 🏗️ Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth (Google OAuth + Email)
- **Storage**: Supabase Storage
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Charts**: Recharts
- **Excel**: xlsx (SheetJS)
- **Icons**: Lucide React

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- Yarn package manager
- A Supabase account and project

### Step 1: Supabase Setup

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once your project is ready, go to **Project Settings** → **API**
3. Copy the following credentials:
   - `Project URL`
   - `anon public` key
   - `service_role` key (keep this secret!)

4. Go to **SQL Editor** in your Supabase dashboard
5. Copy the entire content of `/supabase/schema.sql` from this project
6. Paste it into the SQL Editor and run it
7. This will create all necessary tables, policies, triggers, and indexes

### Step 2: Configure Google OAuth (Optional)

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Enable Google provider
3. Follow Supabase's instructions to:
   - Create OAuth credentials in Google Cloud Console
   - Add the credentials to Supabase
   - Configure authorized redirect URIs

### Step 3: Configure Storage

1. In Supabase Dashboard, go to **Storage**
2. Create the following buckets:
   - `avatars` (for user profile pictures)
   - `report-images` (for live report images)
   - `brand-logos` (for brand logos)
3. Set appropriate policies for each bucket (allow authenticated users to upload)

### Step 4: Environment Variables

1. Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in your Supabase credentials:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   NEXT_PUBLIC_APP_URL=http://localhost:3000
   ```

### Step 5: Install Dependencies

```bash
yarn install
```

### Step 6: Run Development Server

```bash
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 👥 User Roles

The system supports three user roles:

### Admin
- Full system access
- Manage users, brands, platforms, campaigns
- Import/export schedules
- Approve swap requests
- View all analytics

### Team Leader
- View all shifts
- Approve swap requests
- Review reports
- View analytics
- Monitor live sessions

### Staff (Host/Support)
- View own schedule
- Submit reports
- Upload images
- Update live dashboard
- Request shift swaps

## 📋 Development Phases

### ✅ Phase 1 (Current)
- [x] Authentication (Google OAuth + Email)
- [x] Dashboard layout with navigation
- [x] User profile
- [x] Database schema
- [ ] Staff management (CRUD)
- [ ] Brand management (CRUD)
- [ ] Platform management (CRUD)
- [ ] Campaign management (CRUD)
- [ ] Calendar view
- [ ] Shift management

### 🔄 Phase 2 (Next)
- [ ] Shift registration
- [ ] Shift swap requests
- [ ] Notifications system
- [ ] Role-based permissions

### 🔜 Phase 3
- [ ] Live monitoring dashboard
- [ ] 30-minute dashboard updates
- [ ] Live timeline tracking
- [ ] Operations center

### 🔜 Phase 4
- [ ] Post-live reports
- [ ] Image upload & gallery
- [ ] Report detail views

### 🔜 Phase 5
- [ ] Analytics & charts
- [ ] Excel import/export
- [ ] PDF export
- [ ] Advanced reporting

## 🎨 Design System

The application follows an enterprise SaaS design inspired by ADA Global:

### Colors
- **Primary Blue**: `#2563EB`
- **Background**: `#F8FAFC`
- **Cards**: White with soft shadows
- **Text**: Gray scale

### Typography
- **Font**: Inter
- **Headings**: Bold, large sizes
- **Body**: Medium weight, readable

### Components
- **Border Radius**: 16px (soft, rounded)
- **Shadows**: Subtle elevation
- **Spacing**: 8px grid system
- **Mobile-First**: Responsive design

## 📱 Responsive Design

- **Mobile**: Bottom navigation, stacked layouts
- **Tablet**: Optimized spacing
- **Desktop**: Sidebar navigation, multi-column layouts

## 🔐 Security

- Row Level Security (RLS) enabled on all tables
- Role-based access control
- Secure authentication via Supabase
- Protected API routes
- Environment variables for sensitive data

## 🧪 Testing

```bash
# Run tests (when available)
yarn test

# Run linting
yarn lint

# Type checking
yarn type-check
```

## 📦 Building for Production

```bash
yarn build
```

## 🚢 Deployment

This application is optimized for deployment on:
- **Vercel** (recommended for Next.js)
- **Netlify**
- Any platform supporting Next.js

### Environment Variables for Production

Make sure to set all environment variables in your deployment platform:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL` (your production URL)

## 📚 Key Features

### Live Monitoring (Phase 3)
- **Automatic reminders** every 30 minutes during live sessions
- **Dashboard updates** with revenue, orders, viewers
- **Screenshot uploads** for each update
- **Timeline tracking** throughout the session
- **Warning notifications** for overdue updates

### Reports (Phase 4)
- **Comprehensive metrics**: Revenue, orders, viewers, engagement
- **Image gallery**: Before/during/after live photos
- **Performance insights**: What went well, areas for improvement
- **Top products tracking**

### Analytics (Phase 5)
- **Revenue trends** over time
- **Performance by brand** and platform
- **Staff performance** metrics
- **Comparative analysis**

## 🤝 Contributing

This is an internal application. For questions or support, contact the development team.

## 📄 License

Internal use only. All rights reserved.

## 📞 Support

For technical support or questions about the system, please contact your system administrator.

---

**Built with ❤️ for efficient livestream operations**
