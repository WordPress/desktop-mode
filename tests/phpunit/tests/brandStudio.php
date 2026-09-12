<?php
/**
 * Brand Studio compilation, persistence and isolation.
 *
 * @package OpenStation
 * @group openstation
 * @group os-themes
 */

/**
 * Tests the built-in brand palette through its real PHP entry points.
 *
 * @group openstation
 * @group os-themes
 */
class Tests_OpenStation_BrandStudio extends WP_UnitTestCase {
	/** @covers ::openstation_brand_studio_tokens */
	public function test_first_paint_matches_the_live_compiler_vectors() {
		$vectors = wp_json_file_decode( OPENSTATION_DIR . 'tests/fixtures/brand-studio-colors.json', array( 'associative' => true ) );
		foreach ( $vectors as $vector ) {
			$tokens = openstation_brand_studio_tokens( $vector['palette'], true, 'geist', $vector['opacity'] ?? array() );
			foreach ( $vector['expected'] as $name => $expected ) {
				$this->assertSame( $expected, $tokens[ $name ], $name );
			}
		}
	}

	/** @covers ::openstation_sanitize_brand_palette */
	public function test_sanitizer_rejects_css_and_unknown_roles() {
		$defaults = openstation_sanitize_brand_palette( array() );
		$this->assertCount( 10, $defaults );
		$this->assertSame( $defaults, openstation_sanitize_brand_palette( 'bad' ) );
		$this->assertSame( $defaults, openstation_sanitize_brand_palette( (object) array() ) );
		$result = openstation_sanitize_brand_palette( array( 'primary' => 'red; color: blue', 'text' => '#ABCDEF', 'unknown' => '#123456' ) );
		$this->assertSame( $defaults['primary'], $result['primary'] );
		$this->assertSame( '#abcdef', $result['text'] );
		$this->assertCount( 10, $result );
	}

	/** @covers ::openstation_brand_studio_tokens */
	public function test_every_token_survives_the_real_theme_sanitizer() {
		$tokens = openstation_brand_studio_tokens( array( 'primary' => '#ffffff', 'surface' => '#ffffff', 'text' => '#ffffff' ) );
		$this->assertCount( 336, $tokens );
		$this->assertSame( $tokens, openstation_sanitize_desktop_theme_tokens( $tokens ) );
		$this->assertSame( '#ffffff', $tokens['--os-ui-accent'] );
		$this->assertArrayNotHasKey( '--os-tabs-active-bg', $tokens );
	}

	/** @covers ::openstation_brand_readable */
	public function test_readable_ink_handles_extreme_backgrounds() {
		foreach ( array( '#000000', '#ffffff', '#777777', '#e41e2b', '#00ff00', '#0000ff' ) as $bg ) {
			$ink = openstation_brand_readable( $bg, $bg );
			$this->assertGreaterThanOrEqual( 4.5, openstation_brand_contrast( $ink, $bg ) );
		}
		$this->assertSame( '#808080', openstation_brand_mix( '#000000', '#ffffff', 0.5 ) );
	}

	/** @covers ::openstation_register_brand_studio */
	public function test_registration_uses_site_colours_for_any_user() {
		$user = self::factory()->user->create();
		wp_set_current_user( $user );
		update_option( OPENSTATION_SITE_BRANDING_OPTION, array( 'enabled' => true, 'brandPalette' => array( 'primary' => '#123456' ) ) );
		$settings = openstation_get_os_settings( $user );
		$this->assertSame( '#123456', $settings['brandPalette']['primary'] );
		openstation_register_brand_studio();
		$entry = openstation_desktop_theme_registry( 'openstation-brand-studio' );
		$this->assertSame( '#123456', $entry['manifest']['tokens']['--os-ui-accent'] );
		$this->assertStringContainsString( 'body.os-desktop-theme-openstation-brand-studio', $entry['cssText'] );
		$this->assertStringNotContainsString( ':root', $entry['cssText'] );
		wp_set_current_user( 0 );
	}
	/** @covers ::openstation_sanitize_brand_font */
	public function test_font_stacks_are_allowlisted_and_saved() {
		foreach ( array( null, array(), '__proto__', 'url(https://example.com)' ) as $raw ) {
			$this->assertSame( 'geist', openstation_sanitize_brand_font( $raw ) );
		}
		$recipe = openstation_brand_studio_recipe();
		foreach ( $recipe['fonts'] as $font => $stack ) {
			$tokens = openstation_brand_studio_tokens( array(), true, $font );
			$this->assertSame( $stack, $tokens['--os-font'] );
			$this->assertSame( $tokens, openstation_sanitize_desktop_theme_tokens( $tokens ) );
		}
		$user = self::factory()->user->create();
		update_option( OPENSTATION_SITE_BRANDING_OPTION, array( 'brandFont' => 'editorial' ) );
		$this->assertSame( 'editorial', openstation_get_os_settings( $user )['brandFont'] );
	}

	/** @covers ::openstation_sanitize_brand_opacity */
	public function test_alpha_and_glass_are_sanitized_without_losing_zero() {
		$this->assertSame( '#12345680', openstation_sanitize_brand_palette( array( 'primary' => '#12345680' ) )['primary'] );
		$this->assertSame( '#123456', openstation_brand_composite( '#ffffff00', '#123456' ) );
		$this->assertSame( '#808080', openstation_brand_composite( '#ffffff80', '#000000' ) );
		$this->assertSame( array( 'widgets' => 0, 'dock' => 94 ), openstation_sanitize_brand_opacity( array( 'widgets' => 0, 'dock' => INF ) ) );
		$this->assertSame( array( 'widgets' => 0, 'dock' => 100 ), openstation_sanitize_brand_opacity( array( 'widgets' => -10, 'dock' => 200 ) ) );
		$tokens = openstation_brand_studio_tokens( array( 'surface' => '#ffffff80' ), true, 'geist', array( 'widgets' => 0 ) );
		$this->assertSame( $tokens, openstation_sanitize_desktop_theme_tokens( $tokens ) );
		$this->assertStringEndsWith( ', 0)', $tokens['--os-ui-color-surface'] );
	}

}
