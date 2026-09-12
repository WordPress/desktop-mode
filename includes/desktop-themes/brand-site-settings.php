<?php
/**
 * Site-owned Brand Studio policy. Uses the current blog's options table only.
 *
 * @package OpenStation
 */

defined( 'ABSPATH' ) || exit;

/** Site-local option, deliberately never user meta or a network option. */
const OPENSTATION_SITE_BRANDING_OPTION = 'openstation_site_branding';

/**
 * Read branding independently of the current user's preferences or feature gates.
 *
 * @return array Site policy and sanitized palette.
 */
function openstation_get_site_branding() {
	$raw = get_option( OPENSTATION_SITE_BRANDING_OPTION, array() );
	$raw = is_array( $raw ) ? $raw : array();
	return array(
		'enabled'             => ! empty( $raw['enabled'] ),
		'brandPalette'        => openstation_sanitize_brand_palette( $raw['brandPalette'] ?? array() ),
		'brandFont'           => openstation_sanitize_brand_font( $raw['brandFont'] ?? 'geist' ),
		'brandOpacity'        => openstation_sanitize_brand_opacity( $raw['brandOpacity'] ?? array() ),
		'brandAllowWallpaper' => isset( $raw['brandAllowWallpaper'] ) && is_bool( $raw['brandAllowWallpaper'] ) ? $raw['brandAllowWallpaper'] : true,
		'revision'            => isset( $raw['revision'] ) && is_string( $raw['revision'] ) ? $raw['revision'] : '',
	);
}

/**
 * Overlay site policy after personal preferences have been read.
 *
 * @param array $settings Personal settings.
 * @return array Effective settings for this site.
 */
function openstation_apply_site_branding( $settings ) {
	$brand                           = openstation_get_site_branding();
	$settings['brandPalette']        = $brand['brandPalette'];
	$settings['brandFont']           = $brand['brandFont'];
	$settings['brandOpacity']        = $brand['brandOpacity'];
	$settings['brandAllowWallpaper'] = $brand['brandAllowWallpaper'];
	if ( $brand['enabled'] ) {
		$settings['desktopTheme'] = 'openstation-brand-studio';
		if ( ! $brand['brandAllowWallpaper'] ) {
			$settings['wallpaper'] = 'brand-studio';
		}
	}
	return $settings;
}

/**
 * Extract authorized site writes from a personal-settings patch.
 *
 * This boundary runs before either store is written. Migrations and low-level
 * user-meta saves cannot activate, disable or rewrite site branding.
 *
 * @param array $payload Incoming settings patch, with site fields removed in place.
 * @return true|WP_Error True on success or an authorization/persistence error.
 */
function openstation_save_site_branding_patch( &$payload ) {
	$previous = openstation_get_site_branding();
	$next     = $previous;
	$select   = isset( $payload['desktopTheme'] ) && is_string( $payload['desktopTheme'] );
	$activate = $select && 'openstation-brand-studio' === $payload['desktopTheme'];
	$disable  = $select && $previous['enabled'] && ! $activate;
	if ( array_key_exists( 'brandAllowWallpaper', $payload ) ) {
		if ( ! is_bool( $payload['brandAllowWallpaper'] ) ) {
			return new WP_Error( 'openstation_branding_wallpaper_policy', __( 'Wallpaper permission must be true or false.', 'desktop-mode' ), array( 'status' => 400 ) );
		}
		$next['brandAllowWallpaper'] = $payload['brandAllowWallpaper'];
	}
	$edit = ( array_key_exists( 'brandPalette', $payload ) && $payload['brandPalette'] !== $previous['brandPalette'] )
		|| ( array_key_exists( 'brandOpacity', $payload ) && $payload['brandOpacity'] !== $previous['brandOpacity'] )
		|| ( array_key_exists( 'brandFont', $payload ) && $payload['brandFont'] !== $previous['brandFont'] );
	$edit = $edit || $next['brandAllowWallpaper'] !== $previous['brandAllowWallpaper'];
	$wall = ( $activate || $previous['enabled'] ) && ! $next['brandAllowWallpaper'] && isset( $payload['wallpaper'] ) && 'brand-studio' !== $payload['wallpaper'];
	if ( ( ( $activate && ! $previous['enabled'] ) || $disable || $edit || $wall ) && ! current_user_can( 'manage_options' ) ) {
		return new WP_Error( 'openstation_branding_forbidden', __( 'Only site administrators can change site branding.', 'desktop-mode' ), array( 'status' => 403 ) );
	}
	if ( $wall && ! $disable ) {
		return new WP_Error( 'openstation_branding_wallpaper_locked', __( 'Personal wallpapers are disabled in Brand Studio. A site administrator can allow them without changing the theme.', 'desktop-mode' ), array( 'status' => 403 ) );
	}
	if ( $activate || $disable ) {
		$next['enabled'] = $activate;
	}
	if ( array_key_exists( 'brandPalette', $payload ) ) {
		$next['brandPalette'] = openstation_sanitize_brand_palette( $payload['brandPalette'], $previous['brandPalette'] );
	}
	if ( array_key_exists( 'brandFont', $payload ) ) {
		$next['brandFont'] = openstation_sanitize_brand_font( $payload['brandFont'] );
	}
	if ( array_key_exists( 'brandOpacity', $payload ) ) {
		$next['brandOpacity'] = openstation_sanitize_brand_opacity( $payload['brandOpacity'], $previous['brandOpacity'] );
	}
	if ( $next !== $previous ) {
		$next['revision'] = wp_generate_uuid4();
		if ( ! update_option( OPENSTATION_SITE_BRANDING_OPTION, $next, false ) ) {
			return new WP_Error( 'openstation_branding_save_failed', __( 'Site branding could not be saved. Please try again.', 'desktop-mode' ), array( 'status' => 500 ) );
		}
		/**
		 * Fires after this site's branding is saved. Never a network-wide write.
		 *
		 * @param array $next     Saved site branding.
		 * @param array $previous Previous site branding.
		 */
		do_action( 'openstation_site_branding_updated', $next, $previous );
	}
	unset( $payload['brandPalette'], $payload['brandFont'], $payload['brandOpacity'], $payload['brandAllowWallpaper'] );
	if ( $activate ) {
		unset( $payload['desktopTheme'] );
		if ( ! isset( $payload['wallpaper'] ) ) {
			$payload['wallpaper'] = 'brand-studio';
		}
	}
	if ( $next['enabled'] && ! $next['brandAllowWallpaper'] ) {
		unset( $payload['wallpaper'] );
	}
	return true;
}

/**
 * Public read-only policy snapshot used at boot and by Heartbeat.
 *
 * @return array Effective branding plus this user's release values.
 */
function openstation_site_branding_snapshot() {
	$brand                      = openstation_get_site_branding();
	$personal                   = openstation_get_personal_os_settings( get_current_user_id() );
	$brand['canManage']         = current_user_can( 'manage_options' );
	$brand['siteId']            = get_current_blog_id();
	$brand['personalTheme']     = $personal['desktopTheme'];
	$brand['personalWallpaper'] = $personal['wallpaper'];
	return $brand;
}

/**
 * Deliver current site branding to open shells without another polling loop.
 *
 * @param array $response Existing Heartbeat response.
 * @param array $data     Client subscription.
 * @return array Response with a site-scoped branding snapshot when requested.
 */
function openstation_site_branding_heartbeat( $response, $data ) {
	if ( ! empty( $data['openstation_site_branding'] ) && current_user_can( 'read' ) ) {
		$response['openstation_site_branding']               = openstation_site_branding_snapshot();
		$response['openstation_site_branding']['generation'] = isset( $data['openstation_site_branding']['generation'] ) ? (int) $data['openstation_site_branding']['generation'] : -1;
	}
	return $response;
}
add_filter( 'heartbeat_received', 'openstation_site_branding_heartbeat', 10, 2 );
