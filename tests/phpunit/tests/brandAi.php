<?php
/** Brand Studio AI: strict proposals, explicit acceptance and site permissions. @package OpenStation */

/** @group openstation */
class Tests_OpenStation_BrandAi extends WP_UnitTestCase {
	private $hook;

	public function set_up() {
		parent::set_up();
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );
	}

	public function tear_down() {
		if ( $this->hook ) {
			remove_filter( 'openstation_brand_studio_generate', $this->hook );
		}
		parent::tear_down();
	}

	private function proposal() {
		return array(
			'name' => 'Ocean studio', 'rationale' => 'A blue identity with readable surfaces.',
			'brandPalette' => openstation_sanitize_brand_palette( array( 'primary' => '#0057b8' ) ),
			'brandFont' => 'system', 'brandOpacity' => array( 'widgets' => 75, 'dock' => 94 ),
			'sources' => array( array( 'title' => 'Brand guide', 'url' => 'https://example.com/brand' ) ),
		);
	}

	private function request( $brief = 'Use an ocean blue brand' ) {
		$request = new WP_REST_Request( 'POST', '/desktop-mode/v1/brand-studio/propose' );
		$request->set_param( 'brief', $brief );
		return openstation_brand_ai_propose( $request );
	}

	/** @covers ::openstation_brand_ai_propose */
	public function test_generation_never_writes_branding_or_user_preferences() {
		$before = openstation_get_site_branding();
		$user_before = get_user_meta( get_current_user_id(), OPENSTATION_OS_SETTINGS_META_KEY, true );
		$this->hook = function () { return array( 'proposal' => $this->proposal(), 'webSearch' => true, 'warning' => '' ); };
		add_filter( 'openstation_brand_studio_generate', $this->hook );
		$response = $this->request();
		$this->assertInstanceOf( WP_REST_Response::class, $response );
		$this->assertSame( '#0057b8', $response->get_data()['brandPalette']['primary'] );
		$this->assertTrue( $response->get_data()['webSearch'] );
		$this->assertSame( $before, openstation_get_site_branding() );
		$this->assertSame( $user_before, get_user_meta( get_current_user_id(), OPENSTATION_OS_SETTINGS_META_KEY, true ) );
	}

	/** @covers ::openstation_brand_ai_permission */
	public function test_non_admin_and_logged_out_requests_cannot_generate() {
		foreach ( array( 0, self::factory()->user->create( array( 'role' => 'editor' ) ) ) as $user ) {
			wp_set_current_user( $user );
			$this->assertFalse( openstation_brand_ai_permission() );
			$this->assertSame( 403, $this->request()->get_error_data()['status'] );
		}
	}

	/** @covers ::openstation_brand_ai_validate */
	public function test_incomplete_or_unsafe_settings_are_rejected_not_defaulted() {
		foreach ( array(
			array( 'brandPalette' => array( 'primary' => '#123456' ) ),
			array( 'brandFont' => 'url(https://example.com/font)' ),
			array( 'brandOpacity' => array( 'widgets' => 101, 'dock' => 50 ) ),
			array( 'extra' => 'unrequested setting' ),
		) as $patch ) {
			$this->assertWPError( openstation_brand_ai_validate( array_merge( $this->proposal(), $patch ) ) );
		}
		$this->assertWPError( openstation_brand_ai_validate( null ) );
		$value = $this->proposal();
		$value['brandPalette']['primary'] = '#12345680';
		$value['brandOpacity']['widgets'] = 0;
		$value['sources'] = array( array( 'title' => '<b>Unsafe</b>', 'url' => 'javascript:alert(1)' ) );
		$clean = openstation_brand_ai_validate( $value );
		$this->assertSame( '#12345680', $clean['brandPalette']['primary'] );
		$this->assertSame( 0, $clean['brandOpacity']['widgets'] );
		$this->assertSame( array(), $clean['sources'] );
	}

	/** @covers ::openstation_brand_ai_schema */
	public function test_every_role_and_setting_is_required_in_strict_output() {
		$schema = openstation_brand_ai_schema();
		$this->assertFalse( $schema['additionalProperties'] );
		$this->assertCount( 10, $schema['properties']['brandPalette']['required'] );
		$this->assertSame( array( 'widgets', 'dock' ), $schema['properties']['brandOpacity']['required'] );
		$this->assertFalse( $schema['properties']['sources']['items']['additionalProperties'] );
	}

	/** @covers ::openstation_brand_ai_propose */
	public function test_invalid_briefs_and_provider_errors_are_recoverable() {
		$this->assertSame( 400, $this->request( 'a' )->get_error_data()['status'] );
		$this->assertSame( 400, $this->request( str_repeat( 'a', 2001 ) )->get_error_data()['status'] );
		$this->hook = static function () { return new WP_Error( 'test_provider', 'Provider unavailable', array( 'status' => 503 ) ); };
		add_filter( 'openstation_brand_studio_generate', $this->hook );
		$this->assertSame( 'test_provider', $this->request()->get_error_code() );
	}
	/** @covers ::openstation_brand_ai_provider_schema */
	public function test_provider_schema_omits_unsupported_bounds_but_server_still_enforces_them() {
		$schema = openstation_brand_ai_provider_schema();
		$this->assertArrayNotHasKey( 'rationale', $schema['properties'] );
		$this->assertArrayNotHasKey( 'maximum', $schema['properties']['brandOpacity']['properties']['widgets'] );
		$this->assertFalse( $schema['additionalProperties'] );
		$this->assertSame( 100, openstation_brand_ai_schema()['properties']['brandOpacity']['properties']['widgets']['maximum'] );
	}

	/** @covers ::openstation_brand_ai_validate */
	public function test_long_or_absent_explanation_cannot_reject_valid_colours() {
		$raw = $this->proposal();
		$raw['rationale'] = str_repeat( 'Design explanation. ', 200 );
		$raw['name'] = str_repeat( 'Brand name ', 20 );
		$clean = openstation_brand_ai_validate( $raw );
		$this->assertIsArray( $clean );
		$this->assertSame( '', $clean['rationale'] );
		$this->assertSame( 80, mb_strlen( $clean['name'] ) );
		unset( $raw['rationale'] );
		$this->assertIsArray( openstation_brand_ai_validate( $raw ) );
	}

	/** @covers ::openstation_brand_ai_complete_proposal */
	public function test_incomplete_output_is_retried_once_and_never_defaulted() {
		$calls = array();
		$before = openstation_get_site_branding();
		$result = openstation_brand_ai_complete_proposal( function ( $feedback ) use ( &$calls ) {
			$calls[] = $feedback;
			return wp_json_encode( 1 === count( $calls ) ? array( 'brandPalette' => array() ) : $this->proposal() );
		} );
		$this->assertCount( 2, $calls );
		$this->assertStringContainsString( 'failed validation', $calls[1] );
		$this->assertSame( $this->proposal()['brandPalette'], $result['brandPalette'] );
		$this->assertSame( $before, openstation_get_site_branding() );
		$attempts = 0;
		$result = openstation_brand_ai_complete_proposal( static function () use ( &$attempts ) {
			++$attempts;
			return '<html>Not JSON</html>';
		} );
		$this->assertWPError( $result );
		$this->assertSame( 2, $attempts );
		$attempts = 0;
		$result = openstation_brand_ai_complete_proposal( static function () use ( &$attempts ) {
			++$attempts;
			return new WP_Error( 'provider_failure', 'Provider unavailable' );
		} );
		$this->assertSame( 'provider_failure', $result->get_error_code() );
		$this->assertSame( 1, $attempts );
	}

	/** @covers ::openstation_brand_ai_provider_schema */
	public function test_provider_requires_every_setting_and_allows_alpha_on_every_role() {
		$schema = openstation_brand_ai_provider_schema();
		$this->assertSame( array( 'name', 'brandPalette', 'brandFont', 'brandOpacity', 'sources' ), $schema['required'] );
		$this->assertSame( array_keys( openstation_brand_studio_recipe()['defaults'] ), $schema['properties']['brandPalette']['required'] );
		$this->assertSame( array( 'widgets', 'dock' ), $schema['properties']['brandOpacity']['required'] );
		$proposal = $this->proposal();
		foreach ( $schema['properties']['brandPalette']['properties'] as $role => $field ) {
			$this->assertStringContainsString( '#RRGGBBAA', $field['description'] );
			$proposal['brandPalette'][ $role ] = '#12345680';
		}
		$proposal['brandPalette']['canvas'] = '#12345600';
		$proposal['brandOpacity'] = array( 'widgets' => 0, 'dock' => 100 );
		$this->assertSame( $proposal['brandPalette'], openstation_brand_ai_validate( $proposal )['brandPalette'] );
	}

}
