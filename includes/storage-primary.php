<?php
/**
 * Primary routing for storage operations that depend on current database state.
 *
 * @package OpenStation
 */
defined( 'ABSPATH' ) || exit;

/**
 * Keep advisory locks and their protected reads on writable connections.
 *
 * HyperDB classifies SELECT GET_LOCK and SELECT FOR UPDATE as reads. Use its
 * supported routing API before acquiring the lock; LudicrousDB has a renamed
 * equivalent. Keep this routing for the request so release and readbacks cannot
 * move to a lagging replica. Standard wpdb already uses one connection.
 *
 * @internal
 * @return void
 */
function openstation_storage_use_primary() {
	global $wpdb;
	if ( is_callable( array( $wpdb, 'send_reads_to_primaries' ) ) ) {
		$wpdb->send_reads_to_primaries();
	} elseif ( is_callable( array( $wpdb, 'send_reads_to_masters' ) ) ) {
		$wpdb->send_reads_to_masters();
	}
}
