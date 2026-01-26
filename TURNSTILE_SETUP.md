# Cloudflare Turnstile Setup Guide

Cloudflare Turnstile has been fully integrated into your Synapsis node to protect against bot registrations and logins.

## How It Works

1. **Admin Configuration**: Admins can add their Cloudflare Turnstile keys in the Admin Settings panel
2. **Automatic Activation**: Once both Site Key and Secret Key are configured, Turnstile is automatically enabled
3. **Frontend Integration**: The Turnstile widget appears on login and registration forms
4. **Server Verification**: All login/register requests are verified server-side with Cloudflare

## Setup Steps

### 1. Get Turnstile Keys from Cloudflare

1. Go to https://dash.cloudflare.com/?to=/:account/turnstile
2. Create a new site
3. Copy your **Site Key** (public) and **Secret Key** (private)

### 2. Configure in Admin Panel

1. Log in as an admin
2. Go to Admin → Settings tab
3. Scroll to "Cloudflare Turnstile (Bot Protection)" section
4. Paste your Site Key and Secret Key
5. Click "Save Settings"

### 3. Test It

1. Log out
2. Go to the login page
3. You should see the Turnstile widget appear
4. Complete the challenge and try logging in

## Features

- ✅ Automatic widget rendering when keys are configured
- ✅ Works on both login and registration forms
- ✅ Server-side token verification
- ✅ Automatic widget reset on form errors
- ✅ Graceful fallback if Turnstile is not configured
- ✅ Submit button disabled until challenge is completed
- ✅ IP address forwarding for better verification

## Technical Details

### Database Schema
- `nodes.turnstile_site_key` - Public site key (exposed to frontend)
- `nodes.turnstile_secret_key` - Private secret key (server-side only)

### API Endpoints Modified
- `POST /api/auth/login` - Now accepts optional `turnstileToken`
- `POST /api/auth/register` - Now accepts optional `turnstileToken`
- `GET /api/node` - Returns `turnstileSiteKey` for frontend

### Files Modified
- `src/db/schema.ts` - Added Turnstile fields
- `src/lib/turnstile.ts` - Verification helper functions
- `src/app/api/auth/login/route.ts` - Token verification
- `src/app/api/auth/register/route.ts` - Token verification
- `src/app/api/node/route.ts` - Expose site key
- `src/app/api/admin/node/route.ts` - Save/update keys
- `src/app/admin/page.tsx` - Admin UI for configuration
- `src/app/login/page.tsx` - Frontend widget integration

## Security Notes

- The Secret Key is NEVER exposed to the frontend
- Only the Site Key is public
- Verification happens server-side with Cloudflare's API
- Failed verifications reject the login/registration attempt
- IP addresses are forwarded for better bot detection
