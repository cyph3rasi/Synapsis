# Implementation Plan: Bot System

## Overview

This implementation plan breaks down the bot system into incremental coding tasks. Each task builds on previous work and includes property-based tests to validate correctness. The plan follows the existing Synapsis patterns for database schema, API routes, and ActivityPub federation.

## Tasks

- [x] 1. Set up database schema for bot system
  - [x] 1.1 Create bot tables in schema.ts
    - Add `bots` table with user reference, personality config, LLM config, and status fields
    - Add `botContentSources` table for RSS, Reddit, and news API sources
    - Add `botContentItems` table for fetched content
    - Add `botMentions` table for tracking mentions
    - Add `botActivityLogs` table for activity logging
    - Add `botRateLimits` table for rate limit tracking
    - Add relations and indexes
    - _Requirements: 1.1, 1.2, 4.5, 8.1_

  - [x] 1.2 Run database migration
    - Generate and apply Drizzle migration
    - _Requirements: 1.1_

- [x] 2. Implement encryption utilities for API keys
  - [x] 2.1 Create encryption module in src/lib/bots/encryption.ts
    - Implement AES-256 encryption for API keys
    - Implement decryption function
    - Add key format validation for OpenRouter, OpenAI, Anthropic
    - _Requirements: 2.1, 2.2, 2.3, 10.3_

  - [x] 2.2 Write property test for API key encryption round-trip
    - **Property 6: API Key Encryption Round-Trip**
    - **Validates: Requirements 2.2, 2.3**

  - [x] 2.3 Write property test for API key format validation
    - **Property 7: API Key Format Validation**
    - **Validates: Requirements 2.1**

- [x] 3. Implement Bot Manager core functionality
  - [x] 3.1 Create Bot Manager service in src/lib/bots/botManager.ts
    - Implement createBot with user linking and unique ID generation
    - Implement updateBot for configuration changes
    - Implement deleteBot with cascade deletion
    - Implement getBotsByUser and getBotById
    - Implement bot limit enforcement per user
    - Generate ActivityPub keys for bots
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 3.2 Write property test for bot creation links to user
    - **Property 1: Bot Creation Links to User**
    - **Validates: Requirements 1.1, 1.2**

  - [x] 3.3 Write property test for bot listing completeness
    - **Property 2: Bot Listing Completeness**
    - **Validates: Requirements 1.3**

  - [x] 3.4 Write property test for bot deletion cascade
    - **Property 3: Bot Deletion Cascade**
    - **Validates: Requirements 1.4**

  - [x] 3.5 Write property test for bot limit enforcement
    - **Property 5: Bot Limit Enforcement**
    - **Validates: Requirements 1.6**

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement Bot API routes
  - [x] 5.1 Create bot CRUD API routes
    - POST /api/bots - Create bot
    - GET /api/bots - List user's bots
    - GET /api/bots/[id] - Get bot details
    - PUT /api/bots/[id] - Update bot
    - DELETE /api/bots/[id] - Delete bot
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 5.2 Create API key management routes
    - POST /api/bots/[id]/api-key - Set API key
    - DELETE /api/bots/[id]/api-key - Remove API key
    - GET /api/bots/[id]/api-key/status - Check key status
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 5.3 Write property test for LLM provider support
    - **Property 8: LLM Provider Support**
    - **Validates: Requirements 2.6**

- [x] 6. Implement personality configuration
  - [x] 6.1 Create personality config types and validation in src/lib/bots/personality.ts
    - Define PersonalityConfig interface
    - Implement validation for system prompt, temperature, maxTokens
    - Implement storage and retrieval functions
    - _Requirements: 3.1, 3.3, 3.4_

  - [x] 6.2 Write property test for personality configuration persistence
    - **Property 9: Personality Configuration Persistence**
    - **Validates: Requirements 3.1, 3.3, 3.4**

- [x] 7. Implement Content Source Monitor
  - [x] 7.1 Create content source service in src/lib/bots/contentSource.ts
    - Implement addSource with URL validation
    - Implement removeSource
    - Implement source type validation (RSS, Reddit, news API)
    - _Requirements: 4.1, 4.6_

  - [x] 7.2 Implement RSS feed parser
    - Create RSS parser using xml parsing
    - Extract title, content, URL, publication date
    - Handle malformed feeds gracefully
    - _Requirements: 4.2_

  - [x] 7.3 Implement content fetching with retry logic
    - Implement fetch with exponential backoff on failure
    - Track consecutive errors per source
    - Store fetched content items
    - _Requirements: 4.5, 4.7_

  - [x] 7.4 Write property test for content source URL validation
    - **Property 11: Content Source URL Validation**
    - **Validates: Requirements 4.1**

  - [x] 7.5 Write property test for RSS parsing correctness
    - **Property 12: RSS Parsing Correctness**
    - **Validates: Requirements 4.2**

  - [x] 7.6 Write property test for content item storage
    - **Property 13: Content Item Storage**
    - **Validates: Requirements 4.5**

  - [x] 7.7 Write property test for multiple source types per bot
    - **Property 14: Multiple Source Types Per Bot**
    - **Validates: Requirements 4.6**

  - [x] 7.8 Write property test for fetch error retry with backoff
    - **Property 15: Fetch Error Retry with Backoff**
    - **Validates: Requirements 4.7**

- [x] 8. Implement content source API routes
  - [x] 8.1 Create content source API routes
    - POST /api/bots/[id]/sources - Add source
    - GET /api/bots/[id]/sources - List sources
    - PUT /api/bots/[id]/sources/[sid] - Update source
    - DELETE /api/bots/[id]/sources/[sid] - Remove source
    - POST /api/bots/[id]/sources/[sid]/fetch - Manual fetch
    - _Requirements: 4.1, 4.6_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement Rate Limiter
  - [x] 10.1 Create rate limiter service in src/lib/bots/rateLimiter.ts
    - Implement canPost check (50/day, 5min interval)
    - Implement canReply check (20/hour)
    - Implement recordPost and recordReply
    - Implement getRemainingQuota
    - _Requirements: 5.6, 7.6, 10.1, 10.2, 10.4_

  - [x] 10.2 Write property test for rate limit enforcement
    - **Property 19: Rate Limit Enforcement**
    - **Validates: Requirements 5.6, 10.1, 10.2, 10.4**

  - [x] 10.3 Write property test for reply rate limiting
    - **Property 25: Reply Rate Limiting**
    - **Validates: Requirements 7.6**

- [x] 11. Implement Post Scheduler
  - [x] 11.1 Create scheduler service in src/lib/bots/scheduler.ts
    - Implement schedule configuration storage
    - Support interval, time-of-day, and cron-like schedules
    - Implement isDue check for schedules
    - Implement processScheduledPosts
    - Skip posting when no content available
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 11.2 Write property test for schedule configuration persistence
    - **Property 16: Schedule Configuration Persistence**
    - **Validates: Requirements 5.1, 5.3**

  - [x] 11.3 Write property test for scheduled post triggering
    - **Property 17: Scheduled Post Triggering**
    - **Validates: Requirements 5.2, 5.4**

  - [x] 11.4 Write property test for skip when no content
    - **Property 18: Skip When No Content**
    - **Validates: Requirements 5.5**

- [x] 12. Implement Content Generator (LLM integration)
  - [x] 12.1 Create LLM client in src/lib/bots/llmClient.ts
    - Implement OpenRouter API client
    - Implement OpenAI API client
    - Implement Anthropic API client
    - Add retry logic (3 retries)
    - _Requirements: 2.6, 11.4_

  - [x] 12.2 Create content generator in src/lib/bots/contentGenerator.ts
    - Implement generatePost with personality context
    - Implement generateReply with conversation context
    - Implement evaluateContentInterest for autonomous mode
    - Implement content truncation for long sources
    - _Requirements: 3.2, 3.5, 6.2, 11.1, 11.2, 11.3_

  - [x] 12.3 Write property test for personality in LLM prompts
    - **Property 10: Personality in LLM Prompts**
    - **Validates: Requirements 3.2, 3.5**

  - [x] 12.4 Write property test for LLM prompt construction
    - **Property 35: LLM Prompt Construction**
    - **Validates: Requirements 11.1, 11.2**

  - [x] 12.5 Write property test for content truncation
    - **Property 36: Content Truncation**
    - **Validates: Requirements 11.3**

  - [x] 12.6 Write property test for LLM retry logic
    - **Property 37: LLM Retry Logic**
    - **Validates: Requirements 11.4**

- [x] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement autonomous posting
  - [x] 14.1 Create autonomous posting logic in src/lib/bots/autonomous.ts
    - Implement content evaluation flow
    - Implement autonomous post decision logic
    - Respect rate limits
    - Support autonomous mode toggle
    - _Requirements: 6.1, 6.2, 6.3, 6.5_

  - [x] 14.2 Write property test for autonomous mode content evaluation
    - **Property 20: Autonomous Mode Content Evaluation**
    - **Validates: Requirements 6.1, 6.2, 6.3**

  - [x] 14.3 Write property test for autonomous mode toggle
    - **Property 21: Autonomous Mode Toggle**
    - **Validates: Requirements 6.5**

- [x] 15. Implement bot posting flow
  - [x] 15.1 Create post creation logic in src/lib/bots/posting.ts
    - Implement triggerPost function
    - Select content from sources
    - Generate post via LLM
    - Validate post content
    - Create post in database
    - Integrate with rate limiter
    - _Requirements: 5.4, 11.5, 11.6_

  - [x] 15.2 Create bot operations API routes
    - POST /api/bots/[id]/post - Manual post trigger
    - _Requirements: 5.4_

  - [x] 15.3 Write property test for post content validation
    - **Property 38: Post Content Validation**
    - **Validates: Requirements 11.5**

- [x] 16. Implement Mention Handler
  - [x] 16.1 Create mention detection in src/lib/bots/mentionHandler.ts
    - Implement mention detection from posts
    - Store detected mentions
    - Retrieve mentioning post content
    - _Requirements: 7.1, 7.2_

  - [x] 16.2 Implement mention response generation
    - Generate response with conversation context
    - Include original post in LLM prompt
    - Process mentions in chronological order
    - Respect reply rate limits
    - _Requirements: 7.3, 7.4, 7.5, 7.6_

  - [x] 16.3 Create mention API routes
    - GET /api/bots/[id]/mentions - Get pending mentions
    - POST /api/bots/[id]/mentions/[mid]/respond - Manual respond
    - _Requirements: 7.1_

  - [x] 16.4 Write property test for mention detection
    - **Property 22: Mention Detection**
    - **Validates: Requirements 7.1, 7.2**

  - [x] 16.5 Write property test for mention response context
    - **Property 23: Mention Response Context**
    - **Validates: Requirements 7.3, 7.4**

  - [x] 16.6 Write property test for mention chronological processing
    - **Property 24: Mention Chronological Processing**
    - **Validates: Requirements 7.5**

- [ ] 17. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 18. Implement Activity Logger
  - [x] 18.1 Create activity logger in src/lib/bots/activityLogger.ts
    - Implement log function for all action types
    - Record action type, timestamp, result, error message
    - Implement getLogsForBot with filtering
    - Implement reverse chronological ordering
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.6_

  - [x] 18.2 Create activity log API routes
    - GET /api/bots/[id]/logs - Get logs with filters
    - GET /api/bots/[id]/logs/errors - Get error logs
    - _Requirements: 8.2, 8.6_

  - [ ] 18.3 Write property test for activity log completeness
    - **Property 26: Activity Log Completeness**
    - **Validates: Requirements 8.1, 8.3, 8.4**

  - [ ] 18.4 Write property test for activity log ordering
    - **Property 27: Activity Log Ordering**
    - **Validates: Requirements 8.2**

  - [ ] 18.5 Write property test for activity log filtering
    - **Property 28: Activity Log Filtering**
    - **Validates: Requirements 8.6**

- [-] 19. Implement bot suspension
  - [x] 19.1 Create suspension logic in src/lib/bots/suspension.ts
    - Implement suspendBot function
    - Implement reinstateBot function
    - Block all actions for suspended bots
    - _Requirements: 10.6_

  - [x] 19.2 Create admin suspension API routes
    - POST /api/bots/[id]/suspend - Suspend bot
    - POST /api/bots/[id]/reinstate - Reinstate bot
    - _Requirements: 10.6_

  - [ ] 19.3 Write property test for bot suspension enforcement
    - **Property 34: Bot Suspension Enforcement**
    - **Validates: Requirements 10.6**

- [-] 20. Implement input sanitization
  - [x] 20.1 Create input sanitization in src/lib/bots/sanitization.ts
    - Implement SQL injection prevention
    - Implement XSS prevention
    - Implement command injection prevention
    - Apply to all user inputs
    - _Requirements: 10.5_

  - [ ] 20.2 Write property test for input sanitization
    - **Property 33: Input Sanitization**
    - **Validates: Requirements 10.5**

- [ ] 21. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 22. Implement ActivityPub federation for bots
  - [-] 22.1 Update ActivityPub actor for bots in src/lib/activitypub/actor.ts
    - Add bot type detection
    - Include bot flag in actor object (type: "Service" or bot property)
    - Include bot creator reference
    - _Requirements: 9.3, 12.3, 12.4_

  - [x] 22.2 Implement bot post federation
    - Generate Create activities for bot posts
    - Deliver to followers
    - _Requirements: 9.1_

  - [x] 22.3 Implement federated mention handling
    - Detect mentions from remote instances
    - Process remote mentions like local ones
    - _Requirements: 9.2_

  - [x] 22.4 Implement bot follow handling
    - Handle Follow activities for bots
    - Generate Accept/Reject activities
    - _Requirements: 9.5_

  - [ ] 22.5 Write property test for federation post distribution
    - **Property 29: Federation Post Distribution**
    - **Validates: Requirements 9.1**

  - [ ] 22.6 Write property test for federated mention handling
    - **Property 30: Federated Mention Handling**
    - **Validates: Requirements 9.2**

  - [ ] 22.7 Write property test for ActivityPub bot flag
    - **Property 31: ActivityPub Bot Flag**
    - **Validates: Requirements 9.3**

  - [ ] 22.8 Write property test for bot follow handling
    - **Property 32: Bot Follow Handling**
    - **Validates: Requirements 9.5**

- [-] 23. Implement bot identification in UI
  - [x] 23.1 Update user/bot display components
    - Add bot badge to profile display
    - Show bot creator on bot profiles
    - Ensure bot flag cannot be hidden
    - _Requirements: 12.1, 12.2, 12.3, 12.4_

  - [ ] 23.2 Write property test for bot identification immutability
    - **Property 4: Bot Identification Immutability**
    - **Validates: Requirements 1.5, 12.1, 12.2, 12.4**

  - [ ] 23.3 Write property test for bot creator attribution
    - **Property 39: Bot Creator Attribution**
    - **Validates: Requirements 12.3**

- [-] 24. Create Bot Management UI
  - [x] 24.1 Create bot list page at src/app/settings/bots/page.tsx
    - Display user's bots
    - Show bot status, last post time
    - Add create bot button
    - _Requirements: 1.3_

  - [x] 24.2 Create bot creation form at src/app/settings/bots/new/page.tsx
    - Bot name, handle, bio, avatar
    - Personality configuration
    - LLM provider and model selection
    - API key input
    - _Requirements: 1.1, 2.1, 3.1_

  - [x] 24.3 Create bot detail/edit page at src/app/settings/bots/[id]/page.tsx
    - Edit bot configuration
    - Manage content sources
    - View activity logs
    - Manual post/respond actions
    - _Requirements: 1.3, 4.6, 8.2_

- [ ] 25. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required including property-based tests
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- The implementation follows existing Synapsis patterns for consistency
