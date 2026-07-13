# 🚀 Quick Setup Guide

## What You Need to Provide

Before we can run the application, you need to set up Supabase and provide credentials.

## Step-by-Step Setup

### 1. Create Supabase Project

1. Go to https://supabase.com
2. Sign up or log in
3. Click "New Project"
4. Choose:
   - Organization (or create new)
   - Project name: `livestream-ops`
   - Database password: (create a strong password)
   - Region: (choose closest to you)
5. Wait for project to be created (~2 minutes)

### 2. Get Your Credentials

Once your project is ready:

1. Go to **Project Settings** (gear icon in sidebar)
2. Click **API** in the settings menu
3. You'll see:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **anon public** key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...`
   - **service_role** key: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (click "Reveal" to see it)

📋 **Copy all three values** - you'll need them in the next step.

### 3. Run the Database Schema

1. In your Supabase Dashboard, click **SQL Editor** (in the sidebar)
2. Click **New Query**
3. Open the file `/supabase/schema.sql` from this project
4. **Copy the entire content** of that file
5. **Paste it** into the SQL Editor in Supabase
6. Click **Run** button (or press Ctrl/Cmd + Enter)
7. You should see "Success. No rows returned"

This creates all the database tables, security policies, triggers, and default data.

### 4. Configure Google OAuth (Recommended)

1. In Supabase Dashboard, go to **Authentication** → **Providers**
2. Find **Google** in the list
3. Click to expand it
4. Toggle **Enable Google**
5. Follow the instructions provided by Supabase to:
   - Create a Google Cloud project
   - Enable Google+ API
   - Create OAuth credentials
   - Copy Client ID and Client Secret back to Supabase
   - Add the redirect URL to Google Console

**Detailed Google OAuth Guide**: https://supabase.com/docs/guides/auth/social-login/auth-google

*Note: You can skip this for now and use email/password login only*

### 5. Configure Storage Buckets

1. In Supabase Dashboard, go to **Storage**
2. Click **New Bucket** and create:
   - Name: `avatars`
   - Public: ✅ (checked)
   
3. Create another bucket:
   - Name: `report-images`
   - Public: ✅ (checked)
   
4. Create another bucket:
   - Name: `brand-logos`
   - Public: ✅ (checked)

For each bucket, set up policies:
- Click on the bucket
- Go to **Policies** tab
- Add a policy for INSERT: "Allow authenticated users to upload"
- Add a policy for SELECT: "Allow public read access"

### 6. Provide Your Credentials

Once you have completed the above steps, please provide:

```
NEXT_PUBLIC_SUPABASE_URL=<your-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

**Reply with these three values and I'll configure the application and start the development server.**

---

## What Happens Next?

Once you provide the credentials:

1. ✅ I'll configure the `.env.local` file
2. ✅ Start the development server
3. ✅ Open the login page
4. ✅ You can sign in with Google or create an email/password account
5. ✅ Your first user will automatically be created in the database
6. ✅ You'll see the dashboard

## Default First User

The first user to sign up will be created with:
- **Role**: staff (default)
- **Status**: active

To make a user an **admin**, you'll need to:
1. Go to Supabase Dashboard → **Table Editor** → **users** table
2. Find your user
3. Edit the `role` field to `admin`

---

## Troubleshooting

### "Invalid API key"
- Check that you copied the anon key correctly
- Make sure there are no extra spaces

### "Failed to connect to database"
- Verify your project URL is correct
- Check that your project is running (not paused)

### "Google login not working"
- Verify Google OAuth is enabled in Supabase
- Check that redirect URLs are correctly configured in Google Console
- Make sure Client ID and Secret are correct in Supabase

---

**Ready to provide your Supabase credentials?** Reply with the three values mentioned above!
