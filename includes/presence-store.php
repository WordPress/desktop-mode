<?php
/**
 * Site-scoped presence storage and recoverable legacy-option import.
 *
 * @package OpenStation
 */
defined( 'ABSPATH' ) || exit;

/** Storage migration checkpoint; kept separate from unrelated migrations. */
const OPENSTATION_PRESENCE_STORAGE_OPTION = 'openstation_presence_storage';

/**
 * Current site's table; never use the network's base prefix for presence.
 *
 * @internal
 * @return string
 */
function openstation_presence_table() {
	global $wpdb;
	return $wpdb->prefix . 'openstation_presence';
}

/**
 * Read the legacy option directly, bypassing caches held by another worker.
 *
 * @internal
 * @return array|WP_Error Normalized records, or a failed read.
 */
function openstation_presence_legacy_records() {
	global $wpdb;
	$raw = $wpdb->get_var( $wpdb->prepare( "SELECT option_value FROM $wpdb->options WHERE option_name = %s", OPENSTATION_PRESENCE_OPTION ) );
	if ( '' !== $wpdb->last_error ) {
		return new WP_Error( 'openstation_presence_read_failed', __( 'Could not read presence.', 'desktop-mode' ) );
	}
	$raw = maybe_unserialize( $raw );
	$out = array();
	foreach ( is_array( $raw ) ? $raw : array() as $uid => $record ) {
		if ( (int) $uid <= 0 || ! is_array( $record ) ) {
			continue;
		}
		$out[ (int) $uid ] = array(
			'last_seen_ms'   => max( 0, (int) ( $record['last_seen_ms'] ?? 0 ) ),
			'last_active_ms' => max( 0, (int) ( $record['last_active_ms'] ?? 0 ) ),
		);
	}
	return $out;
}

/**
 * Merge timestamps atomically. Away is an explicit user intent, not activity.
 *
 * The private inactive_at_ms fence keeps a delayed active request from undoing
 * a later "set away" request. A genuinely newer active request clears away.
 * Ordinary inactive heartbeats pass zero activity, never a stale readback.
 *
 * @internal
 * @param int   $user_id User id.
 * @param array $record Timestamps to merge.
 * @param bool  $away Whether to set away at last_seen_ms.
 * @return bool
 */
function openstation_presence_upsert( $user_id, $record, $away = false ) {
	global $wpdb;
	$table = openstation_presence_table();
	return false !== $wpdb->query(
		$wpdb->prepare(
			"INSERT INTO $table (user_id, last_seen_ms, last_active_ms, inactive_at_ms)
			VALUES (%d, %d, %d, %d)
			ON DUPLICATE KEY UPDATE
			last_seen_ms = GREATEST(last_seen_ms, VALUES(last_seen_ms)),
			last_active_ms = GREATEST(last_active_ms, VALUES(last_active_ms)),
			inactive_at_ms = GREATEST(inactive_at_ms, VALUES(inactive_at_ms))",
			$user_id,
			$record['last_seen_ms'],
			$record['last_active_ms'],
			$away ? $record['last_seen_ms'] : 0
		)
	);
}

/**
 * Ensure storage exists and import before publishing the completed checkpoint.
 *
 * A connection lock serializes concurrent installers. Upserts and verification
 * make partial imports retryable without overwriting live timestamps. A short
 * bridge imports late writes from requests still executing the old plugin.
 * After five minutes the legacy option is retained but never read or written.
 *
 * @internal
 * @return bool Whether the table is ready for use.
 */
function openstation_presence_migrate_storage() {
	global $wpdb;
	$state = get_option( OPENSTATION_PRESENCE_STORAGE_OPTION, array() );
	if ( ! empty( $state['ready'] ) ) {
		return true;
	}
	$table = openstation_presence_table();
	$name  = 'os-presence-' . md5( $wpdb->dbname . ':' . $table );
	if ( '1' !== (string) $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 5)', $name ) ) ) {
		return false;
	}
	try {
		// A worker that waited for the lock must see the winner's checkpoint.
		wp_cache_delete( OPENSTATION_PRESENCE_STORAGE_OPTION, 'options' );
		wp_cache_delete( 'notoptions', 'options' );
		$state = get_option( OPENSTATION_PRESENCE_STORAGE_OPTION, array() );
		if ( ! empty( $state['ready'] ) ) {
			return true;
		}
		$collate = $wpdb->get_charset_collate();
		$created = $wpdb->query(
			"CREATE TABLE IF NOT EXISTS $table (
				user_id BIGINT UNSIGNED NOT NULL,
				last_seen_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
				last_active_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
				inactive_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 0,
				PRIMARY KEY (user_id),
				KEY last_seen_ms (last_seen_ms)
			) $collate"
		);
		if ( false === $created ) {
			return false;
		}
		$records = openstation_presence_legacy_records();
		if ( is_wp_error( $records ) ) {
			return false;
		}
		foreach ( $records as $uid => $record ) {
			if ( ! openstation_presence_upsert( $uid, $record, 0 === $record['last_active_ms'] ) ) {
				return false;
			}
		}
		// Verify even an empty import against all required columns.
		$rows = $wpdb->get_results( "SELECT user_id, last_seen_ms, last_active_ms, inactive_at_ms FROM $table", OBJECT_K );
		if ( '' !== $wpdb->last_error ) {
			return false;
		}
		foreach ( $records as $uid => $record ) {
			if ( ! isset( $rows[ $uid ] ) || (int) $rows[ $uid ]->last_seen_ms < $record['last_seen_ms'] || (int) $rows[ $uid ]->last_active_ms < $record['last_active_ms'] ) {
				return false;
			}
		}
		$state = array(
			'ready'           => true,
			'completed_at_ms' => (int) round( microtime( true ) * 1000 ),
		);
		update_option( OPENSTATION_PRESENCE_STORAGE_OPTION, $state, false );
		return get_option( OPENSTATION_PRESENCE_STORAGE_OPTION ) === $state;
	} finally {
		$wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $name ) );
	}
}

/**
 * Import late legacy heartbeats during the bounded deployment bridge.
 *
 * @internal
 * @return void
 */
function openstation_presence_migration_tick() {
	if ( ! openstation_presence_migrate_storage() ) {
		return;
	}
	$state = get_option( OPENSTATION_PRESENCE_STORAGE_OPTION, array() );
	$cut   = (int) ( $state['completed_at_ms'] ?? 0 );
	$now   = (int) round( microtime( true ) * 1000 );
	if ( $cut <= 0 || $now - $cut > 5 * MINUTE_IN_SECONDS * 1000 ) {
		return;
	}
	$records = openstation_presence_legacy_records();
	if ( is_wp_error( $records ) ) {
		return;
	}
	foreach ( $records as $uid => $record ) {
		if ( $record['last_seen_ms'] > $cut ) {
			openstation_presence_upsert( $uid, $record, 0 === $record['last_active_ms'] );
		}
	}
}

/**
 * Read one or all records, retaining the public two-timestamp shape.
 *
 * @internal
 * @param int|null $user_id Restrict to one user, or null for all.
 * @return array|WP_Error Map keyed by user id.
 */
function openstation_presence_read_records( $user_id = null ) {
	global $wpdb;
	if ( ! openstation_presence_migrate_storage() ) {
		$records = openstation_presence_legacy_records();
		if ( is_wp_error( $records ) || null === $user_id ) {
			return $records;
		}
		return isset( $records[ $user_id ] ) ? array( $user_id => $records[ $user_id ] ) : array();
	}
	$table = openstation_presence_table();
	$sql   = "SELECT user_id, last_seen_ms, last_active_ms, inactive_at_ms FROM $table";
	if ( null !== $user_id ) {
		$sql .= $wpdb->prepare( ' WHERE user_id = %d', $user_id );
	}
	// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared -- Table is internal; the optional user predicate is prepared above.
	$rows = $wpdb->get_results( $sql, ARRAY_A );
	if ( '' !== $wpdb->last_error ) {
		return new WP_Error( 'openstation_presence_read_failed', __( 'Could not read presence.', 'desktop-mode' ) );
	}
	$out = array();
	foreach ( $rows as $row ) {
		$out[ (int) $row['user_id'] ] = array(
			'last_seen_ms'   => (int) $row['last_seen_ms'],
			'last_active_ms' => (int) $row['last_active_ms'] > (int) $row['inactive_at_ms'] ? (int) $row['last_active_ms'] : 0,
		);
	}
	return $out;
}

/**
 * Persist one heartbeat, falling back only when storage cannot be installed.
 *
 * @internal
 * @param int   $user_id User id.
 * @param array $record Fresh timestamps (zero activity for an idle heartbeat).
 * @param bool  $away Explicit away intent.
 * @return bool
 */
function openstation_presence_write_record( $user_id, $record, $away = false ) {
	if ( openstation_presence_migrate_storage() ) {
		return openstation_presence_upsert( $user_id, $record, $away );
	}
	$all = openstation_presence_legacy_records();
	if ( is_wp_error( $all ) ) {
		return false;
	}
	$prev            = $all[ $user_id ] ?? array(
		'last_seen_ms'   => 0,
		'last_active_ms' => 0,
	);
	$all[ $user_id ] = array(
		'last_seen_ms'   => max( $prev['last_seen_ms'], $record['last_seen_ms'] ),
		'last_active_ms' => $away ? 0 : max( $prev['last_active_ms'], $record['last_active_ms'] ),
	);
	return update_option( OPENSTATION_PRESENCE_OPTION, $all, false ) || get_option( OPENSTATION_PRESENCE_OPTION ) === $all;
}
