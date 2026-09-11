<?php
/**
 * Brand Studio: background proposals and owner-only status reads.
 *
 * Non-autoloaded options survive cache eviction. WP-Cron and the optional
 * post-response FPM worker compete for an atomic, permanent execution claim:
 * a terminated worker must never repeat a paid provider request.
 *
 * @package OpenStation
 */

defined( 'ABSPATH' ) || exit;

/** Maximum elapsed time before an abandoned job is reported as interrupted. */
const OPENSTATION_BRAND_AI_JOB_LIFETIME = 10 * MINUTE_IN_SECONDS;

/**
 * Register the lightweight status route.
 *
 * @access private
 */
function openstation_brand_ai_register_job_routes() {
	register_rest_route(
		'desktop-mode/v1',
		'/brand-studio/jobs/(?P<job>[a-f0-9-]{36})',
		array(
			'methods'             => WP_REST_Server::READABLE,
			'permission_callback' => 'openstation_brand_ai_permission',
			'callback'            => 'openstation_brand_ai_rest_job',
		)
	);
}
add_action( 'rest_api_init', 'openstation_brand_ai_register_job_routes' );

/**
 * Read a job, returning null for missing or malformed identifiers.
 *
 * @access private
 * @param string $id Job UUID.
 * @return array|null
 */
function openstation_brand_ai_job_get( $id ) {
	if ( ! is_string( $id ) || ! wp_is_uuid( $id ) ) {
		return null;
	}
	$job = get_option( 'openstation_brand_ai_job_' . $id );
	return is_array( $job ) ? $job : null;
}

/**
 * Insert without overwriting a concurrent winner (add_option uses an upsert).
 *
 * @access private
 * @param string $key   Option name.
 * @param mixed  $value Option value.
 * @return bool Whether this request inserted the row.
 */
function openstation_brand_ai_job_insert( $key, $value ) {
	global $wpdb;
	$inserted = $wpdb->query( $wpdb->prepare( "INSERT IGNORE INTO {$wpdb->options} (option_name, option_value, autoload) VALUES (%s, %s, 'no')", $key, maybe_serialize( $value ) ) );
	wp_cache_delete( $key, 'options' );
	wp_cache_delete( 'notoptions', 'options' );
	return 1 === $inserted;
}

/**
 * Build the public status without exposing input, history or ownership data.
 *
 * @access private
 * @param array $job Stored job.
 * @return array
 */
function openstation_brand_ai_job_status( array $job ) {
	$status = $job['status'];
	$error  = isset( $job['error'] ) ? $job['error'] : null;
	if ( in_array( $status, array( 'queued', 'running' ), true ) && time() >= $job['deadline'] ) {
		$status = 'failed';
		$error  = array(
			'code'    => 'openstation_brand_ai_job_interrupted',
			'message' => __( 'The background worker did not finish. Your site branding has not changed. Please try again.', 'desktop-mode' ),
		);
	}
	return array(
		'jobId'     => $job['id'],
		'status'    => $status,
		'createdAt' => $job['created'],
		'pollAfter' => 3,
		'result'    => 'completed' === $status ? $job['result'] : null,
		'error'     => $error,
	);
}

/**
 * Return an uncached job snapshot. Polling never starts or advances a worker.
 *
 * @access private
 * @param WP_REST_Request $request REST request.
 * @return WP_REST_Response|WP_Error
 */
function openstation_brand_ai_rest_job( WP_REST_Request $request ) {
	$job = openstation_brand_ai_job_get( (string) $request['job'] );
	if ( ! $job || get_current_user_id() !== $job['owner'] ) {
		return new WP_Error( 'openstation_brand_ai_job_not_found', __( 'Brand proposal not found.', 'desktop-mode' ), array( 'status' => 404 ) );
	}
	$response = rest_ensure_response( openstation_brand_ai_job_status( $job ) );
	$response->header( 'Cache-Control', 'no-store, private' );
	return $response;
}

/**
 * Release only this job's admission slot, atomically.
 *
 * @access private
 * @param array $job Stored job.
 */
function openstation_brand_ai_job_release( array $job ) {
	global $wpdb;
	$key = 'openstation_brand_ai_job_active_' . $job['owner'];
	// A compare-and-delete protects a replacement slot from a late worker.
	$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->options} WHERE option_name = %s AND option_value = %s", $key, $job['id'] . '|' . $job['deadline'] ) );
	wp_cache_delete( $key, 'options' );
}

/**
 * Queue a validated invocation; a request UUID makes submission retry-safe.
 *
 * @access private
 * @param WP_REST_Request $request REST request, after the site-admin gate.
 * @return WP_REST_Response|WP_Error
 */
function openstation_brand_ai_enqueue_job( WP_REST_Request $request ) {
	if ( ! openstation_brand_ai_permission() ) {
		return new WP_Error( 'openstation_brand_ai_forbidden', __( 'Only site administrators can create branding proposals.', 'desktop-mode' ), array( 'status' => 403 ) );
	}
	$id = strtolower( (string) $request['requestId'] );
	if ( ! wp_is_uuid( $id ) ) {
		return new WP_Error( 'openstation_brand_ai_job_id_required', __( 'An async invocation requires a request UUID.', 'desktop-mode' ), array( 'status' => 400 ) );
	}
	$message = sanitize_textarea_field( (string) $request['brief'] );
	if ( mb_strlen( trim( $message ) ) < 3 || mb_strlen( $message ) > 2000 ) {
		return new WP_Error( 'openstation_brand_ai_job_message', __( 'Send a message between 3 and 2000 characters.', 'desktop-mode' ), array( 'status' => 400 ) );
	}
	$job      = array(
		'id'       => $id,
		'owner'    => get_current_user_id(),
		'message'  => $message,
		'status'   => 'queued',
		'created'  => time(),
		'deadline' => time() + OPENSTATION_BRAND_AI_JOB_LIFETIME,
	);
	$existing = openstation_brand_ai_job_get( $id );
	if ( $existing ) {
		foreach ( array( 'owner', 'message' ) as $field ) {
			if ( $existing[ $field ] !== $job[ $field ] ) {
				return new WP_Error( 'openstation_brand_ai_job_conflict', __( 'That request ID is already in use.', 'desktop-mode' ), array( 'status' => 409 ) );
			}
		}
		return new WP_REST_Response( openstation_brand_ai_job_status( $existing ), 202, array( 'Cache-Control' => 'no-store, private' ) );
	}

	// Bound the queue: at most one outstanding request per administrator.
	$slot       = 'openstation_brand_ai_job_active_' . $job['owner'];
	$slot_value = explode( '|', (string) get_option( $slot, '' ) );
	$previous   = openstation_brand_ai_job_get( $slot_value[0] );
	if ( ! $previous && isset( $slot_value[1] ) && time() >= (int) $slot_value[1] ) {
		openstation_brand_ai_job_release(
			array_merge(
				$job,
				array(
					'id'       => $slot_value[0],
					'deadline' => (int) $slot_value[1],
				)
			)
		);
	}
	if ( $previous && ( time() >= $previous['deadline'] || in_array( $previous['status'], array( 'completed', 'failed' ), true ) ) ) {
		openstation_brand_ai_job_release( $previous );
	}
	if ( ! openstation_brand_ai_job_insert( $slot, $id . '|' . $job['deadline'] ) ) {
		return new WP_Error( 'openstation_brand_ai_job_busy', __( 'Your previous branding proposal is still running. Wait for it to finish before starting another.', 'desktop-mode' ), array( 'status' => 409 ) );
	}
	if ( ! openstation_brand_ai_job_insert( 'openstation_brand_ai_job_' . $id, $job ) ) {
		openstation_brand_ai_job_release( $job );
		return new WP_Error( 'openstation_brand_ai_job_conflict', __( 'The request could not be saved. Retry with the same request ID.', 'desktop-mode' ), array( 'status' => 409 ) );
	}

	$scheduled = wp_schedule_single_event( time(), 'openstation_brand_ai_job_run', array( $id ), true );
	$cleanup   = wp_schedule_single_event( time() + DAY_IN_SECONDS, 'openstation_brand_ai_job_cleanup', array( $id ), true );
	if ( is_wp_error( $scheduled ) || ! $scheduled || is_wp_error( $cleanup ) || ! $cleanup ) {
		wp_clear_scheduled_hook( 'openstation_brand_ai_job_run', array( $id ) );
		wp_clear_scheduled_hook( 'openstation_brand_ai_job_cleanup', array( $id ) );
		openstation_brand_ai_job_release( $job );
		delete_option( 'openstation_brand_ai_job_' . $id );
		return new WP_Error( 'openstation_brand_ai_job_schedule', __( 'WordPress could not schedule the background job.', 'desktop-mode' ), array( 'status' => 503 ) );
	} else {
		openstation_brand_ai_job_wake( $id );
	}
	return new WP_REST_Response( openstation_brand_ai_job_status( openstation_brand_ai_job_get( $id ) ), 202, array( 'Cache-Control' => 'no-store, private' ) );
}

/**
 * Wake cron; use an FPM-only post-response fallback for blocked loopbacks.
 *
 * @access private
 * @param string $id Job UUID.
 */
function openstation_brand_ai_job_wake( $id ) {
	// ALTERNATE_WP_CRON can include wp-cron.php in the current GET request.
	if ( ! ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) && ! ( defined( 'ALTERNATE_WP_CRON' ) && ALTERNATE_WP_CRON ) ) {
		spawn_cron();
	}
	if ( function_exists( 'fastcgi_finish_request' ) ) {
		add_action(
			'shutdown',
			static function () use ( $id ) {
				ignore_user_abort( true );
				if ( fastcgi_finish_request() ) {
					openstation_brand_ai_job_run( $id );
				}
			},
			PHP_INT_MAX
		);
	}
}

/**
 * Persist a terminal result, keeping the execution claim until retention ends.
 *
 * @access private
 * @param array          $job    Stored job.
 * @param array|WP_Error $result Runner outcome.
 */
function openstation_brand_ai_job_finish( array $job, $result ) {
	$job['status'] = is_wp_error( $result ) ? 'failed' : 'completed';
	$job['result'] = is_wp_error( $result ) ? null : $result;
	$job['error']  = is_wp_error( $result ) ? array(
		'code'    => $result->get_error_code(),
		'message' => $result->get_error_message(),
	) : null;
	update_option( 'openstation_brand_ai_job_' . $job['id'], $job, false );
	openstation_brand_ai_job_release( $job );
	/**
	 * Fires after an async job stores its terminal outcome.
	 *
	 * @param string $id     Job UUID.
	 * @param int    $owner  Requesting human user id.
	 * @param array  $status Public job status, including result or error.
	 */
	do_action( 'openstation_brand_ai_job_finished', $job['id'], $job['owner'], openstation_brand_ai_job_status( $job ) );
}

/**
 * Execute once, restoring the human identity before rechecking permissions.
 *
 * @access private
 * @param string $id Job UUID.
 */
function openstation_brand_ai_job_run( $id ) {
	$job = openstation_brand_ai_job_get( $id );
	if ( ! $job || 'queued' !== $job['status'] || ! openstation_brand_ai_job_insert( 'openstation_brand_ai_job_claim_' . $id, time() ) ) {
		return;
	}
	if ( time() >= $job['deadline'] ) {
		openstation_brand_ai_job_finish( $job, new WP_Error( 'openstation_brand_ai_job_expired', __( 'The queued job expired before a worker could start it.', 'desktop-mode' ) ) );
		return;
	}
	$job['status'] = 'running';
	update_option( 'openstation_brand_ai_job_' . $id, $job, false );
	$finished = false;
	register_shutdown_function(
		static function () use ( &$finished, $job ) {
			if ( ! $finished ) {
				openstation_brand_ai_job_finish( $job, new WP_Error( 'openstation_brand_ai_job_interrupted', __( 'The background worker stopped unexpectedly. Your site branding has not changed. Please try again.', 'desktop-mode' ) ) );
			}
		}
	);
	ignore_user_abort( true );
	if ( function_exists( 'set_time_limit' ) ) {
		set_time_limit( 0 );
	}
	$previous = get_current_user_id();
	try {
		// The post-response worker may inherit a stale WP_User for the same ID.
		wp_set_current_user( 0 );
		wp_set_current_user( $job['owner'] );
		$request = new WP_REST_Request( 'POST', '/desktop-mode/v1/brand-studio/propose' );
		$request->set_param( 'brief', $job['message'] );
		$result = openstation_brand_ai_propose( $request );
		if ( $result instanceof WP_REST_Response ) {
			$result = $result->get_data();
		}
	} catch ( Throwable $error ) {
		$result = new WP_Error( 'openstation_brand_ai_job_failed', __( 'The background branding assistant encountered an error. Your site branding has not changed.', 'desktop-mode' ) );
	} finally {
		wp_set_current_user( $previous );
	}
	openstation_brand_ai_job_finish( $job, $result );
	$finished = true;
}
add_action( 'openstation_brand_ai_job_run', 'openstation_brand_ai_job_run' );

/**
 * Remove input, result, claim and admission slot after one day.
 *
 * @access private
 * @param string $id Job UUID.
 */
function openstation_brand_ai_job_cleanup( $id ) {
	$job = openstation_brand_ai_job_get( $id );
	if ( $job ) {
		openstation_brand_ai_job_release( $job );
		delete_option( 'openstation_brand_ai_job_' . $id );
		delete_option( 'openstation_brand_ai_job_claim_' . $id );
		wp_clear_scheduled_hook( 'openstation_brand_ai_job_run', array( $id ) );
	}
}
add_action( 'openstation_brand_ai_job_cleanup', 'openstation_brand_ai_job_cleanup' );
