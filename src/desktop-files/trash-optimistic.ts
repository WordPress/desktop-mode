/**
 * In-flight trash gestures shared by the shell, Trash and WP Explorer.
 *
 * This is a presentation overlay, never server truth. Confirmed content
 * broadcasts keep their existing meaning. Successful overlays stay visible
 * until mounted consumers have refreshed; failed ones roll back immediately.
 */
import { createSharedStore } from '../shared-store';
import type { RecycleBinItem } from '../../apps/trash/parts/types';
import type { RestPlacementShape } from './rest';

export interface TrashChange {
	item: RecycleBinItem;
	direction: 'in' | 'out';
	pending: boolean;
}

const store = createSharedStore( 'openstation/trash-optimistic', () => ( {
	changes: new Map< string, TrashChange >(),
	reconcile: new Set<() => Promise< unknown > >(),
} ) );

export const trashKey = ( item: { type: string; id: number } ): string => `${ item.type }:${ item.id }`;

/** Minimal known facts; permissions are withheld until the server confirms. */
export function trashItem( facts: Pick< RecycleBinItem, 'id' | 'type' | 'title' > & Partial< RecycleBinItem > ): RecycleBinItem {
	return {
		subtitle: '', mime: '', preview: '', icon: '',
		deleted_at: new Date().toISOString(), deleted_by: '', deleted_by_id: 0,
		can_restore: false, can_purge: false, edit_link: '',
		...facts,
	};
}

/** A placement trashes its reference, not the underlying WordPress entity. */
export function placementTrashItem( placement: RestPlacementShape ): RecycleBinItem {
	const file = placement.file;
	const type = file.type === 'shortcut' ? 'shortcut' : 'placement';
	return trashItem( {
		id: file.type === 'folder' ? Number( file.ref ) : placement.id,
		type: file.type === 'folder' ? 'folder' : type,
		title: file.title,
		icon: file.icon,
		preview: file.previewUrl,
	} );
}

export function trashChanges(): TrashChange[] {
	return Array.from( store.state.changes.values() );
}

/** Repaint immediately; reconcile only after a mutation has succeeded. */
export function watchTrashChanges( repaint: () => void, reconcile?: () => Promise< unknown > ): () => void {
	const unsubscribe = store.subscribe( repaint );
	if ( reconcile ) {
		store.state.reconcile.add( reconcile );
	}
	return () => {
		unsubscribe();
		if ( reconcile ) {
			store.state.reconcile.delete( reconcile );
		}
	};
}

/**
 * Reserve one item so a second gesture cannot send a duplicate mutation.
 * finish(false) rolls back synchronously. finish(true) hands off to fresh
 * server data before removing the overlay. Identity checks protect a later
 * operation on the same item from an older completion.
 */
export function beginTrashChange( item: RecycleBinItem, direction: 'in' | 'out' = 'in' ): { finish: ( ok: boolean ) => Promise< void > } | null {
	const key = trashKey( item );
	if ( store.state.changes.get( key )?.pending ) {
		return null;
	}
	const change: TrashChange = { item, direction, pending: true };
	store.state.changes.set( key, change );
	store.notify();
	return {
		async finish( ok ) {
			if ( store.state.changes.get( key ) !== change || ! change.pending ) {
				return;
			}
			change.pending = false;
			if ( ok ) {
				store.notify();
				await Promise.allSettled( Array.from( store.state.reconcile, async ( refresh ) => refresh() ) );
			}
			if ( store.state.changes.get( key ) === change ) {
				store.state.changes.delete( key );
				store.notify();
			}
		},
	};
}

/** Merge incoming rows and hide outgoing rows without mutating a snapshot. */
export function projectTrash( items: RecycleBinItem[], total: number, filter = '', search = '' ): { items: RecycleBinItem[]; total: number } {
	const rows = new Map( items.map( ( item ) => [ trashKey( item ), item ] ) );
	let count = total;
	for ( const { item, direction } of trashChanges() ) {
		const key = trashKey( item );
		if ( direction === 'out' ) {
			if ( rows.delete( key ) ) {
				count--;
			}
			continue;
		}
		const matches = ( ! filter || filter === item.type ||
			( filter === 'desktop' && [ 'placement', 'shortcut', 'folder' ].includes( item.type ) ) ) &&
			( ! search || `${ item.title } ${ item.subtitle }`.toLocaleLowerCase().includes( search.toLocaleLowerCase() ) );
		if ( ! rows.has( key ) ) {
			count++;
		}
		if ( matches ) {
			// Keep pending rows inert even if a background refresh sees them.
			rows.set( key, { ...( rows.get( key ) ?? item ), can_restore: false, can_purge: false } );
		}
	}
	return { items: Array.from( rows.values() ), total: Math.max( 0, count ) };
}
