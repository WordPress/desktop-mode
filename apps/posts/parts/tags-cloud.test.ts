import { describe, expect, it, vi } from 'vitest';
import { mountTagsCloud } from './tags-cloud';
import type { CanvasEnv } from './app';
import type { TermCanvasHooks } from './canvas/term-canvas';
import type { TagBox } from './cloud-chips';
type PointerHandler = ( event: unknown ) => void;
const mock = vi.hoisted( () => ( { create: vi.fn(), box: null as TagBox | null, events: new Map< string, PointerHandler >() } ) );
vi.mock( './canvas/term-canvas', () => ( { createTermCanvas: mock.create } ) );
vi.mock( './cloud-sidebar', () => ( { paintSidebar: vi.fn() } ) );
vi.mock( './cloud-chips', () => ( {
	createTagChip: () => ( { container: { on: ( key: string, callback: ( e: unknown ) => void ) => mock.events.set( key, callback ) } } ),
	layoutTagChip: ( box: TagBox ) => {
		mock.box = box; box.width = 100; box.height = 40;
	},
	paintTagChip: vi.fn(), tagTone: () => 0,
} ) );
describe( 'tag drag cancellation', () => {
	it( 'restores the original layout when a second touch cancels a drag and never saves the cancelled drop', async () => {
		let hooks!: TermCanvasHooks;
		const closeFocus = vi.fn();
		mock.create.mockResolvedValue( {
			terms: [ { id: 1, name: 'Design', slug: 'design', count: 3, parent: 0 } ],
			layers: { chip: {} }, pixi: {}, world: {}, palette: {},
			fan: { focusId: null, closeFocus }, interaction: { pinchUntil: 0 },
			camera: { stageToWorld: ( point: unknown ) => point },
			chrome: { buttons: [ new EventTarget(), new EventTarget(), new EventTarget() ] },
			syncEmptyHint: vi.fn(), start: ( value: TermCanvasHooks ) => {
				hooks = value;
			}, teardown: vi.fn(),
		} );
		const dispose = await mountTagsCloud( document.createElement( 'div' ), { client: { fetchTagCooccurrence: async () => new Map() } } as unknown as CanvasEnv );
		const box = mock.box!;
		const original = { x: box.tx, y: box.ty };
		mock.events.get( 'pointerdown' )!( { global: { x: box.x, y: box.y }, stopPropagation: vi.fn() } );
		hooks.pointerMove( {} as never, { x: original.x + 200, y: original.y + 100 } );
		expect( box.tx ).toBe( original.x + 200 );
		const before = localStorage.length;
		hooks.cancelGesture();
		expect( [ box.x, box.y, box.tx, box.ty ] ).toEqual( [ original.x, original.y, original.x, original.y ] );
		expect( hooks.dragging() ).toBe( false );
		await hooks.pointerUp();
		expect( localStorage.length ).toBe( before ); expect( closeFocus ).not.toHaveBeenCalled();
		dispose();
	} );
} );
