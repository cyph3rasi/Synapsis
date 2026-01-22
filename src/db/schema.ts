import { pgTable, text, timestamp, uuid, integer, boolean, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================
// NODES
// ============================================

export const nodes = pgTable('nodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  domain: text('domain').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  longDescription: text('long_description'),
  rules: text('rules'),
  bannerUrl: text('banner_url'),
  accentColor: text('accent_color').default('#FFFFFF'),
  publicKey: text('public_key'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ============================================
// USERS
// ============================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  did: text('did').notNull().unique(), // Decentralized Identifier
  handle: text('handle').notNull().unique(), // @username (globally unique)
  email: text('email').unique(),
  passwordHash: text('password_hash'),
  displayName: text('display_name'),
  bio: text('bio'),
  avatarUrl: text('avatar_url'),
  headerUrl: text('header_url'),
  privateKeyEncrypted: text('private_key_encrypted'), // For ActivityPub signing
  publicKey: text('public_key').notNull(),
  nodeId: uuid('node_id').references(() => nodes.id),
  isSuspended: boolean('is_suspended').default(false).notNull(),
  suspensionReason: text('suspension_reason'),
  suspendedAt: timestamp('suspended_at'),
  isSilenced: boolean('is_silenced').default(false).notNull(),
  silenceReason: text('silence_reason'),
  silencedAt: timestamp('silenced_at'),
  followersCount: integer('followers_count').default(0).notNull(),
  followingCount: integer('following_count').default(0).notNull(),
  postsCount: integer('posts_count').default(0).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('users_handle_idx').on(table.handle),
  index('users_did_idx').on(table.did),
  index('users_suspended_idx').on(table.isSuspended),
  index('users_silenced_idx').on(table.isSilenced),
]);

export const usersRelations = relations(users, ({ one, many }) => ({
  node: one(nodes, {
    fields: [users.nodeId],
    references: [nodes.id],
  }),
  posts: many(posts),
  followers: many(follows, { relationName: 'following' }),
  following: many(follows, { relationName: 'follower' }),
}));

// ============================================
// POSTS
// ============================================

export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  replyToId: uuid('reply_to_id'),
  repostOfId: uuid('repost_of_id'),
  likesCount: integer('likes_count').default(0).notNull(),
  repostsCount: integer('reposts_count').default(0).notNull(),
  repliesCount: integer('replies_count').default(0).notNull(),
  isRemoved: boolean('is_removed').default(false).notNull(),
  removedAt: timestamp('removed_at'),
  removedBy: uuid('removed_by').references(() => users.id),
  removedReason: text('removed_reason'),
  // ActivityPub
  apId: text('ap_id').unique(), // https://node.com/posts/uuid
  apUrl: text('ap_url'), // Public URL for the post
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('posts_user_id_idx').on(table.userId),
  index('posts_created_at_idx').on(table.createdAt),
  index('posts_reply_to_idx').on(table.replyToId),
  index('posts_removed_idx').on(table.isRemoved),
]);

export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.userId],
    references: [users.id],
  }),
  removedByUser: one(users, {
    fields: [posts.removedBy],
    references: [users.id],
  }),
  replyTo: one(posts, {
    fields: [posts.replyToId],
    references: [posts.id],
    relationName: 'replies',
  }),
  replies: many(posts, { relationName: 'replies' }),
  repostOf: one(posts, {
    fields: [posts.repostOfId],
    references: [posts.id],
    relationName: 'reposts',
  }),
  reposts: many(posts, { relationName: 'reposts' }),
  likes: many(likes),
  media: many(media),
}));

// ============================================
// MEDIA
// ============================================

export const media = pgTable('media', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  altText: text('alt_text'),
  mimeType: text('mime_type'),
  width: integer('width'),
  height: integer('height'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('media_user_idx').on(table.userId),
  index('media_post_idx').on(table.postId),
]);

export const mediaRelations = relations(media, ({ one }) => ({
  user: one(users, {
    fields: [media.userId],
    references: [users.id],
  }),
  post: one(posts, {
    fields: [media.postId],
    references: [posts.id],
  }),
}));

// ============================================
// FOLLOWS
// ============================================

export const follows = pgTable('follows', {
  id: uuid('id').primaryKey().defaultRandom(),
  followerId: uuid('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: uuid('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // ActivityPub
  apId: text('ap_id').unique(), // Activity ID
  pending: boolean('pending').default(false), // For follow requests
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('follows_follower_idx').on(table.followerId),
  index('follows_following_idx').on(table.followingId),
]);

export const followsRelations = relations(follows, ({ one }) => ({
  follower: one(users, {
    fields: [follows.followerId],
    references: [users.id],
    relationName: 'follower',
  }),
  following: one(users, {
    fields: [follows.followingId],
    references: [users.id],
    relationName: 'following',
  }),
}));

// ============================================
// LIKES
// ============================================

export const likes = pgTable('likes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: uuid('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  apId: text('ap_id').unique(), // Activity ID
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('likes_user_post_idx').on(table.userId, table.postId),
]);

export const likesRelations = relations(likes, ({ one }) => ({
  user: one(users, {
    fields: [likes.userId],
    references: [users.id],
  }),
  post: one(posts, {
    fields: [likes.postId],
    references: [posts.id],
  }),
}));

// ============================================
// NOTIFICATIONS
// ============================================

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  postId: uuid('post_id').references(() => posts.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // follow | like | repost | mention
  readAt: timestamp('read_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('notifications_user_idx').on(table.userId),
  index('notifications_created_idx').on(table.createdAt),
]);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: 'recipient',
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: 'actor',
  }),
  post: one(posts, {
    fields: [notifications.postId],
    references: [posts.id],
  }),
}));

// ============================================
// HANDLE REGISTRY (for federated handle resolution)
// ============================================

export const handleRegistry = pgTable('handle_registry', {
  handle: text('handle').primaryKey(), // @username
  did: text('did').notNull(),
  nodeDomain: text('node_domain').notNull(),
  registeredAt: timestamp('registered_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
  index('handle_registry_updated_idx').on(table.updatedAt),
]);

// ============================================
// SESSIONS (for auth)
// ============================================

export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('sessions_token_idx').on(table.token),
  index('sessions_user_idx').on(table.userId),
]);

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

// ============================================
// BLOCKS & MUTES (user-level moderation)
// ============================================

export const blocks = pgTable('blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedUserId: uuid('blocked_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('blocks_user_idx').on(table.userId),
]);

export const mutes = pgTable('mutes', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  mutedUserId: uuid('muted_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('mutes_user_idx').on(table.userId),
]);

// ============================================
// REPORTS (moderation)
// ============================================

export const reports = pgTable('reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
  targetType: text('target_type').notNull(), // 'post' | 'user'
  targetId: uuid('target_id').notNull(),
  reason: text('reason').notNull(),
  status: text('status').default('open').notNull(), // open | resolved
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  resolutionNote: text('resolution_note'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('reports_status_idx').on(table.status),
  index('reports_target_idx').on(table.targetType, table.targetId),
  index('reports_reporter_idx').on(table.reporterId),
]);

export const reportsRelations = relations(reports, ({ one }) => ({
  reporter: one(users, {
    fields: [reports.reporterId],
    references: [users.id],
  }),
  resolver: one(users, {
    fields: [reports.resolvedBy],
    references: [users.id],
  }),
}));
