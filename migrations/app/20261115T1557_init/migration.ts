#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/eb282c0599702eeafd284ab83be1c1439a0569298335dbbd6691a2e6ad0ec95f/contract';
import endContract from '../../snapshots/eb282c0599702eeafd284ab83be1c1439a0569298335dbbd6691a2e6ad0ec95f/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
  sql,
} from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'accounts',
        columns: [
          col('access_token', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('expires_at', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id_token', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provider_account_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('refresh_token', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('scope', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('token_type', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'blocks',
        columns: [
          col('blocked_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('blocker_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
        ],
        constraints: [primaryKey(['blocker_id', 'blocked_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'bookmarks',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('post_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'comments',
        columns: [
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('post_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'follow_requests',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('follower_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('following_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'follows',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('follower_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('following_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['follower_id', 'following_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'group_calls',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('creator_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('group_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('is_active', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('room_url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'group_event_rsvps',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('event_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('going'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['event_id', 'user_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'group_events',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('created_by_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('group_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('location', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('starts_at', 'timestamp(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'group_invites',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('group_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('invitee_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('inviter_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('message', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'group_join_requests',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('group_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('pending'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'group_members',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('group_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('role', 'text', {
            notNull: true,
            default: lit('member'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['group_id', 'user_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'groups',
        columns: [
          col('admin_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('category', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('cover_photo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('location', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('privacy', 'text', {
            notNull: true,
            default: lit('public'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('require_approval', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('rules', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('website', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'likes',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('post_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'messages',
        columns: [
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('image_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('receiver_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('sender_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('video_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'mutes',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('muted_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('muter_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['muter_id', 'muted_id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'notifications',
        columns: [
          col('actor_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('is_read', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('message_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('post_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'poll_options',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('poll_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('position', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('text', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'poll_votes',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('option_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('poll_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'polls',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('expires_at', 'timestamp(6)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('post_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('question', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'posts',
        columns: [
          col('comments_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('content', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('external_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('group_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('image_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('kind', 'text', {
            notNull: true,
            default: lit('post'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('likes_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('privacy', 'text', {
            notNull: true,
            default: lit('public'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('repost_of_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('scheduled_at', 'timestamp(6)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('shared_profile_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('updated_at', 'timestamp(6)', {
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('video_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'profile_shares',
        columns: [
          col('channel', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('group_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('profile_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('sharer_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'reports',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('details', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('post_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('reason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('reported_user_id', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('reporter_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'sessions',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('expires', 'timestamp(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('session_token', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'stories',
        columns: [
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('expires_at', 'timestamp(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('image_url', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'users',
        columns: [
          col('account_type', 'text', {
            notNull: true,
            default: lit('person'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('age', 'int4', {
            notNull: true,
            default: lit(18),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('avatar', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('bio', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('cover_photo', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(6)', {
            notNull: true,
            default: fn(sql`now()`),
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('education', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('follow_privacy', 'text', {
            notNull: true,
            default: lit('everyone'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('gender', 'text', {
            notNull: true,
            default: lit('male'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('location', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('message_privacy', 'text', {
            notNull: true,
            default: lit('everyone'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('notify_comments', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('notify_follows', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('notify_likes', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('notify_messages', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('password', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('profile_visibility', 'text', {
            notNull: true,
            default: lit('public'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('pronouns', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('relationship_status', 'text', {
            notNull: true,
            default: lit('single'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('username', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('website', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('workplace', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'verification_tokens',
        columns: [
          col('expires', 'timestamp(6)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-date@1', typeParams: { precision: 6 } },
          }),
          col('identifier', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('token', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['identifier', 'token'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'accounts',
        index: 'accounts_provider_provider_account_id_key',
        columns: ['provider', 'provider_account_id'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'accounts',
        index: 'accounts_user_id_idx',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'follow_requests',
        index: 'follow_requests_follower_id_following_id_key',
        columns: ['follower_id', 'following_id'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'group_calls',
        index: 'group_calls_group_id_is_active_idx',
        columns: ['group_id', 'is_active'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'group_calls',
        index: 'group_calls_group_id_room_url_key',
        columns: ['group_id', 'room_url'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'group_invites',
        index: 'group_invites_group_id_invitee_id_key',
        columns: ['group_id', 'invitee_id'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'group_invites',
        index: 'group_invites_invitee_id_status_idx',
        columns: ['invitee_id', 'status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'group_join_requests',
        index: 'group_join_requests_group_id_user_id_key',
        columns: ['group_id', 'user_id'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'likes',
        index: 'likes_post_id_user_id_key',
        columns: ['post_id', 'user_id'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'posts',
        index: 'posts_external_key_key',
        columns: ['external_key'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'profile_shares',
        index: 'profile_shares_profile_id_created_at_idx',
        columns: ['profile_id', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'sessions',
        index: 'sessions_session_token_key',
        columns: ['session_token'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'sessions',
        index: 'sessions_user_id_idx',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'users',
        index: 'users_email_key',
        columns: ['email'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'users',
        index: 'users_username_key',
        columns: ['username'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'verification_tokens',
        index: 'verification_tokens_token_key',
        columns: ['token'],
        extras: { unique: true },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'accounts',
        foreignKey: {
          name: 'accounts_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'blocks',
        foreignKey: {
          name: 'blocks_blocker_id_fkey',
          columns: ['blocker_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'blocks',
        foreignKey: {
          name: 'blocks_blocked_id_fkey',
          columns: ['blocked_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'bookmarks',
        foreignKey: {
          name: 'bookmarks_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'bookmarks',
        foreignKey: {
          name: 'bookmarks_post_id_fkey',
          columns: ['post_id'],
          references: { schema: 'public', table: 'posts', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'comments',
        foreignKey: {
          name: 'comments_post_id_fkey',
          columns: ['post_id'],
          references: { schema: 'public', table: 'posts', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'comments',
        foreignKey: {
          name: 'comments_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'follow_requests',
        foreignKey: {
          name: 'follow_requests_follower_id_fkey',
          columns: ['follower_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'follow_requests',
        foreignKey: {
          name: 'follow_requests_following_id_fkey',
          columns: ['following_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'follows',
        foreignKey: {
          name: 'follows_follower_id_fkey',
          columns: ['follower_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'follows',
        foreignKey: {
          name: 'follows_following_id_fkey',
          columns: ['following_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_calls',
        foreignKey: {
          name: 'group_calls_group_id_fkey',
          columns: ['group_id'],
          references: { schema: 'public', table: 'groups', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_calls',
        foreignKey: {
          name: 'group_calls_creator_id_fkey',
          columns: ['creator_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_event_rsvps',
        foreignKey: {
          name: 'group_event_rsvps_event_id_fkey',
          columns: ['event_id'],
          references: { schema: 'public', table: 'group_events', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_event_rsvps',
        foreignKey: {
          name: 'group_event_rsvps_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_events',
        foreignKey: {
          name: 'group_events_group_id_fkey',
          columns: ['group_id'],
          references: { schema: 'public', table: 'groups', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_events',
        foreignKey: {
          name: 'group_events_created_by_id_fkey',
          columns: ['created_by_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_invites',
        foreignKey: {
          name: 'group_invites_group_id_fkey',
          columns: ['group_id'],
          references: { schema: 'public', table: 'groups', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_invites',
        foreignKey: {
          name: 'group_invites_inviter_id_fkey',
          columns: ['inviter_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_invites',
        foreignKey: {
          name: 'group_invites_invitee_id_fkey',
          columns: ['invitee_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_join_requests',
        foreignKey: {
          name: 'group_join_requests_group_id_fkey',
          columns: ['group_id'],
          references: { schema: 'public', table: 'groups', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_join_requests',
        foreignKey: {
          name: 'group_join_requests_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_members',
        foreignKey: {
          name: 'group_members_group_id_fkey',
          columns: ['group_id'],
          references: { schema: 'public', table: 'groups', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'group_members',
        foreignKey: {
          name: 'group_members_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'groups',
        foreignKey: {
          name: 'groups_admin_id_fkey',
          columns: ['admin_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'likes',
        foreignKey: {
          name: 'likes_post_id_fkey',
          columns: ['post_id'],
          references: { schema: 'public', table: 'posts', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'likes',
        foreignKey: {
          name: 'likes_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'messages',
        foreignKey: {
          name: 'messages_sender_id_fkey',
          columns: ['sender_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'messages',
        foreignKey: {
          name: 'messages_receiver_id_fkey',
          columns: ['receiver_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mutes',
        foreignKey: {
          name: 'mutes_muter_id_fkey',
          columns: ['muter_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'mutes',
        foreignKey: {
          name: 'mutes_muted_id_fkey',
          columns: ['muted_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'notifications',
        foreignKey: {
          name: 'notifications_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'notifications',
        foreignKey: {
          name: 'notifications_actor_id_fkey',
          columns: ['actor_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'notifications',
        foreignKey: {
          name: 'notifications_post_id_fkey',
          columns: ['post_id'],
          references: { schema: 'public', table: 'posts', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'notifications',
        foreignKey: {
          name: 'notifications_message_id_fkey',
          columns: ['message_id'],
          references: { schema: 'public', table: 'messages', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'poll_options',
        foreignKey: {
          name: 'poll_options_poll_id_fkey',
          columns: ['poll_id'],
          references: { schema: 'public', table: 'polls', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'poll_votes',
        foreignKey: {
          name: 'poll_votes_poll_id_fkey',
          columns: ['poll_id'],
          references: { schema: 'public', table: 'polls', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'poll_votes',
        foreignKey: {
          name: 'poll_votes_option_id_fkey',
          columns: ['option_id'],
          references: { schema: 'public', table: 'poll_options', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'poll_votes',
        foreignKey: {
          name: 'poll_votes_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'polls',
        foreignKey: {
          name: 'polls_post_id_fkey',
          columns: ['post_id'],
          references: { schema: 'public', table: 'posts', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'posts',
        foreignKey: {
          name: 'posts_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'posts',
        foreignKey: {
          name: 'posts_group_id_fkey',
          columns: ['group_id'],
          references: { schema: 'public', table: 'groups', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'posts',
        foreignKey: {
          name: 'posts_repost_of_id_fkey',
          columns: ['repost_of_id'],
          references: { schema: 'public', table: 'posts', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'posts',
        foreignKey: {
          name: 'posts_shared_profile_id_fkey',
          columns: ['shared_profile_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'profile_shares',
        foreignKey: {
          name: 'profile_shares_profile_id_fkey',
          columns: ['profile_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'profile_shares',
        foreignKey: {
          name: 'profile_shares_sharer_id_fkey',
          columns: ['sharer_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'reports',
        foreignKey: {
          name: 'reports_reporter_id_fkey',
          columns: ['reporter_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'reports',
        foreignKey: {
          name: 'reports_reported_user_id_fkey',
          columns: ['reported_user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'reports',
        foreignKey: {
          name: 'reports_post_id_fkey',
          columns: ['post_id'],
          references: { schema: 'public', table: 'posts', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'sessions',
        foreignKey: {
          name: 'sessions_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'stories',
        foreignKey: {
          name: 'stories_user_id_fkey',
          columns: ['user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
