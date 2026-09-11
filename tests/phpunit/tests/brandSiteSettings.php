<?php
/** Site-local branding ownership, authorization, and live delivery. @package OpenStation */

/** @group openstation */
class Tests_OpenStation_BrandSiteSettings extends WP_UnitTestCase {
	/** @var int */
	private $admin;

	public function set_up() {
		parent::set_up();
		delete_option( OPENSTATION_SITE_BRANDING_OPTION );
		$this->admin = self::factory()->user->create( array( 'role' => 'administrator' ) );
		wp_set_current_user( $this->admin );
	}

	/** Run the same callback as the nonce-protected settings route. */
	private function save_patch( $patch ) {
		$request = new WP_REST_Request( 'POST', '/desktop-mode/v1/os-settings' );
		$request->set_param( 'settings', $patch );
		return openstation_rest_save_os_settings( $request );
	}

	/** @covers ::openstation_save_site_branding_patch */
	public function test_activation_applies_to_every_user_without_writing_their_preferences() {
		$other = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		$personal = array( 'desktopTheme' => 'desktop-mode-legacy', 'wallpaper' => 'forest' );
		update_user_meta( $other, OPENSTATION_OS_SETTINGS_META_KEY, $personal );
		$result = $this->save_patch( array( 'desktopTheme' => 'openstation-brand-studio', 'brandAllowWallpaper' => false, 'brandPalette' => array( 'primary' => '#abcdef' ), 'brandFont' => 'editorial', 'brandOpacity' => array( 'widgets' => 0, 'dock' => 40 ) ) );
		$this->assertNotWPError( $result );
		foreach ( array( $this->admin, $other, 0 ) as $user ) {
			$settings = openstation_get_os_settings( $user );
			$this->assertSame( 'openstation-brand-studio', $settings['desktopTheme'] );
			$this->assertSame( 'brand-studio', $settings['wallpaper'] );
			$this->assertSame( '#abcdef', $settings['brandPalette']['primary'] );
			$this->assertSame( 'editorial', $settings['brandFont'] );
			$this->assertSame( array( 'widgets' => 0, 'dock' => 40 ), $settings['brandOpacity'] );
		}
		$this->assertSame( $personal, get_user_meta( $other, OPENSTATION_OS_SETTINGS_META_KEY, true ) );
		$stored = get_user_meta( $this->admin, OPENSTATION_OS_SETTINGS_META_KEY, true );
		$this->assertArrayNotHasKey( 'brandPalette', $stored );
		$this->assertArrayNotHasKey( 'brandFont', $stored );
		$this->assertArrayNotHasKey( 'brandOpacity', $stored );
		$this->assertTrue( get_option( OPENSTATION_SITE_BRANDING_OPTION )['enabled'] );
	}

	/** @covers ::openstation_save_site_branding_patch */
	public function test_non_admin_cannot_activate_edit_disable_or_replace_brand_wallpaper() {
		$editor = self::factory()->user->create( array( 'role' => 'editor' ) );
		wp_set_current_user( $editor );
		$result = $this->save_patch( array( 'desktopTheme' => 'openstation-brand-studio', 'brandAllowWallpaper' => false ) );
		$this->assertWPError( $result );
		$this->assertSame( 403, $result->get_error_data()['status'] );
		wp_set_current_user( $this->admin );
		$this->save_patch( array( 'desktopTheme' => 'openstation-brand-studio', 'brandAllowWallpaper' => false ) );
		$before = get_option( OPENSTATION_SITE_BRANDING_OPTION );
		wp_set_current_user( $editor );
		foreach ( array(
			array( 'brandPalette' => array( 'primary' => '#123456' ), 'dockSize' => 'large' ),
			array( 'brandFont' => 'editorial' ),
			array( 'brandOpacity' => array( 'widgets' => 0 ) ),
			array( 'desktopTheme' => '' ),
			array( 'wallpaper' => 'forest' ),
		) as $patch ) {
			$this->assertWPError( $this->save_patch( $patch ) );
			$this->assertSame( $before, get_option( OPENSTATION_SITE_BRANDING_OPTION ) );
		}
		$this->assertNotWPError( $this->save_patch( array( 'dockSize' => 'large' ) ) );
		$this->assertSame( 'large', openstation_get_os_settings( $editor )['dockSize'] );
		// Full effective snapshots may echo unchanged policy, but cannot edit it.
		$this->assertNotWPError( $this->save_patch( openstation_get_os_settings( $editor ) ) );
	}

	/** @covers ::openstation_get_personal_os_settings */
	public function test_release_restores_personal_choices_and_low_level_saves_never_change_policy() {
		$user = self::factory()->user->create();
		openstation_save_os_settings( $user, array( 'desktopTheme' => 'desktop-mode-legacy', 'wallpaper' => 'forest' ) );
		$this->save_patch( array( 'desktopTheme' => 'openstation-brand-studio', 'brandAllowWallpaper' => false, 'brandFont' => 'classic' ) );
		$policy = get_option( OPENSTATION_SITE_BRANDING_OPTION );
		openstation_save_os_settings( $user, openstation_get_os_settings( $user ) );
		$this->assertSame( $policy, get_option( OPENSTATION_SITE_BRANDING_OPTION ) );
		$this->save_patch( array( 'desktopTheme' => '' ) );
		$settings = openstation_get_os_settings( $user );
		$this->assertSame( 'desktop-mode-legacy', $settings['desktopTheme'] );
		$this->assertSame( 'forest', $settings['wallpaper'] );
		$this->assertSame( 'classic', openstation_get_site_branding()['brandFont'] );
	}

	/** @covers ::openstation_save_site_branding_patch */
	public function test_wallpapers_are_personal_by_default_and_locking_preserves_every_users_choice() {
		$first = self::factory()->user->create( array( 'role' => 'editor' ) );
		$second = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		openstation_save_os_settings( $first, array( 'wallpaper' => 'forest' ) );
		openstation_save_os_settings( $second, array( 'wallpaper' => 'snow' ) );
		$this->assertTrue( openstation_get_site_branding()['brandAllowWallpaper'] );
		$this->assertNotWPError( $this->save_patch( array( 'desktopTheme' => 'openstation-brand-studio' ) ) );
		$this->assertSame( 'brand-studio', openstation_get_os_settings( $this->admin )['wallpaper'] );
		$brand = get_option( OPENSTATION_SITE_BRANDING_OPTION );
		wp_set_current_user( $first );
		$this->assertNotWPError( $this->save_patch( array( 'wallpaper' => 'galaxy' ) ) );
		$this->assertSame( 'galaxy', openstation_get_os_settings( $first )['wallpaper'] );
		$this->assertSame( 'snow', openstation_get_os_settings( $second )['wallpaper'] );
		$this->assertSame( $brand, get_option( OPENSTATION_SITE_BRANDING_OPTION ) );
		$this->assertWPError( $this->save_patch( array( 'brandAllowWallpaper' => false ) ) );
		$this->assertArrayNotHasKey( 'brandAllowWallpaper', get_user_meta( $first, OPENSTATION_OS_SETTINGS_META_KEY, true ) );
		wp_set_current_user( $this->admin );
		$this->assertNotWPError( $this->save_patch( array( 'brandAllowWallpaper' => false ) ) );
		$this->assertSame( 'brand-studio', openstation_get_os_settings( $first )['wallpaper'] );
		wp_set_current_user( $first );
		$this->assertWPError( $this->save_patch( array( 'wallpaper' => 'forest' ) ) );
		openstation_save_os_settings( $first, openstation_get_os_settings( $first ) );
		$this->assertSame( 'galaxy', openstation_get_personal_os_settings( $first )['wallpaper'] );
		wp_set_current_user( $this->admin );
		$this->assertNotWPError( $this->save_patch( array( 'brandAllowWallpaper' => true ) ) );
		$this->assertSame( 'galaxy', openstation_get_os_settings( $first )['wallpaper'] );
		$this->assertSame( 'snow', openstation_get_os_settings( $second )['wallpaper'] );
		$this->assertSame( 'openstation-brand-studio', openstation_get_os_settings( $first )['desktopTheme'] );
		wp_set_current_user( $first );
		$this->assertNotWPError( $this->save_patch( array( 'wallpaper' => 'brand-studio' ) ) );
		$this->assertSame( 'brand-studio', openstation_get_personal_os_settings( $first )['wallpaper'] );
	}

	/** @covers ::openstation_save_site_branding_patch */
	public function test_wallpaper_permission_rejects_invalid_types_without_changing_policy() {
		$before = openstation_get_site_branding();
		$this->assertSame( 400, $this->save_patch( array( 'brandAllowWallpaper' => 'false' ) )->get_error_data()['status'] );
		$this->assertSame( $before, openstation_get_site_branding() );
	}

	/** @covers ::openstation_site_branding_heartbeat */
	public function test_heartbeat_is_read_only_and_site_scoped_with_generation_echo() {
		$this->save_patch( array( 'desktopTheme' => 'openstation-brand-studio', 'brandAllowWallpaper' => false ) );
		$response = openstation_site_branding_heartbeat( array(), array( 'openstation_site_branding' => array( 'generation' => 7 ) ) );
		$brand = $response['openstation_site_branding'];
		$this->assertSame( get_current_blog_id(), $brand['siteId'] );
		$this->assertSame( 7, $brand['generation'] );
		$this->assertTrue( $brand['canManage'] );
		$this->assertFalse( $brand['brandAllowWallpaper'] );
		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );
		$this->assertFalse( openstation_site_branding_snapshot()['canManage'] );
		$this->assertTrue( openstation_site_branding_snapshot()['enabled'] );
		wp_set_current_user( 0 );
		$this->assertSame( array(), openstation_site_branding_heartbeat( array(), array( 'openstation_site_branding' => true ) ) );
	}

	/** @covers ::openstation_get_site_branding */
	public function test_multisite_keeps_each_sites_brand_separate_for_the_same_user() {
		if ( ! is_multisite() ) {
			$this->markTestSkipped( 'Requires multisite.' );
		}
		$this->save_patch( array( 'desktopTheme' => 'openstation-brand-studio', 'brandAllowWallpaper' => false, 'brandPalette' => array( 'primary' => '#123456' ) ) );
		$blog = self::factory()->blog->create();
		switch_to_blog( $blog );
		try {
			$this->assertFalse( openstation_get_site_branding()['enabled'] );
			$this->assertNotSame( 'openstation-brand-studio', openstation_get_os_settings( $this->admin )['desktopTheme'] );
			add_user_to_blog( $blog, $this->admin, 'administrator' );
			wp_set_current_user( 0 );
			wp_set_current_user( $this->admin );
			$this->assertTrue( current_user_can( 'manage_options' ) );
			$this->assertNotWPError( $this->save_patch( array( 'desktopTheme' => 'openstation-brand-studio', 'brandAllowWallpaper' => false, 'brandPalette' => array( 'primary' => '#654321' ) ) ) );
			$this->assertSame( '#654321', openstation_get_os_settings( $this->admin )['brandPalette']['primary'] );
		} finally {
			restore_current_blog();
		}
		$this->assertSame( '#123456', openstation_get_os_settings( $this->admin )['brandPalette']['primary'] );
		$this->assertNotFalse( did_action( 'openstation_site_branding_updated' ) );
	}
}
