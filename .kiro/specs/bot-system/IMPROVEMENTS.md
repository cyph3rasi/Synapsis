# Bot System Improvements

## Recent Changes

### 1. Simplified Encryption (✅ Completed)

**Problem**: Required a separate `BOT_ENCRYPTION_KEY` environment variable, adding complexity to deployment.

**Solution**: Now uses `AUTH_SECRET` (which is already required) for encryption. A 32-byte key is derived using SHA-256.

**Benefits**:
- One less environment variable to manage
- Simpler deployment process
- Same security level (AES-256-GCM)

**Migration**: Remove `BOT_ENCRYPTION_KEY` from your `.env` file. Existing encrypted keys will need to be re-encrypted (or you can keep the old key temporarily for migration).

### 2. Automatic Content Fetching (✅ Completed)

**Problem**: Users had to manually set fetch intervals, and content fetching was a separate scheduled process.

**Solution**: Content is now fetched automatically when a post is triggered. The system:
1. Checks all active content sources
2. Fetches fresh content (with retry logic)
3. Selects the best content item
4. Generates and posts

**Benefits**:
- No manual fetch interval configuration needed
- Always uses fresh content
- Simpler user experience
- Removed `fetchIntervalMinutes` column from database

**Migration**: Run the migration: `drizzle/0001_remove_fetch_interval.sql`

### 3. Fixed Reddit Link Previews (✅ Completed)

**Problem**: Reddit blocks regular HTTP scraping with aggressive bot detection, returning login/blocked pages instead of actual content with Open Graph tags. This caused bot posts with Reddit URLs to have NULL metadata for title, description, and image.

**Solution**: Implemented Reddit-specific handling using their oEmbed API (`https://www.reddit.com/oembed`), which is designed for embedding and doesn't require authentication.

**Benefits**:
- Reddit link previews now work reliably
- Extracts title, description (subreddit/author), and thumbnail when available
- Falls back gracefully if oEmbed fails
- Other sites continue to use standard OG tag scraping

**Files Modified**:
- `src/lib/bots/posting.ts` - Added `isRedditUrl()` and `fetchRedditPreview()` functions
- `src/app/api/media/preview/route.ts` - Same Reddit-specific handling for the preview API

## Implementation Details

### Encryption Changes

**File**: `src/lib/bots/encryption.ts`

```typescript
// Before
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.BOT_ENCRYPTION_KEY;
  // ... complex base64/hex decoding logic
}

// After
function getEncryptionKey(): Buffer {
  const keyEnv = process.env.AUTH_SECRET;
  if (!keyEnv) {
    throw new Error('AUTH_SECRET environment variable is not set');
  }
  // Create a 32-byte key from AUTH_SECRET using SHA-256
  return crypto.createHash('sha256').update(keyEnv).digest();
}
```

### Content Fetching Changes

**File**: `src/lib/bots/posting.ts`

The `triggerPost` function now automatically fetches content before posting:

```typescript
// Auto-fetch content from sources before posting
const activeSources = await getActiveSourcesByBot(botId);
if (activeSources.length > 0) {
  const fetchResults = await Promise.allSettled(
    activeSources.map(source => 
      fetchContentWithRetry(source.id, 2, { maxItems: 10, timeout: 15000 })
    )
  );
}
```

### Database Schema Changes

**File**: `src/db/schema.ts`

Removed:
```typescript
fetchIntervalMinutes: integer('fetch_interval_minutes').default(30).notNull(),
```

## Testing

After these changes, test:

1. ✅ Bot creation with API key encryption
2. ✅ Manual post triggering (should auto-fetch content)
3. ✅ Reddit content sources
4. ✅ RSS content sources
5. ✅ News API content sources

## Next Steps

Consider:
- Add UI feedback showing when content is being fetched
- Add content preview before posting
- Add ability to regenerate post content if user doesn't like it
- Add scheduling for automatic posts (cron-based)
