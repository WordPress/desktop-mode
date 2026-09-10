# Presence storage migration

**Public APIs: Stable.** Presence helpers, filters, actions, REST/Heartbeat payloads
and epoch-millisecond units keep their existing shapes. Integrations should call
the helpers rather than read or write the old option directly.

The current site's `openstation_presence` table replaces the shared
`_desktop_mode_presence` option. Existing keys, tables and timestamp formats in
other features are unchanged. The table has one primary-keyed row per user, an
index on `last_seen_ms`, and an internal away-intent timestamp so delayed activity
cannot undo a later explicit "set away" request.

## Upgrade

Creation and import use a site/database-scoped connection lock on MySQL/MariaDB.
SQLite provides a compatibility no-op; the import remains idempotent. Imports
merge timestamps without lowering newer destination values. The non-autoloaded
`openstation_presence_storage` option records `ready`, `completed_at_ms` and `legacy_digest` only
after verification succeeds. Failed creation, reads, imports or verification
leave migration pending and retryable on the next request. Setup failures are
memoized for the current request; lock attempts do not wait. If installation is unavailable, helpers
retain the legacy read/write path; that temporary fallback retains the original
shared-row contention until setup succeeds. Pruning skips work while setup fails.
An established table's write failure returns failure rather than dual-writing.

For five minutes after cutover, admin, Heartbeat and presence REST requests import
legacy records whose heartbeat
is newer than the cutover timestamp. This bridges requests that started on the
old code. A digest skips unchanged legacy maps. Initial import preserves away
state, but late legacy zero-activity records never override newer activity: an old
idle heartbeat cannot be distinguished from an explicit away request. Deployments
must finish replacing old workers within this interval; a worker running older
code beyond it can have a presence update ignored until the user's next current
heartbeat. New code never dual-writes after successful migration.

The legacy option remains untouched for recovery. Once the bridge closes it is
no longer consulted. Retained data can include old user timestamps; it is not a
live presence feed. Daily pruning applies to the new table only.

## Rollback and recovery

Back up the database before upgrading and test the upgrade on a populated clone.
Rolling back code reads the retained legacy option again. Presence may look stale
or offline until fresh heartbeats arrive; uploaded files, desktop content and
other settings are unaffected. Do not drop the new table merely to roll back.

After a rollback that lasted beyond the five-minute bridge, before upgrading
again, delete only the `openstation_presence_storage` checkpoint for each affected
site using the WordPress Options API. This reruns the idempotent import against the
retained table and starts a new bridge. Do not reset the general migration version
or rename `_desktop_mode_presence`.

Multisite migrates each site's records separately as it is accessed. Removing a
subsite includes its presence table in the existing Core table-cleanup integration.
No uninstall policy is changed by this migration.

Schema changes require a versioned schema migration before changing the ready-check
or required columns. The current checkpoint describes only this initial table shape;
`CREATE TABLE IF NOT EXISTS` is not an alteration mechanism.
