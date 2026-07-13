# Project Architecture Documentation

## Overview

This is a Next.js 16 application for managing livestream e-commerce operations. Built with TypeScript, TailwindCSS, and shadcn/ui components.

## Folder Structure

```
/app/
├── app/                          # Next.js App Router
│   ├── (dashboard)/              # Protected dashboard routes
│   │   ├── analytics/            # Analytics & charts page
│   │   ├── brands/               # Brand management
│   │   ├── calendar/             # Calendar with 4 views
│   │   ├── campaigns/            # Campaign management
│   │   ├── live/                 # Live monitoring dashboard
│   │   ├── platforms/            # Platform management
│   │   ├── profile/              # User profile
│   │   ├── reports/              # Final session reports
│   │   ├── settings/             # App settings
│   │   ├── staff/                # Staff management
│   │   ├── swaps/                # Shift swap requests
│   │   ├── layout.tsx            # Dashboard layout with sidebar
│   │   └── page.tsx              # Dashboard home
│   └── api/                      # API routes
│       └── ai/                   # AI endpoints (infrastructure only)
│           └── chat/             # Chat completion endpoint
│               └── route.ts
│
├── components/
│   ├── features/                 # Feature-specific components
│   │   ├── analytics/            # DashboardAnalytics
│   │   ├── brands/               # Brand CRUD components
│   │   ├── calendar/             # Calendar views (Month/Week/Day/List)
│   │   ├── campaigns/            # Campaign components
│   │   ├── gallery/              # ImageGallery with lightbox
│   │   ├── live/                 # Live monitoring components
│   │   ├── notifications/        # NotificationCenter
│   │   ├── platforms/            # Platform components
│   │   ├── reports/              # Report components
│   │   ├── search/               # GlobalSearch (Cmd+K)
│   │   ├── shifts/               # Shift management
│   │   ├── staff/                # Staff CRUD components
│   │   ├── swaps/                # Swap request components
│   │   └── timeline/             # ActivityTimeline
│   ├── layout/                   # Layout components
│   │   ├── BottomNav.tsx         # Mobile bottom navigation
│   │   ├── Header.tsx            # Top header with search & notifications
│   │   └── Sidebar.tsx           # Desktop sidebar navigation
│   └── ui/                       # Reusable UI components (shadcn/ui)
│       ├── alert-dialog.tsx
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       ├── data-table.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── input.tsx
│       ├── select.tsx
│       ├── skeleton.tsx
│       ├── tabs.tsx
│       ├── textarea.tsx
│       └── toast.tsx
│
├── lib/
│   ├── ai/                       # AI Module (Phase 2+)
│   │   ├── service.ts            # OpenAI client wrapper
│   │   ├── types.ts              # AI type definitions
│   │   ├── hooks.ts              # useAIChat hook
│   │   ├── utils.ts              # AI utility functions
│   │   ├── index.ts              # Module exports
│   │   └── prompts/              # Prompt templates (ready for Phase 2)
│   │       ├── report.ts         # Report generation prompts
│   │       ├── dashboard.ts      # Real-time insights prompts
│   │       ├── analytics.ts      # Analytics prompts
│   │       ├── shift.ts          # Shift optimization prompts
│   │       ├── swap.ts           # Swap evaluation prompts
│   │       └── index.ts          # Prompt exports
│   ├── services/                 # Business logic services
│   │   ├── dataService.ts        # Main data service (CRUD operations)
│   │   ├── mockData.ts           # Mock data for Phase 1
│   │   └── templateService.ts    # Shift template service
│   ├── types/                    # TypeScript definitions
│   │   └── database.types.ts     # All entity types
│   └── utils/                    # Utility functions
│       ├── cn.ts                 # Tailwind class merger
│       ├── entityHelpers.ts      # Shared entity helpers (NEW)
│       ├── excelUtils.ts         # Excel export utilities
│       ├── lazyComponents.ts     # Lazy-loaded components (NEW)
│       └── shiftUtils.ts         # Shift-specific utilities
│
├── docs/                         # Documentation
│   └── AI_INTEGRATION.md         # AI setup guide
│
├── .env.local                    # Environment variables
├── next.config.ts                # Next.js configuration
├── package.json                  # Dependencies
├── tailwind.config.ts            # Tailwind configuration
└── tsconfig.json                 # TypeScript configuration
```

## Key Architectural Patterns

### 1. Service Layer Pattern
All data operations go through `/lib/services/dataService.ts`:
- ✅ Centralized data access
- ✅ Easy to swap mock data with real database
- ✅ No direct database calls in components

```typescript
// Example usage
import { shiftService } from '@/lib/services/dataService'

const shifts = await shiftService.getAll()
const shift = await shiftService.getById(id)
await shiftService.create(data)
await shiftService.update(id, data)
await shiftService.delete(id)
```

### 2. Feature-Based Component Organization
Components are organized by feature, not by type:
- ✅ Each feature is self-contained
- ✅ Easy to find related components
- ✅ Clear separation of concerns

### 3. AI Module (Decoupled)
AI is completely separate in `/lib/ai/`:
- ✅ No business logic depends on AI
- ✅ AI can be added/removed without affecting core features
- ✅ Prompt templates ready for Phase 2

### 4. Shared Utilities
Common functions in `/lib/utils/entityHelpers.ts`:
- ✅ Eliminates code duplication
- ✅ Consistent behavior across components
- ✅ Single source of truth for entity helpers

### 5. Lazy Loading
Heavy components are lazy-loaded via `/lib/utils/lazyComponents.ts`:
- ✅ Reduced initial bundle size
- ✅ Faster page loads
- ✅ Better performance on slow connections

## Data Flow

```
User Interaction
      ↓
  Component
      ↓
  Data Service (/lib/services/dataService.ts)
      ↓
  Mock Data (/lib/services/mockData.ts) [Phase 1]
      OR
  Supabase Database [Phase 2+]
      ↓
  Response to Component
      ↓
  UI Update
```

## Performance Optimizations

### 1. Code Splitting
- Lazy loading for Calendar, Analytics, Reports, Live, Swaps
- Reduces initial JavaScript bundle

### 2. Component Optimization
- Memoization where appropriate
- Minimal prop passing
- Efficient re-render strategies

### 3. Image Optimization
- Next.js Image component (where applicable)
- Lazy loading images in galleries

## State Management

**Current:** React hooks (useState, useEffect, useCallback, useMemo)
- ✅ Simple and sufficient for Phase 1
- ✅ No external state management library needed yet

**Future (Phase 2):**
- Consider Zustand or Context API if state complexity increases
- Server state management with React Query/SWR for real database

## API Routes

### `/api/ai/chat` (POST)
OpenAI chat completions (streaming & non-streaming)
- **Status:** Infrastructure ready (requires API key)
- **Usage:** AI features in Phase 2+

## Type Safety

All types defined in `/lib/types/`:
- `database.types.ts` - All entity types (User, Shift, Report, etc.)
- `/lib/ai/types.ts` - AI-specific types

## Styling

- **TailwindCSS** - Utility-first CSS
- **shadcn/ui** - Prebuilt component library
- **Responsive** - Mobile-first design
- **Dark Mode** - Not yet implemented (Phase 2+)

## Testing Strategy

**Current:**
- Manual QA via testing agent
- Screenshot testing
- Basic error boundary testing

**Future:**
- Unit tests (Jest + React Testing Library)
- E2E tests (Playwright)
- Integration tests

## Deployment Readiness

### Phase 1 (Current)
- ✅ Mock data fully functional
- ✅ All CRUD operations working
- ✅ Responsive design
- ✅ No hardcoded credentials
- ✅ Environment variables properly configured
- ✅ Build optimizations

### Phase 2 (Next)
- ⏳ Supabase integration
- ⏳ Real authentication
- ⏳ Database migration
- ⏳ File storage setup

## Technical Debt

### High Priority
1. ~~Duplicate entity helper functions~~ ✅ FIXED - Created `/lib/utils/entityHelpers.ts`
2. Form validation UX improvements (error visibility)
3. TypeScript `any` types in some places

### Medium Priority
1. Memoization in large lists (Staff, Brands, Shifts)
2. Virtual scrolling for large data sets
3. Optimistic UI updates

### Low Priority
1. Dark mode support
2. Internationalization (i18n)
3. Advanced keyboard shortcuts

## Migration Path to Phase 2

### Steps to integrate Supabase:
1. Update `/lib/services/dataService.ts` to use Supabase client
2. Remove `/lib/services/mockData.ts`
3. Update environment variables
4. Migrate data structure to Supabase tables
5. Add authentication flows
6. Set up file storage for images
7. Test all CRUD operations

### AI Integration (Post-Supabase):
1. User provides OpenAI API key OR add Python backend for Emergent key
2. Connect prompt templates to UI workflows
3. Add AI-powered features:
   - Report insights generation
   - Smart scheduling recommendations
   - Analytics natural language queries
   - Chat assistant

## Security Considerations

### Current (Phase 1 - Mock Data)
- No authentication (bypassed)
- No sensitive data
- Local development only

### Future (Phase 2+)
- Supabase Row Level Security (RLS)
- JWT authentication
- Role-based access control (Admin, Leader, Host, Support)
- API key security (server-side only)
- Input validation & sanitization

## Browser Support

- **Chrome/Edge:** 100+
- **Firefox:** 100+
- **Safari:** 14+
- **Mobile:** iOS 14+, Android Chrome 100+

## Environment Variables

```env
# Supabase (Phase 2)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Mock Data Flag
NEXT_PUBLIC_USE_MOCK_DATA=true

# AI Integration (Optional)
OPENAI_API_KEY=
DEFAULT_AI_MODEL=gpt-5.4-mini
```

## Best Practices

1. **Always use the service layer** - Never call mock data directly
2. **Use shared utilities** - Import from `/lib/utils/entityHelpers.ts`
3. **Lazy load heavy components** - Use `/lib/utils/lazyComponents.ts`
4. **Type everything** - No implicit `any` types
5. **Handle loading states** - Always show loading indicators
6. **Handle empty states** - Provide helpful empty state messages
7. **Handle errors** - Use toast notifications for user feedback

## Commands

```bash
# Development
yarn dev                  # Start dev server

# Building
yarn build               # Production build
yarn start               # Start production server

# Linting
yarn lint                # Run ESLint

# Type Checking
yarn tsc --noEmit        # Check TypeScript errors
```

## Support & Maintenance

- **Framework:** Next.js 16 (App Router)
- **Node Version:** 20.20.2 (upgrade to 22+ recommended for all packages)
- **Package Manager:** Yarn 1.22.22
