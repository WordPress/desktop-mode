import { afterEach, describe, expect, it, vi } from 'vitest';
import { _resetAllSharedStoresForTests } from '../../src/shared-store';
import { beginTrashChange, projectTrash, trashChanges, trashItem, watchTrashChanges } from '../../src/desktop-files/trash-optimistic';

afterEach( () => _resetAllSharedStoresForTests() );
const post = () => trashItem( { id: 5, type: 'post', title: 'Alpha', deleted_at: '2026-09-09T10:00:00Z' } );

describe( 'optimistic trash overlay', () => {
	it( 'adds immediately, deduplicates server echoes, and rolls back without changing server data', async () => {
		const repaint = vi.fn();
		watchTrashChanges( repaint );
		const operation = beginTrashChange( post() )!;
		expect( repaint ).toHaveBeenCalledTimes( 1 );
		expect( projectTrash( [], 0 ).items ).toEqual( [ post() ] );
		expect( projectTrash( [ post() ], 1 ).total ).toBe( 1 );
		expect( beginTrashChange( post() ) ).toBeNull();
		await operation.finish( false );
		expect( projectTrash( [], 0 ) ).toEqual( { items: [], total: 0 } );
	} );

	it( 'keeps successful rows until every open consumer has fetched fresh data', async () => {
		let answer!: () => void;
		watchTrashChanges( () => {}, () => new Promise< void >( ( resolve ) => { answer = resolve; } ) );
		const operation = beginTrashChange( post() )!;
		const settled = operation.finish( true );
		expect( projectTrash( [], 0 ).items ).toHaveLength( 1 );
		answer();
		await settled;
		expect( trashChanges() ).toEqual( [] );
	} );

	it( 'rolls back only the failed member of a mixed-type batch', async () => {
		const first = beginTrashChange( post() )!;
		const comment = trashItem( { id: 5, type: 'comment', title: 'Comment' } );
		beginTrashChange( comment );
		await first.finish( false );
		expect( projectTrash( [], 0 ).items ).toEqual( [ comment ] );
	} );

	it( 'respects type/search filters and removes rows immediately on restore', async () => {
		beginTrashChange( post() );
		expect( projectTrash( [], 0, 'comment' ).items ).toEqual( [] );
		expect( projectTrash( [], 0, '', 'alp' ).items ).toHaveLength( 1 );
		expect( projectTrash( [], 0, '', 'beta' ).items ).toHaveLength( 0 );
		const folder = trashItem( { id: 8, type: 'folder', title: 'Folder' } );
		const operation = beginTrashChange( folder, 'out' )!;
		expect( projectTrash( [ folder ], 1, 'desktop' ).items ).toEqual( [] );
		await operation.finish( false );
		expect( projectTrash( [ folder ], 1, 'desktop' ).items ).toEqual( [ folder ] );
	} );

	it( 'an older completion cannot erase an Undo started during reconciliation', async () => {
		let answer!: () => void;
		const unwatch = watchTrashChanges( () => {}, () => new Promise< void >( ( resolve ) => { answer = resolve; } ) );
		const first = beginTrashChange( post() )!;
		const settled = first.finish( true );
		const undo = beginTrashChange( post(), 'out' )!;
		answer();
		await settled;
		expect( trashChanges()[ 0 ].direction ).toBe( 'out' );
		unwatch();
		await undo.finish( true );
		expect( trashChanges() ).toEqual( [] );
	} );
} );
