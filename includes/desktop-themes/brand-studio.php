<?php
/**
 * Brand Studio: ten colour roles compiled through the normal theme registry.
 * Recipe data and colour arithmetic are shared with the live TypeScript compiler.
 *
 * @package OpenStation
 */

defined( 'ABSPATH' ) || exit;

/**
 * Read the shipped, explicit token assignments once per request.
 *
 * @internal
 * @return array Recipe defaults, fixed exceptions and token templates.
 */
function openstation_brand_studio_recipe() {
	static $recipe = null;
	if ( null === $recipe ) {
		$recipe = wp_json_file_decode( OPENSTATION_DIR . 'assets/desktop-themes/brand-studio/palette.json', array( 'associative' => true ) );
	}
	return is_array( $recipe ) ? $recipe : array(
		'defaults' => array(),
		'tokens'   => array(),
	);
}

/**
 * Admit only the ten known roles and six- or eight-digit hex colours.
 *
 * @internal
 * @param mixed $raw      Candidate palette.
 * @param array $fallback Values for absent or invalid fields.
 * @return array Sanitized palette.
 */
function openstation_sanitize_brand_palette( $raw, $fallback = array() ) {
	$recipe = openstation_brand_studio_recipe();
	$raw    = is_array( $raw ) ? $raw : array();
	$out    = array();
	foreach ( $recipe['defaults'] as $role => $default ) {
		$out[ $role ] = isset( $raw[ $role ] ) && is_string( $raw[ $role ] ) && preg_match( '/^#[0-9a-f]{6}([0-9a-f]{2})?$/i', $raw[ $role ] )
			? strtolower( $raw[ $role ] ) : ( $fallback[ $role ] ?? $default );
	}
	return $out;
}

/**
 * Decode opaque sRGB channels.
 *
 * @internal
 * @param string $hex Sanitized hex colour.
 * @return array Channels in the range 0–255.
 */
function openstation_brand_channels( $hex ) {
	return array( hexdec( substr( $hex, 1, 2 ) ), hexdec( substr( $hex, 3, 2 ) ), hexdec( substr( $hex, 5, 2 ) ) );
}

/**
 * Mix opaque sRGB colours with the same rounding as the live compiler.
 *
 * @internal
 * @param string $a      First colour.
 * @param string $b      Second colour.
 * @param float  $weight Second colour's weight.
 * @return string Hex colour.
 */
function openstation_brand_mix( $a, $b, $weight ) {
	$left  = openstation_brand_channels( $a );
	$right = openstation_brand_channels( $b );
	$out   = '#';
	$parts = (int) round( $weight * 1000 );
	foreach ( $left as $i => $channel ) {
		$out .= sprintf( '%02x', (int) floor( ( $channel * ( 1000 - $parts ) + $right[ $i ] * $parts + 500 ) / 1000 ) );
	}
	return $out;
}

/**
 * WCAG relative luminance of an opaque sRGB colour.
 *
 * @internal
 * @param string $color Hex colour.
 * @return float Luminance.
 */
function openstation_brand_luminance( $color ) {
	$total   = 0;
	$weights = array( 0.2126, 0.7152, 0.0722 );
	foreach ( openstation_brand_channels( $color ) as $i => $channel ) {
		$c      = $channel / 255;
		$total += ( $c <= 0.04045 ? $c / 12.92 : ( ( $c + 0.055 ) / 1.055 ) ** 2.4 ) * $weights[ $i ];
	}
	return $total;
}

/**
 * Contrast ratio of two opaque sRGB colours.
 *
 * @internal
 * @param string $a First colour.
 * @param string $b Second colour.
 * @return float Ratio.
 */
function openstation_brand_contrast( $a, $b ) {
	$l1 = openstation_brand_luminance( $a );
	$l2 = openstation_brand_luminance( $b );
	return ( max( $l1, $l2 ) + 0.05 ) / ( min( $l1, $l2 ) + 0.05 );
}

/**
 * Preserve a chosen hue where possible, adjusting ink to at least 4.5:1.
 *
 * @internal
 * @param string $preferred  Requested colour.
 * @param string $background Opaque background.
 * @param string $other_background Optional second gradient endpoint.
 * @return string Readable ink colour.
 */
function openstation_brand_readable( $preferred, $background, $other_background = null ) {
	$other_background = $other_background ?? $background;
	$score            = static function ( $color ) use ( $background, $other_background ) {
		return min( openstation_brand_contrast( $color, $background ), openstation_brand_contrast( $color, $other_background ) );
	};
	$target           = $score( '#000000' ) >= $score( '#ffffff' ) ? '#000000' : '#ffffff';
	for ( $step = 0; $step <= 20; ++$step ) {
		$candidate = openstation_brand_mix( $preferred, $target, $step / 20 );
		if ( $score( $candidate ) >= 4.5 ) {
			return $candidate;
		}
	}
	return $target;
}

/**
 * Compile the palette to concrete values accepted by the theme sanitizer.
 *
 * @internal
 * @param mixed  $raw      Palette input.
 * @param bool   $backdrop Whether the matching backdrop is selected.
 * @param string $font     Local font stack identifier.
 * @param array  $opacity  Independent glass percentages.
 * @return array Token map.
 */
function openstation_brand_studio_tokens( $raw, $backdrop = false, $font = 'geist', $opacity = array() ) {
	$source  = openstation_sanitize_brand_palette( $raw );
	$recipe  = openstation_brand_studio_recipe();
	$glass   = openstation_sanitize_brand_opacity( $opacity );
	$canvas  = openstation_brand_composite( $source['canvas'], $recipe['defaults']['canvas'] );
	$surface = openstation_brand_composite( $source['surface'], $canvas );
	$p       = array();
	foreach ( $source as $role => $color ) {
		$p[ $role ] = 'canvas' === $role ? $canvas : ( 'surface' === $role ? $surface : openstation_brand_composite( $color, $surface ) );
	}
	$ink      = openstation_brand_readable( $p['text'], $p['surface'] );
	$lift     = openstation_brand_contrast( '#000000', $p['surface'] ) >= openstation_brand_contrast( '#ffffff', $p['surface'] ) ? '#ffffff' : '#000000';
	$elevated = openstation_brand_mix( $p['surface'], $lift, 0.08 );
	$hover    = openstation_brand_mix( $p['surface'], $ink, 0.14 );
	$colors   = array_merge(
		$p,
		array(
			'ink'         => $ink,
			'elevated'    => $elevated,
			'modalHover'  => openstation_brand_contrast( $ink, $hover ) >= 4.5 ? $hover : openstation_brand_mix( $p['surface'], $lift, 0.16 ),
			'border'      => openstation_brand_mix( $p['surface'], $ink, 0.3 ),
			'muted'       => openstation_brand_readable( openstation_brand_mix( $ink, $p['surface'], 0.24 ), $p['surface'] ),
			'canvasInk'   => openstation_brand_readable( $p['text'], $p['canvas'] ),
			'canvasDepth' => openstation_brand_mix( $p['canvas'], openstation_brand_contrast( '#000000', $p['canvas'] ) >= openstation_brand_contrast( '#ffffff', $p['canvas'] ) ? '#ffffff' : '#000000', 0.12 ),
			'desktopInk'  => $backdrop && openstation_brand_contrast( '#000000', $p['canvas'] ) >= openstation_brand_contrast( '#ffffff', $p['canvas'] ) ? '#000000' : '#ffffff',
			'canvasMuted' => openstation_brand_readable( openstation_brand_mix( $p['text'], $p['canvas'], 0.24 ), $p['canvas'] ),
			'accentInk'   => openstation_brand_readable( '#ffffff', $p['primary'] ),
			'link'        => openstation_brand_readable( $p['primary'], $p['surface'] ),
			'dim'         => openstation_brand_mix( $p['primary'], $p['canvas'], 0.18 ),
			'dangerHover' => openstation_brand_mix( $p['danger'], $ink, 0.15 ),
		)
	);
	foreach ( $p as $role => $color ) {
		$colors[ $role . 'Tint' ] = openstation_brand_mix( $color, '#ffffff', 0.72 );
		$colors[ $role . 'Text' ] = openstation_brand_readable( $color, $p['surface'] );
	}
	$colors['dangerInk'] = openstation_brand_readable( '#ffffff', $colors['dangerText'] );
	foreach ( $colors as $name => $color ) {
		$colors[ $name . 'Rgb' ] = implode( ', ', openstation_brand_channels( $color ) );
	}
	$dock_contrast          = openstation_brand_contrast( '#000000', $canvas ) >= openstation_brand_contrast( '#ffffff', $canvas ) ? '#000000' : '#ffffff';
	$dock                   = openstation_brand_mix( $canvas, $dock_contrast, 0.18 );
	$dock_paint             = openstation_brand_mix( $canvas, $dock, $glass['dock'] / 100 );
	$widget_paint           = openstation_brand_mix( $canvas, $surface, $glass['widgets'] / 100 );
	$widget_depth           = openstation_brand_mix( $colors['canvasDepth'], $surface, $glass['widgets'] / 100 );
	$colors['dockGlass']    = 'rgba(' . implode( ', ', openstation_brand_channels( $dock ) ) . ', ' . ( $glass['dock'] / 100 ) . ')';
	$colors['dockInk']      = openstation_brand_readable( $colors['canvasInk'], $dock_paint );
	$colors['dockBorder']   = openstation_brand_mix( $canvas, $dock_contrast, 0.45 );
	$colors['widgetGlass']  = 'rgba(' . implode( ', ', openstation_brand_channels( $surface ) ) . ', ' . ( $glass['widgets'] / 100 ) . ')';
	$colors['widgetInk']    = openstation_brand_readable( $p['text'], $widget_paint, $widget_depth );
	$colors['widgetMuted']  = openstation_brand_readable( openstation_brand_mix( $colors['widgetInk'], $widget_paint, 0.24 ), $widget_paint, $widget_depth );
	$colors['widgetInkRgb'] = implode( ', ', openstation_brand_channels( $colors['widgetInk'] ) );
	$replacements           = array();
	foreach ( $colors as $name => $color ) {
		$replacements[ '{' . $name . '}' ] = $color;
	}
	$recipe = openstation_brand_studio_recipe();
	$out    = array();
	foreach ( $recipe['tokens'] as $token => $template ) {
		$out[ $token ] = strtr( $template, $replacements );
	}
	foreach ( array( '--os-font', '--os-titlebar-font', '--os-ui-font' ) as $token ) {
		$out[ $token ] = $recipe['fonts'][ openstation_sanitize_brand_font( $font ) ];
	}
	return $out;
}

/**
 * Select a shipped font stack; arbitrary CSS and external URLs are rejected.
 *
 * @internal
 * @param mixed $raw Candidate font identifier.
 * @return string Known identifier.
 */
function openstation_sanitize_brand_font( $raw ) {
	$recipe = openstation_brand_studio_recipe();
	return is_string( $raw ) && isset( $recipe['fonts'][ $raw ] ) ? $raw : 'geist';
}

/** Register through the existing theme API using this site's palette. */
function openstation_register_brand_studio() {
	$settings = openstation_get_site_branding();
	openstation_register_desktop_theme(
		'openstation/brand-studio',
		array(
			'name'        => __( 'Brand Studio', 'desktop-mode' ),
			'version'     => '1.0.0',
			'author'      => 'OpenStation',
			'description' => __( 'Your brand, across the station. Ten colours, calculated shades and live previews.', 'desktop-mode' ),
			'preview'     => OPENSTATION_URL . 'assets/desktop-themes/brand-studio/preview.svg',
			'tokens'      => openstation_brand_studio_tokens( $settings['brandPalette'], true, $settings['brandFont'], $settings['brandOpacity'] ),
		)
	);
}

/**
 * Sanitize independent glass strengths, keeping zero as a valid value.
 *
 * @internal
 * @param mixed $raw Candidate percentage map.
 * @param array $fallback Previous values for absent or invalid fields.
 * @return array Known integer percentages.
 */
function openstation_sanitize_brand_opacity( $raw, $fallback = array() ) {
	$recipe = openstation_brand_studio_recipe();
	$out    = array();
	foreach ( $recipe['opacityDefaults'] as $key => $default ) {
		$value       = is_array( $raw ) ? ( $raw[ $key ] ?? null ) : null;
		$out[ $key ] = ( is_int( $value ) || is_float( $value ) ) && is_finite( (float) $value )
			? (int) round( max( 0, min( 100, $value ) ) ) : ( $fallback[ $key ] ?? $default );
	}
	return $out;
}

/**
 * Resolve a sanitized alpha colour over an opaque foundation.
 *
 * @internal
 * @param string $color RGB or RGBA hex.
 * @param string $background Opaque RGB hex.
 * @return string Opaque result.
 */
function openstation_brand_composite( $color, $background ) {
	$length = strlen( $color );
	$alpha  = 9 === $length ? hexdec( substr( $color, 7, 2 ) ) / 255 : 1;
	return openstation_brand_mix( $background, $color, $alpha );
}
