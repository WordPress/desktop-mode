<?php
/** Brand Studio's bounded AI proposal contract. @package OpenStation */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/brand-ai-instructions.php';

/**
 * Structured output describes settings, never CSS or executable instructions.
 *
 * @return array JSON schema.
 */
function openstation_brand_ai_schema() {
	$recipe       = openstation_brand_studio_recipe();
	$colors       = array();
	$descriptions = openstation_brand_ai_role_descriptions();
	foreach ( $recipe['defaults'] as $role => $value ) {
		$colors[ $role ] = array(
			'description' => $descriptions[ $role ] . ' Accepts #RRGGBB or #RRGGBBAA, with optional alpha in the last pair (00 transparent, FF opaque).',
			'type'        => 'string',
			'pattern'     => '^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$',
		);
	}
	return openstation_ai_normalize_response_schema(
		array(
			'type'       => 'object',
			'properties' => array(
				'name'         => array(
					'type'      => 'string',
					'minLength' => 1,
					'maxLength' => 80,
				),
				'rationale'    => array(
					'type'      => 'string',
					'maxLength' => 1600,
				),
				'brandPalette' => array(
					'type'       => 'object',
					'properties' => $colors,
				),
				'brandFont'    => array(
					'type' => 'string',
					'enum' => array_keys( $recipe['fonts'] ),
				),
				'brandOpacity' => array(
					'type'       => 'object',
					'properties' => array(
						'widgets' => array(
							'description' => 'Widget background opacity percent: 0 transparent, 100 opaque. Text and icons remain opaque.',
							'type'        => 'integer',
							'minimum'     => 0,
							'maximum'     => 100,
						),
						'dock'    => array(
							'description' => 'Dock background opacity percent: 0 transparent, 100 opaque. Navigation remains distinct from the wallpaper.',
							'type'        => 'integer',
							'minimum'     => 0,
							'maximum'     => 100,
						),
					),
				),
				'sources'      => array(
					'type'     => 'array',
					'maxItems' => 5,
					'items'    => array(
						'type'       => 'object',
						'properties' => array(
							'title' => array(
								'type'      => 'string',
								'maxLength' => 120,
							),
							'url'   => array(
								'type'      => 'string',
								'maxLength' => 2048,
							),
						),
					),
				),
			),
		)
	);
}

/**
 * Reject incomplete output; never turn a broken proposal into the default brand.
 *
 * @param mixed $raw Decoded model response.
 * @return array|WP_Error Safe review data.
 */
function openstation_brand_ai_validate( $raw ) {
	// Display metadata must not reject an otherwise complete, safe palette.
	if ( is_array( $raw ) ) {
		$raw['rationale'] = ''; // Retained in responses for existing consumers.
		if ( ! isset( $raw['name'] ) ) {
			$raw['name'] = __( 'Brand proposal', 'desktop-mode' );
		} elseif ( is_string( $raw['name'] ) ) {
			$raw['name'] = mb_substr( sanitize_text_field( $raw['name'] ), 0, 80 );
		}
		$raw['sources'] = $raw['sources'] ?? array();
	}
	$valid = rest_validate_value_from_schema( $raw, openstation_brand_ai_schema(), 'proposal' );
	if ( is_wp_error( $valid ) ) {
		return new WP_Error(
			'openstation_brand_ai_invalid',
			__( 'The assistant could not produce all ten valid colours, a supported font and both opacity values. Please try again.', 'desktop-mode' ),
			array(
				'status'     => 502,
				'validation' => $valid->get_error_message(),
			)
		);
	}
	$sources = array();
	foreach ( $raw['sources'] as $source ) {
		$url = esc_url_raw( $source['url'], array( 'https', 'http' ) );
		if ( $url && wp_parse_url( $url, PHP_URL_HOST ) ) {
			$sources[] = array(
				'title' => sanitize_text_field( $source['title'] ),
				'url'   => $url,
			);
		}
	}
	return array(
		'name'         => sanitize_text_field( $raw['name'] ),
		'rationale'    => sanitize_textarea_field( $raw['rationale'] ),
		'brandPalette' => openstation_sanitize_brand_palette( $raw['brandPalette'] ),
		'brandFont'    => openstation_sanitize_brand_font( $raw['brandFont'] ),
		'brandOpacity' => openstation_sanitize_brand_opacity( $raw['brandOpacity'] ),
		'sources'      => $sources,
	);
}

/**
 * Provider-compatible schema; the full schema still validates the final answer.
 * Anthropic omits numeric bounds, string lengths and array upper bounds.
 *
 * @param array|null $schema Schema subtree, or null for the proposal root.
 * @return array Structural schema with unsupported constraints omitted.
 */
function openstation_brand_ai_provider_schema( $schema = null ) {
	if ( null === $schema ) {
		$schema = openstation_brand_ai_schema();
		unset( $schema['properties']['rationale'] );
		$schema['required'] = array_values( array_diff( $schema['required'], array( 'rationale' ) ) );
	}
	foreach ( array( 'minimum', 'maximum', 'minLength', 'maxLength', 'maxItems' ) as $constraint ) {
		unset( $schema[ $constraint ] );
	}
	foreach ( $schema as $key => $value ) {
		if ( is_array( $value ) ) {
			$schema[ $key ] = openstation_brand_ai_provider_schema( $value );
		}
	}
	return $schema;
}

/**
 * Retry malformed structured output once, without repeating web research or saving settings.
 *
 * @param callable $generate Generates JSON text from bounded validation feedback.
 * @return array|WP_Error Validated settings or provider/validation failure.
 */
function openstation_brand_ai_complete_proposal( callable $generate ) {
	$feedback = '';
	for ( $attempt = 0; $attempt < 2; ++$attempt ) {
		$result = $generate( $feedback );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$proposal = openstation_brand_ai_validate( is_string( $result ) ? json_decode( $result, true ) : null );
		if ( ! is_wp_error( $proposal ) ) {
			return $proposal;
		}
		$feedback = ' Your previous response failed validation. Generate a fresh complete object that matches the schema. Validation: ' . mb_substr( $proposal->get_error_data()['validation'], 0, 600 );
	}
	return $proposal;
}
