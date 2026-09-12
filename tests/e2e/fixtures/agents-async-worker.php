<?php
/**
 * Test-only slow provider. Load as an MU plugin in the dedicated test site.
 * Never load this fixture in a development or production site.
 *
 * @package OpenStation
 */
defined( 'ABSPATH' ) || exit;
add_filter( 'openstation_agents_enabled', '__return_true' );
add_filter(
	'openstation_agent_runner_generate',
	static function ( $result, $history ) {
		foreach ( $history as $row ) {
			if ( isset( $row['text'] ) && '__openstation_async_http_smoke__' === $row['text'] ) {
				// A real network test must outlast the reported 30-second boundary.
				sleep( 35 );
				return array( 'text' => 'Slow HTTP job completed.', 'function_calls' => array(), 'message' => null );
			}
		}
		return new WP_Error( 'test_only', 'Only the smoke-test message is allowed.' );
	},
	10,
	2
);
