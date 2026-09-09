<?php
/**
 * Failure-safe reconciliation of stored rows and upload bytes.
 *
 * @package OpenStation
 */
defined( 'ABSPATH' ) || exit;

/**
 * Serialize upload registration, placement creation and each cleanup candidate.
 *
 * Connection-scoped MySQL locks work without committing a caller's transaction.
 * The name includes the database and site prefix; unrelated sites never wait.
 * Nested calls on this connection are balanced by MySQL's lock reference count.
 * No filesystem traversal is performed while the lock is held.
 *
 * @internal
 * @param callable $callback Operation to protect.
 * @return mixed|WP_Error Callback result, or a retryable lock error.
 */
function openstation_stored_files_locked( $callback ) {
	global $wpdb;
	$name = 'os-files-' . md5( $wpdb->dbname . ':' . $wpdb->prefix );
	$lock = $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 5)', $name ) );
	if ( '1' !== (string) $lock ) {
		return new WP_Error( 'openstation_storage_busy', __( 'File storage is busy. Please try again.', 'desktop-mode' ), array( 'status' => 503 ) );
	}
	try {
		return $callback();
	} finally {
		$wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $name ) );
	}
}

/**
 * Report an aborted sweep without exposing SQL or filesystem paths.
 *
 * @internal
 * @param string $stage Failed operation.
 * @return void
 */
function openstation_stored_files_reconcile_failed( $stage ) {
	/**
	 * Fires when reconciliation stops because its safety checks failed.
	 *
	 * @param WP_Error $error Error whose data contains the failing stage.
	 */
	do_action(
		'openstation_stored_files_reconcile_failed',
		new WP_Error( 'openstation_reconcile_failed', __( 'File cleanup was stopped safely.', 'desktop-mode' ), array( 'stage' => $stage ) )
	);
}

/**
 * Remove one old placement-less row, rechecking under the upload writer lock.
 *
 * Delete the database row before bytes. A failed DELETE leaves bytes untouched;
 * a failed unlink leaves row-less bytes for a later sweep. Trashed placements
 * count as references, so cleanup never consumes the recycle bin's files.
 *
 * @internal
 * @param int $id Candidate id.
 * @param int $cutoff_ms Oldest retained creation timestamp.
 * @return bool Whether the check and any required deletion succeeded.
 */
function openstation_stored_files_reconcile_row( $id, $cutoff_ms ) {
	global $wpdb;
	$tables = openstation_files_table_names();
	$row    = $wpdb->get_row(
		$wpdb->prepare(
			"SELECT sf.* FROM {$tables['stored_files']} sf
			WHERE sf.id = %d AND sf.created_at_ms < %d
			AND NOT EXISTS (SELECT 1 FROM {$tables['placements']} p
				WHERE p.file_type = 'upload' AND p.file_ref = CAST(sf.id AS CHAR))",
			$id,
			$cutoff_ms
		),
		ARRAY_A
	);
	if ( '' !== $wpdb->last_error ) {
		return false;
	}
	if ( ! $row ) {
		return true;
	}
	$deleted = $wpdb->query(
		$wpdb->prepare(
			"DELETE sf FROM {$tables['stored_files']} sf
			WHERE sf.id = %d AND sf.created_at_ms < %d
			AND NOT EXISTS (SELECT 1 FROM {$tables['placements']} p
				WHERE p.file_type = 'upload' AND p.file_ref = CAST(sf.id AS CHAR))",
			$id,
			$cutoff_ms
		)
	);
	if ( false === $deleted ) {
		return false;
	}
	if ( 1 === $deleted ) {
		$row  = openstation_stored_files_normalize_row( $row );
		$path = openstation_stored_file_path( $row );
		if ( $path && is_file( $path ) ) {
			wp_delete_file( $path );
			if ( is_file( $path ) ) {
				return false;
			}
		}
		/** This action is documented in includes/desktop-files/stored-files-store.php. */
		do_action( 'openstation_stored_file_deleted', (int) $row['id'], $row );
	}
	return true;
}

/**
 * Revalidate one row-less disk file against current DB state before unlinking.
 *
 * @internal
 * @param int    $owner_id Owner directory.
 * @param string $entry Candidate path.
 * @param int    $cutoff Unix seconds cutoff.
 * @return bool Whether the check succeeded.
 */
function openstation_stored_files_reconcile_bytes( $owner_id, $entry, $cutoff ) {
	global $wpdb;
	$tables = openstation_files_table_names();
	// A locking read sees current committed rows even inside a caller's
	// REPEATABLE READ transaction, rather than an earlier empty snapshot.
	// Engines that reject the changed snapshot take the failure path below.
	$known = $wpdb->get_var(
		$wpdb->prepare(
			"SELECT id FROM {$tables['stored_files']} WHERE owner_id = %d AND disk_name = %s LIMIT 1 FOR UPDATE",
			$owner_id,
			basename( $entry )
		)
	);
	if ( '' !== $wpdb->last_error ) {
		return false;
	}
	clearstatcache( true, $entry );
	if ( null === $known && is_file( $entry ) && ! is_link( $entry ) ) {
		$mtime = filemtime( $entry );
		if ( false !== $mtime && $mtime > 0 && $mtime < $cutoff ) {
			wp_delete_file( $entry );
			return ! is_file( $entry );
		}
	}
	return true;
}

/**
 * Daily reconciliation. Any failed lookup aborts the remaining sweep.
 *
 * The one-day grace period protects uploads between their filesystem move and
 * row insertion. Missing bytes retain their row, allowing manual recovery.
 *
 * @return void
 */
function openstation_stored_files_reconcile() {
	global $wpdb;
	$tables    = openstation_files_table_names();
	$cutoff_ms = openstation_files_now_ms() - DAY_IN_SECONDS * 1000;
	$orphans   = $wpdb->get_col(
		$wpdb->prepare(
			"SELECT sf.id FROM {$tables['stored_files']} sf
			LEFT JOIN {$tables['placements']} p ON p.file_type = 'upload' AND p.file_ref = CAST(sf.id AS CHAR)
			WHERE p.id IS NULL AND sf.created_at_ms < %d",
			$cutoff_ms
		)
	);
	if ( '' !== $wpdb->last_error ) {
		openstation_stored_files_reconcile_failed( 'orphan_rows' );
		return;
	}
	foreach ( $orphans as $id ) {
		$result = openstation_stored_files_locked(
			static function () use ( $id, $cutoff_ms ) {
				return openstation_stored_files_reconcile_row( (int) $id, $cutoff_ms );
			}
		);
		if ( true !== $result ) {
			openstation_stored_files_reconcile_failed( 'delete_row' );
			return;
		}
	}

	$base = openstation_stored_files_dir();
	if ( ! is_dir( $base ) || is_link( $base ) ) {
		return;
	}
	foreach ( (array) glob( $base . '/*', GLOB_ONLYDIR ) as $user_dir ) {
		$owner_id = (int) basename( $user_dir );
		if ( $owner_id <= 0 || basename( $user_dir ) !== (string) $owner_id || is_link( $user_dir ) ) {
			continue;
		}
		$known = $wpdb->get_col( $wpdb->prepare( "SELECT disk_name FROM {$tables['stored_files']} WHERE owner_id = %d", $owner_id ) );
		if ( '' !== $wpdb->last_error ) {
			openstation_stored_files_reconcile_failed( 'known_bytes' );
			return;
		}
		$known_set = array_fill_keys( $known, true );
		foreach ( (array) glob( $user_dir . '/*' ) as $entry ) {
			if ( isset( $known_set[ basename( $entry ) ] ) || ! openstation_stored_files_valid_disk_name( basename( $entry ) ) ) {
				continue;
			}
			$result = openstation_stored_files_locked(
				static function () use ( $owner_id, $entry ) {
					return openstation_stored_files_reconcile_bytes( $owner_id, $entry, time() - DAY_IN_SECONDS );
				}
			);
			if ( true !== $result ) {
				openstation_stored_files_reconcile_failed( 'delete_bytes' );
				return;
			}
		}
	}
}
add_action( 'desktop_mode_files_daily_prune', 'openstation_stored_files_reconcile' );
