<?php
/**
 * Installed Plugins view preference, stored per user through the app host.
 *
 * @package OpenStation
 */

namespace OpenStation\Apps\Plugins;

use OpenStation\App\Os;
use OpenStation\App\State;

if ( ! defined( 'ABSPATH' ) ) {
	defined( 'OPENSTATION_STANDALONE' ) || exit;
}

/**
 * Restore the user's layout on mount and retain the requested tab.
 *
 * @param State $state State.
 * @param Os    $os    Host handle.
 */
function mount_plugins( State $state, Os $os ) {
	$view = $os->stored( 'installed-view', 'cards' );
	$state->set( 'installedView', in_array( $view, array( 'cards', 'table' ), true ) ? $view : 'cards' );
	apply_tab( $state, $os );
}

/**
 * Validate and save an explicit view choice for the current user.
 *
 * @param State $state State.
 * @param Os    $os    Host handle.
 * @param array $args  Action arguments.
 * @throws \InvalidArgumentException When the requested view is unsupported.
 */
function save_installed_view( State $state, Os $os, array $args ) {
	$view = $args['view'] ?? '';
	if ( ! in_array( $view, array( 'cards', 'table' ), true ) ) {
		throw new \InvalidArgumentException( esc_html__( 'Choose Cards or Table.', 'desktop-mode' ) );
	}
	$os->store( 'installed-view', $view );
	$state->set( 'installedView', $view );
}
