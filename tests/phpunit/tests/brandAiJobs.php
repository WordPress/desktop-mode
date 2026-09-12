<?php
/**
 * Background branding proposals never write site branding.
 * @package OpenStation
 * @group openstation
 * @covers ::openstation_brand_ai_enqueue_job
 * @covers ::openstation_brand_ai_rest_job
 * @covers ::openstation_brand_ai_job_run
 * @covers ::openstation_brand_ai_job_status
 * @covers ::openstation_brand_ai_job_insert
 * @covers ::openstation_brand_ai_job_release
 * @covers ::openstation_brand_ai_job_finish
 * @covers ::openstation_brand_ai_job_cleanup
 */
class Tests_OpenStation_BrandAiJobs extends WP_UnitTestCase {
	private $owner;
	private $calls = 0;
	private $ids = array();

	public function set_up() {
		parent::set_up();
		$this->owner = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $this->owner );
		add_filter( 'pre_http_request', '__return_true' );
		add_filter( 'openstation_brand_studio_generate', array( $this, 'generate' ) );
	}

	public function tear_down() {
		foreach ( $this->ids as $id ) {
			openstation_brand_ai_job_cleanup( $id );
			wp_clear_scheduled_hook( 'openstation_brand_ai_job_cleanup', array( $id ) );
		}
		remove_filter( 'pre_http_request', '__return_true' );
		remove_filter( 'openstation_brand_studio_generate', array( $this, 'generate' ) );
		parent::tear_down();
	}

	public function generate() {
		++$this->calls;
		$this->assertSame( $this->owner, get_current_user_id() );
		return array( 'proposal' => array(
			'name' => 'Ocean', 'rationale' => 'A blue brand.',
			'brandPalette' => openstation_sanitize_brand_palette( array() ),
			'brandFont' => 'system', 'brandOpacity' => array( 'widgets' => 82, 'dock' => 94 ), 'sources' => array(),
		), 'webSearch' => false, 'warning' => '' );
	}

	private function submit( $id = null, $brief = 'An ocean blue brand' ) {
		$id = $id ?? wp_generate_uuid4();
		$this->ids[] = $id;
		$request = new WP_REST_Request( 'POST', '/desktop-mode/v1/brand-studio/propose' );
		$request->set_body_params( array( 'async' => true, 'requestId' => $id, 'brief' => $brief ) );
		return rest_get_server()->dispatch( $request );
	}

	private function poll( $id ) {
		return rest_get_server()->dispatch( new WP_REST_Request( 'GET', '/desktop-mode/v1/brand-studio/jobs/' . $id ) );
	}

	public function test_enqueue_and_status_return_without_ai_and_worker_runs_only_once() {
		$branding = openstation_get_site_branding();
		$response = $this->submit();
		$this->assertSame( 202, $response->get_status() );
		$id = $response->get_data()['jobId'];
		$this->assertSame( 'queued', $this->poll( $id )->get_data()['status'] );
		$this->assertSame( 0, $this->calls );
		$this->assertArrayNotHasKey( 'message', $this->poll( $id )->get_data() );
		$this->assertSame( 'no-store, private', $this->poll( $id )->get_headers()['Cache-Control'] );
		$this->assertNotFalse( wp_next_scheduled( 'openstation_brand_ai_job_run', array( $id ) ) );
		wp_set_current_user( 0 );
		openstation_brand_ai_job_run( $id );
		$this->assertSame( 0, get_current_user_id() );
		wp_set_current_user( $this->owner );
		$this->assertSame( 'completed', $this->poll( $id )->get_data()['status'] );
		$this->assertSame( 'Ocean', $this->poll( $id )->get_data()['result']['name'] );
		openstation_brand_ai_job_run( $id );
		$this->assertSame( 1, $this->calls );
		$this->assertSame( $branding, openstation_get_site_branding() );
	}

	public function test_idempotency_queue_limit_and_owner_only_status() {
		$id = $this->submit()->get_data()['jobId'];
		$this->assertSame( $id, $this->submit( $id )->get_data()['jobId'] );
		$this->assertSame( 409, $this->submit( $id, 'Different brand' )->get_status() );
		$this->assertSame( 409, $this->submit()->get_status() );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
		$this->assertSame( 404, $this->poll( $id )->get_status() );
		wp_set_current_user( 0 );
		$this->assertSame( 401, $this->poll( $id )->get_status() );
		$this->assertSame( 401, $this->submit()->get_status() );
		wp_set_current_user( $this->owner );
		openstation_brand_ai_job_run( $id );
		$this->assertSame( 'completed', $this->submit( $id )->get_data()['status'] );
		$this->assertSame( 202, $this->submit()->get_status() );
	}

	public function test_revoked_permission_fails_without_generation_and_cleanup_removes_data() {
		$id = $this->submit()->get_data()['jobId'];
		$user = get_userdata( $this->owner );
		$user->set_role( 'editor' );
		openstation_brand_ai_job_run( $id );
		$this->assertSame( 'failed', openstation_brand_ai_job_get( $id )['status'] );
		$this->assertSame( 0, $this->calls );
		$this->assertSame( 403, $this->poll( $id )->get_status() );
		openstation_brand_ai_job_cleanup( $id );
		$this->assertNull( openstation_brand_ai_job_get( $id ) );
		$this->assertFalse( get_option( 'openstation_brand_ai_job_claim_' . $id ) );
	}

		public function test_expired_jobs_and_provider_errors_have_useful_terminal_status() {
		$id = $this->submit()->get_data()['jobId'];
		$job = openstation_brand_ai_job_get( $id );
			$job['deadline'] = time() - 1;
			update_option( 'openstation_brand_ai_job_' . $id, $job, false );
			update_option( 'openstation_brand_ai_job_active_' . $this->owner, $id . '|' . $job['deadline'], false );
		$this->assertSame( 'failed', $this->poll( $id )->get_data()['status'] );
		openstation_brand_ai_job_run( $id );
		$this->assertSame( 0, $this->calls );
		$id = $this->submit()->get_data()['jobId'];
		$failure = static function () { return new WP_Error( 'test_provider', 'Provider unavailable.' ); };
		add_filter( 'openstation_brand_studio_generate', $failure, 20 );
		openstation_brand_ai_job_run( $id );
		remove_filter( 'openstation_brand_studio_generate', $failure, 20 );
			$this->assertSame( 'Provider unavailable.', $this->poll( $id )->get_data()['error']['message'] );
		}

		public function test_jobs_are_scoped_to_the_current_site() {
			if ( ! is_multisite() ) {
				$this->markTestSkipped( 'Multisite only.' );
			}
			$id = $this->submit()->get_data()['jobId'];
			$blog = self::factory()->blog->create();
			add_user_to_blog( $blog, $this->owner, 'administrator' );
			switch_to_blog( $blog );
			try {
				$this->assertNull( openstation_brand_ai_job_get( $id ) );
				$this->assertSame( 404, $this->poll( $id )->get_status() );
			} finally {
				restore_current_blog();
			}
			$this->assertSame( 'queued', $this->poll( $id )->get_data()['status'] );
		}
}
