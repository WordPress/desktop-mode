/**
 * The question a shell asks once, after a switch from another install
 * arrived with a login token while this user was logged in and no
 * account is linked to it yet: link the two, so that from now on a
 * switch from there logs this user in?
 *
 * The answer is what makes the link trustworthy. A token can only name
 * the account it was minted for, on the install that minted it; who
 * holds an account HERE is proven by being logged in here and saying
 * yes from that session, through a nonced request. An email match
 * proves nothing, since an email is editable over there. See
 * `includes/network/hop.php`.
 */

import type { DesktopConfig } from '../types';
import { __ } from '../i18n';
import { trackedFetch } from '../tracked-fetch';

export type LinkOffer = NonNullable< DesktopConfig[ 'hopLinkOffer' ] >;

export interface LinkOfferDeps {
	/** The confirm dialog; resolves to the user's answer. */
	confirm: ( options: { title: string; message: string; confirmLabel: string } ) => Promise< boolean >;
	/** Records the answer on the route the offer names. */
	post: ( url: string, accept: boolean ) => Promise< unknown >;
}

/** The request that records an answer on the link route, nonce attached. */
export function createLinkPoster( restNonce: string ): LinkOfferDeps[ 'post' ] {
	return ( url, accept ) =>
		trackedFetch(
			url,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': restNonce,
				},
				body: JSON.stringify( { accept } ),
			},
			{ source: 'desktop-mode/network' },
		);
}

/**
 * Ask, then record the answer either way: a yes links, a no is
 * remembered so the same account is not offered again. A failed
 * request is not retried; the offer expires on its own.
 */
export async function offerAccountLink(
	offer: LinkOffer,
	deps: LinkOfferDeps,
): Promise< boolean > {
	const who = offer.email ? `${ offer.name } (${ offer.email })` : offer.name;
	const accept = await deps.confirm( {
		title: __( 'Arrive logged in next time?' ),
		// translators: %1$s: who arrived (name and email); %2$s: the site they came from.
		message: __(
			'%1$s just switched here from %2$s while you were logged in. Link that account to yours, and a switch from there logs you in as you. You can undo this in the Network window.',
		)
			.replace( '%1$s', who )
			.replace( '%2$s', offer.site ),
		confirmLabel: __( 'Link accounts' ),
	} );
	try {
		await deps.post( offer.url, accept );
	} catch {
		// The offer expires on its own; nothing to undo.
	}
	return accept;
}
