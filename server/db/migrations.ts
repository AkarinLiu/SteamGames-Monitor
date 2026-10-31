import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  version: number
  name: string
  up: (db: DatabaseSync) => void
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    up(db) {
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL COLLATE NOCASE UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
          region TEXT,
          language TEXT,
          timezone TEXT,
          poll_interval_seconds INTEGER NOT NULL DEFAULT 3600,
          min_discount_percent INTEGER NOT NULL DEFAULT 20,
          news_enabled INTEGER NOT NULL DEFAULT 1,
          news_keywords_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(news_keywords_json)),
          news_match_mode TEXT NOT NULL DEFAULT 'title' CHECK (news_match_mode IN ('title', 'any')),
          must_change_password INTEGER NOT NULL DEFAULT 1,
          max_monitors INTEGER NOT NULL DEFAULT 200,
          onboarded_at INTEGER,
          last_login_at INTEGER,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        CREATE TABLE sessions (
          token_hash TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          last_seen_at INTEGER NOT NULL,
          ip TEXT,
          user_agent TEXT
        );
        CREATE INDEX idx_sessions_user ON sessions(user_id);
        CREATE INDEX idx_sessions_expires ON sessions(expires_at);

        CREATE TABLE audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          target TEXT,
          detail_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(detail_json)),
          ip TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_audit_created ON audit_logs(created_at);
        CREATE INDEX idx_audit_actor ON audit_logs(actor_user_id, created_at);

        CREATE TABLE monitors (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          appid INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('game', 'dlc')),
          parent_appid INTEGER,
          name TEXT NOT NULL,
          store_url TEXT NOT NULL,
          header_image TEXT,
          region TEXT NOT NULL,
          language TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          deleted_at INTEGER,
          notes TEXT,
          min_discount_percent INTEGER,
          news_watch INTEGER NOT NULL DEFAULT 1,
          baseline_pending INTEGER NOT NULL DEFAULT 1,
          availability TEXT NOT NULL DEFAULT 'unknown' CHECK (availability IN ('available', 'unavailable', 'unknown')),
          ever_available INTEGER NOT NULL DEFAULT 0,
          release_status TEXT NOT NULL DEFAULT 'unknown' CHECK (release_status IN ('coming_soon', 'released', 'unknown')),
          release_date_text TEXT,
          currency TEXT,
          price_initial_raw INTEGER,
          price_final_raw INTEGER,
          price_initial_formatted TEXT,
          price_final_formatted TEXT,
          discount_percent INTEGER NOT NULL DEFAULT 0,
          is_free INTEGER NOT NULL DEFAULT 0,
          sale_started_at INTEGER,
          unavailable_since INTEGER,
          delisted_notified_at INTEGER,
          next_check_at INTEGER NOT NULL,
          next_news_check_at INTEGER,
          last_check_at INTEGER,
          last_success_at INTEGER,
          consecutive_failures INTEGER NOT NULL DEFAULT 0,
          consecutive_unavailable INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          UNIQUE (user_id, appid)
        );
        CREATE INDEX idx_monitors_due ON monitors(enabled, deleted_at, next_check_at);
        CREATE INDEX idx_monitors_user ON monitors(user_id, deleted_at, created_at);
        CREATE INDEX idx_monitors_app ON monitors(appid, region, language);
        CREATE INDEX idx_monitors_news_due ON monitors(news_watch, deleted_at, next_news_check_at);

        CREATE TABLE snapshots (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL,
          checked_at INTEGER NOT NULL,
          region TEXT NOT NULL,
          availability TEXT NOT NULL CHECK (availability IN ('available', 'unavailable', 'unknown')),
          currency TEXT,
          price_initial_raw INTEGER,
          price_final_raw INTEGER,
          price_initial_formatted TEXT,
          price_final_formatted TEXT,
          discount_percent INTEGER NOT NULL DEFAULT 0,
          is_free INTEGER NOT NULL DEFAULT 0,
          release_status TEXT NOT NULL DEFAULT 'unknown' CHECK (release_status IN ('coming_soon', 'released', 'unknown')),
          suppressed INTEGER NOT NULL DEFAULT 0,
          error_code TEXT,
          http_status INTEGER,
          duration_ms INTEGER
        );
        CREATE INDEX idx_snapshots_monitor ON snapshots(monitor_id, checked_at DESC);
        CREATE INDEX idx_snapshots_checked ON snapshots(checked_at);

        CREATE TABLE events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('release', 'sale_start', 'sale_change', 'sale_end', 'price_change', 'delisting_warning', 'delisted', 'restored', 'check_error')),
          severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
          payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
          dedupe_key TEXT NOT NULL UNIQUE,
          source TEXT NOT NULL DEFAULT 'steam',
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_events_user ON events(user_id, created_at DESC);
        CREATE INDEX idx_events_monitor ON events(monitor_id, created_at DESC);
        CREATE INDEX idx_events_type ON events(type, created_at DESC);
        CREATE INDEX idx_events_created ON events(created_at);

        CREATE TABLE notification_channels (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('wecom_bot', 'feishu_bot', 'dingtalk_bot', 'smtp')),
          enabled INTEGER NOT NULL DEFAULT 1,
          event_types_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(event_types_json)),
          config_enc TEXT NOT NULL,
          key_version INTEGER NOT NULL DEFAULT 1,
          last_test_at INTEGER,
          last_test_ok INTEGER,
          last_test_error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_channels_user ON notification_channels(user_id);

        CREATE TABLE bot_apps (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          platform TEXT NOT NULL CHECK (platform IN ('feishu', 'dingtalk', 'wecom')),
          name TEXT NOT NULL,
          webhook_slug TEXT NOT NULL UNIQUE,
          enabled INTEGER NOT NULL DEFAULT 1,
          config_enc TEXT NOT NULL,
          key_version INTEGER NOT NULL DEFAULT 1,
          api_base_url TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX idx_bot_apps_user ON bot_apps(user_id);
        CREATE UNIQUE INDEX idx_bot_apps_enabled ON bot_apps(user_id, platform) WHERE enabled = 1;

        CREATE TABLE bot_allowlist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          bot_app_id INTEGER NOT NULL REFERENCES bot_apps(id) ON DELETE CASCADE,
          platform_user_id TEXT NOT NULL,
          display_name TEXT,
          role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
          created_at INTEGER NOT NULL,
          UNIQUE (bot_app_id, platform_user_id)
        );
        CREATE INDEX idx_allowlist_bot ON bot_allowlist(bot_app_id);

        CREATE TABLE command_contexts (
          bot_app_id INTEGER NOT NULL REFERENCES bot_apps(id) ON DELETE CASCADE,
          platform TEXT NOT NULL,
          chat_id TEXT NOT NULL,
          platform_user_id TEXT NOT NULL,
          kind TEXT NOT NULL,
          payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          PRIMARY KEY (bot_app_id, platform_user_id, chat_id)
        );
        CREATE INDEX idx_command_contexts_expires ON command_contexts(expires_at);

        CREATE TABLE inbound_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT NOT NULL,
          platform_message_id TEXT NOT NULL,
          bot_app_id INTEGER REFERENCES bot_apps(id) ON DELETE SET NULL,
          owner_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          chat_id TEXT,
          user_id TEXT,
          text TEXT,
          status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'processed', 'failed', 'ignored')),
          error TEXT,
          received_at INTEGER NOT NULL,
          processed_at INTEGER,
          reply_delivery_id INTEGER,
          UNIQUE (platform, platform_message_id)
        );
        CREATE INDEX idx_inbound_owner ON inbound_messages(owner_user_id, received_at DESC);
        CREATE INDEX idx_inbound_received ON inbound_messages(received_at);

        CREATE TABLE command_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
          platform TEXT NOT NULL,
          platform_user_id TEXT NOT NULL,
          chat_id TEXT,
          command TEXT NOT NULL,
          args_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(args_json)),
          result TEXT NOT NULL CHECK (result IN ('ok', 'error', 'denied', 'throttled', 'parse_error')),
          error TEXT,
          duration_ms INTEGER,
          created_at INTEGER NOT NULL
        );
        CREATE INDEX idx_command_logs_owner ON command_logs(owner_user_id, created_at DESC);
        CREATE INDEX idx_command_logs_created ON command_logs(created_at);

        CREATE TABLE deliveries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('event', 'command', 'test')),
          event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
          channel_id INTEGER REFERENCES notification_channels(id) ON DELETE SET NULL,
          bot_app_id INTEGER REFERENCES bot_apps(id) ON DELETE SET NULL,
          target_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(target_json)),
          payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'canceled')),
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 6,
          next_attempt_at INTEGER,
          locked_until INTEGER,
          last_error TEXT,
          last_http_status INTEGER,
          created_at INTEGER NOT NULL,
          sent_at INTEGER
        );
        CREATE UNIQUE INDEX idx_deliveries_event_channel ON deliveries(event_id, channel_id)
          WHERE kind = 'event' AND event_id IS NOT NULL AND channel_id IS NOT NULL;
        CREATE INDEX idx_deliveries_due ON deliveries(status, next_attempt_at);
        CREATE INDEX idx_deliveries_user ON deliveries(user_id, created_at DESC);
        CREATE INDEX idx_deliveries_channel ON deliveries(channel_id);
        CREATE INDEX idx_deliveries_created ON deliveries(created_at);

        CREATE TABLE news_seen (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
          gid TEXT NOT NULL,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          published_at INTEGER,
          matched_keyword TEXT,
          event_id INTEGER REFERENCES events(id) ON DELETE SET NULL,
          seen_at INTEGER NOT NULL,
          UNIQUE (monitor_id, gid)
        );
        CREATE INDEX idx_news_seen_monitor ON news_seen(monitor_id, seen_at);
        CREATE INDEX idx_news_seen_created ON news_seen(seen_at);

        CREATE TABLE steam_cache (
          appid INTEGER NOT NULL,
          region TEXT NOT NULL,
          language TEXT NOT NULL,
          normalized_json TEXT NOT NULL CHECK (json_valid(normalized_json)),
          raw_hash TEXT,
          fetched_at INTEGER NOT NULL,
          PRIMARY KEY (appid, region, language)
        );
        CREATE INDEX idx_steam_cache_fetched ON steam_cache(fetched_at);

        CREATE TABLE news_cache (
          appid INTEGER PRIMARY KEY,
          payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
          fetched_at INTEGER NOT NULL
        );
        CREATE INDEX idx_news_cache_fetched ON news_cache(fetched_at);

        CREATE TABLE settings (
          key TEXT PRIMARY KEY,
          value_json TEXT NOT NULL CHECK (json_valid(value_json)),
          updated_at INTEGER NOT NULL
        );
      `)
    },
  },
  {
    version: 2,
    name: 'bot event notifications',
    up(db) {
      db.exec(`
        ALTER TABLE bot_apps ADD COLUMN notify_enabled INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE bot_apps ADD COLUMN last_chat_id TEXT;
        ALTER TABLE bot_apps ADD COLUMN last_chat_at INTEGER;

        CREATE INDEX idx_bot_apps_notify ON bot_apps(user_id) WHERE notify_enabled = 1;

        CREATE UNIQUE INDEX idx_deliveries_event_bot ON deliveries(event_id, bot_app_id)
          WHERE kind = 'event' AND event_id IS NOT NULL AND bot_app_id IS NOT NULL;
      `)
    },
  },
  {
    version: 3,
    name: 'openclaw bots replace native platform bots',
    up(db) {
      db.exec(`
        CREATE TABLE bot_apps_openclaw (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          platform TEXT NOT NULL CHECK (platform IN ('openclaw')),
          name TEXT NOT NULL,
          webhook_slug TEXT NOT NULL UNIQUE,
          enabled INTEGER NOT NULL DEFAULT 1,
          notify_enabled INTEGER NOT NULL DEFAULT 0,
          last_channel TEXT,
          last_chat_id TEXT,
          last_chat_at INTEGER,
          config_enc TEXT NOT NULL,
          key_version INTEGER NOT NULL DEFAULT 1,
          api_base_url TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        UPDATE deliveries SET bot_app_id = NULL
          WHERE bot_app_id IN (SELECT id FROM bot_apps WHERE platform != 'openclaw');
        UPDATE inbound_messages SET bot_app_id = NULL
          WHERE bot_app_id IN (SELECT id FROM bot_apps WHERE platform != 'openclaw');
        DELETE FROM bot_allowlist
          WHERE bot_app_id IN (SELECT id FROM bot_apps WHERE platform != 'openclaw');
        DELETE FROM bot_apps WHERE platform != 'openclaw';

        INSERT INTO bot_apps_openclaw
          (id, user_id, platform, name, webhook_slug, enabled, notify_enabled,
           last_channel, last_chat_id, last_chat_at, config_enc, key_version,
           api_base_url, created_at, updated_at)
        SELECT id, user_id, 'openclaw', name, webhook_slug, enabled, notify_enabled,
               NULL, NULL, NULL, config_enc, key_version, api_base_url, created_at, updated_at
        FROM bot_apps;

        DROP TABLE bot_apps;
        ALTER TABLE bot_apps_openclaw RENAME TO bot_apps;

        CREATE INDEX idx_bot_apps_user ON bot_apps(user_id);
        CREATE UNIQUE INDEX idx_bot_apps_enabled ON bot_apps(user_id, platform) WHERE enabled = 1;
        CREATE INDEX idx_bot_apps_notify ON bot_apps(user_id) WHERE notify_enabled = 1;
      `)
    },
  },
  {
    version: 4,
    name: 'restore native bot platforms',
    up(db) {
      db.exec(`
        CREATE TABLE bot_apps_native (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          platform TEXT NOT NULL CHECK (platform IN ('feishu', 'dingtalk', 'wecom')),
          name TEXT NOT NULL,
          webhook_slug TEXT NOT NULL UNIQUE,
          enabled INTEGER NOT NULL DEFAULT 1,
          notify_enabled INTEGER NOT NULL DEFAULT 0,
          last_channel TEXT,
          last_chat_id TEXT,
          last_chat_at INTEGER,
          config_enc TEXT NOT NULL,
          key_version INTEGER NOT NULL DEFAULT 1,
          api_base_url TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        DELETE FROM bot_apps WHERE platform NOT IN ('feishu', 'dingtalk', 'wecom');

        INSERT INTO bot_apps_native
          (id, user_id, platform, name, webhook_slug, enabled, notify_enabled,
           last_channel, last_chat_id, last_chat_at, config_enc, key_version,
           api_base_url, created_at, updated_at)
        SELECT id, user_id, platform, name, webhook_slug, enabled, notify_enabled,
               NULL, NULL, NULL, config_enc, key_version, api_base_url, created_at, updated_at
        FROM bot_apps;

        DROP TABLE bot_apps;
        ALTER TABLE bot_apps_native RENAME TO bot_apps;

        CREATE INDEX idx_bot_apps_user ON bot_apps(user_id);
        CREATE UNIQUE INDEX idx_bot_apps_enabled ON bot_apps(user_id, platform) WHERE enabled = 1;
        CREATE INDEX idx_bot_apps_notify ON bot_apps(user_id) WHERE notify_enabled = 1;
      `)
    },
  },
  {
    version: 5,
    name: 'bot web authorization requests',
    up(db) {
      db.exec(`
        CREATE TABLE bot_auth_requests (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          token_hash TEXT NOT NULL UNIQUE,
          bot_app_id INTEGER NOT NULL REFERENCES bot_apps(id) ON DELETE CASCADE,
          owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          platform TEXT NOT NULL CHECK (platform IN ('feishu', 'dingtalk', 'wecom')),
          platform_user_id TEXT NOT NULL,
          platform_user_name TEXT,
          chat_id TEXT,
          role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer', 'admin')),
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
          created_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          resolved_at INTEGER,
          resolved_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE INDEX idx_bot_auth_requests_lookup
          ON bot_auth_requests(bot_app_id, platform_user_id, status);
        CREATE INDEX idx_bot_auth_requests_expires
          ON bot_auth_requests(expires_at);
      `)
    },
  },
  {
    version: 6,
    name: 'custom webhook notification channel',
    up(db) {
      db.exec(`
        CREATE TABLE notification_channels_webhook (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('wecom_bot', 'feishu_bot', 'dingtalk_bot', 'webhook', 'smtp')),
          enabled INTEGER NOT NULL DEFAULT 1,
          event_types_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(event_types_json)),
          config_enc TEXT NOT NULL,
          key_version INTEGER NOT NULL DEFAULT 1,
          last_test_at INTEGER,
          last_test_ok INTEGER,
          last_test_error TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );

        INSERT INTO notification_channels_webhook
          (id, user_id, name, type, enabled, event_types_json, config_enc, key_version,
           last_test_at, last_test_ok, last_test_error, created_at, updated_at)
        SELECT id, user_id, name, type, enabled, event_types_json, config_enc, key_version,
               last_test_at, last_test_ok, last_test_error, created_at, updated_at
        FROM notification_channels;

        DROP TABLE notification_channels;
        ALTER TABLE notification_channels_webhook RENAME TO notification_channels;

        CREATE INDEX idx_channels_user ON notification_channels(user_id);
      `)
    },
  },
  {
    version: 7,
    name: 'delisting warning status',
    up(db) {
      db.exec(`
        ALTER TABLE monitors ADD COLUMN delisting_warning_at INTEGER;

        UPDATE monitors
        SET delisting_warning_at = (
          SELECT MAX(e.created_at) FROM events e
          WHERE e.monitor_id = monitors.id AND e.type = 'delisting_warning'
        )
        WHERE availability <> 'unavailable'
          AND EXISTS (
            SELECT 1 FROM events e
            WHERE e.monitor_id = monitors.id AND e.type = 'delisting_warning'
          )
          AND NOT EXISTS (
            SELECT 1 FROM events r
            WHERE r.monitor_id = monitors.id AND r.type = 'restored'
              AND r.created_at > (
                SELECT MAX(e.created_at) FROM events e
                WHERE e.monitor_id = monitors.id AND e.type = 'delisting_warning'
              )
          );
      `)
    },
  },
  {
    version: 8,
    name: 'per-user UI locale',
    up(db) {
      db.exec(`ALTER TABLE users ADD COLUMN ui_locale TEXT NOT NULL DEFAULT 'zh-CN';`)
    },
  },
  {
    version: 9,
    name: 'release date event',
    up(db) {
      db.exec(`
        CREATE TABLE events_release_date (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          monitor_id INTEGER NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
          user_id INTEGER NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('release', 'release_date', 'sale_start', 'sale_change', 'sale_end', 'price_change', 'delisting_warning', 'delisted', 'restored', 'check_error')),
          severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
          payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
          dedupe_key TEXT NOT NULL UNIQUE,
          source TEXT NOT NULL DEFAULT 'steam',
          created_at INTEGER NOT NULL
        );

        INSERT INTO events_release_date
          (id, monitor_id, user_id, type, severity, payload_json, dedupe_key, source, created_at)
        SELECT id, monitor_id, user_id, type, severity, payload_json, dedupe_key, source, created_at
        FROM events;

        DROP TABLE events;
        ALTER TABLE events_release_date RENAME TO events;

        CREATE INDEX idx_events_user ON events(user_id, created_at DESC);
        CREATE INDEX idx_events_monitor ON events(monitor_id, created_at DESC);
        CREATE INDEX idx_events_type ON events(type, created_at DESC);
        CREATE INDEX idx_events_created ON events(created_at);
      `)
    },
  },
]
