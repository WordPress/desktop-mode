<?php
/**
 * OpenStation — Network bootstrap.
 *
 * Loads the OpenStation Network module: the keypair, the identity
 * route, the registry, the hub's list route, the member's join and
 * refresh, and the hop token that logs a user in on arrival at another
 * install. The Network window (`apps/network/`) checks the same switch
 * and stays out of the app registry while it is off.
 *
 * The whole module is gated on the site-wide `network` extended option
 * (OpenStation Preferences → Features → Extended options, admins
 * only), which is OFF by default — the network is opt-in. While the
 * option is off none of the module files load: no keypair is minted,
 * no REST route registered, no cron scheduled, no token minted or
 * spent, no window offered, and the switcher a multisite has on its
 * own stays exactly as it is. The module costs nothing beyond the
 * option read below. Pairings already made are options that survive
 * a disable and are back when the option is on again.
 *
 * Loading is deferred to `plugins_loaded` (priority 5) so any regular
 * plugin can hook the `openstation_network_enabled` filter in time to
 * influence the decision. New `require_once` lines belong in the
 * loader below so the rest of the codebase keeps loading the feature
 * through one entry point.
 *
 * @package OpenStation
 */

defined( 'ABSPATH' ) || exit;

/**
 * The token's query arg on the target's shell screen. Defined here,
 * not in the hop module, because the shell screen strips and reads
 * these boot args whether or not the module loaded.
 */
const OPENSTATION_NETWORK_HOP_ARG = 'openstation_hop';

/** The slide direction the target lands with, after the token is spent. */
const OPENSTATION_NETWORK_HOP_FROM_ARG = 'openstation_hop_from';

/**
 * Whether the OpenStation Network is enabled site-wide.
 *
 * Backed by the `network` key of the extended options bundle
 * (`openstation_get_extended_options()`), default off — opt-in.
 *
 * @return bool
 */
function openstation_network_enabled() {
	$options = openstation_get_extended_options();
	$enabled = ! empty( $options['network'] );

	/**
	 * Filters whether the OpenStation Network is enabled site-wide.
	 *
	 * Runs on `plugins_loaded` (priority 5) to decide whether the
	 * network module loads at all, and again at runtime wherever the
	 * enabled state is consulted (the switcher's payload, the shell
	 * config).
	 *
	 * @param bool $enabled Whether the network is enabled.
	 */
	return (bool) apply_filters( 'openstation_network_enabled', $enabled );
}

/**
 * Loads the network module when the network is enabled.
 *
 * @access private
 */
function openstation_network_load() {
	if ( ! openstation_network_enabled() ) {
		return;
	}

	require_once OPENSTATION_DIR . 'includes/network/keys.php';
	require_once OPENSTATION_DIR . 'includes/network/identity.php';
	require_once OPENSTATION_DIR . 'includes/network/registry.php';
	require_once OPENSTATION_DIR . 'includes/network/hub.php';
	require_once OPENSTATION_DIR . 'includes/network/member.php';
	require_once OPENSTATION_DIR . 'includes/network/hop.php';
}
add_action( 'plugins_loaded', 'openstation_network_load', 5 );
