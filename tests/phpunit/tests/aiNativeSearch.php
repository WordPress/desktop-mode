<?php
/**
 * Tests for the AI assistant's native-keyword content search.
 *
 * The `search_posts` / `search_pages` / `search_comments` /
 * `search_comments_by_post` tools run WordPress's native search
 * (`WP_Query` `s=` / `get_comments` `search=`) instead of filtering on the
 * `_desktop_mode_ai_analysis` meta. These tests prove content that was
 * NEVER AI-analyzed is still findable, and that the keyword actually
 * filters the result set.
 *
 * The dispatcher is a pure DB query — no OpenAI call — so it runs offline.
 *
 * @package WordPress
 * @subpackage UnitTests
 *
 * @group openstation
 * @group os-ai
 */
class Tests_OpenStation_AiNativeSearch extends WP_UnitTestCase {

	/**
	 * A published post with no analysis meta is found by a title keyword.
	 *
	 * @covers ::openstation_ai_search_dispatch_tool
	 * @covers ::openstation_ai_search_fetch_posts
	 */
	public function test_search_posts_finds_unanalyzed_post_by_keyword() {
		$post_id = self::factory()->post->create(
			array(
				'post_status'  => 'publish',
				'post_title'   => 'How to cook paella',
				'post_content' => 'A Valencian rice dish with saffron and rabbit.',
			)
		);

		// Sanity: the post carries no AI analysis meta.
		$this->assertSame(
			'',
			get_post_meta( $post_id, OPENSTATION_AI_META_KEY, true ),
			'Fixture must have no analysis meta — that is the whole point.'
		);

		$result = openstation_ai_search_dispatch_tool(
			'search_posts',
			array( 'query' => 'paella', 'offset' => 0 )
		);

		$ids = wp_list_pluck( $result['items'], 'id' );
		$this->assertContains( $post_id, $ids, 'Keyword search should find the unanalyzed post.' );

		// The model-facing payload exposes a real excerpt, not a precomputed summary.
		$match = $result['items'][ array_search( $post_id, $ids, true ) ];
		$this->assertArrayHasKey( 'excerpt', $match );
		$this->assertArrayNotHasKey( 'ai_summary', $match );
	}

	/**
	 * A keyword that matches nothing returns an empty, well-formed batch.
	 *
	 * @covers ::openstation_ai_search_fetch_posts
	 */
	public function test_search_posts_keyword_excludes_non_matches() {
		self::factory()->post->create(
			array(
				'post_status'  => 'publish',
				'post_title'   => 'Tomato soup',
				'post_content' => 'Roasted tomatoes, basil, cream.',
			)
		);

		$result = openstation_ai_search_dispatch_tool(
			'search_posts',
			array( 'query' => 'paella', 'offset' => 0 )
		);

		$this->assertSame( 0, $result['count'], 'A non-matching keyword should return no items.' );
		$this->assertFalse( $result['has_more'] );
	}

	/**
	 * Comments are found by their text with native comment search, with no
	 * analysis meta present.
	 *
	 * @covers ::openstation_ai_search_fetch_comments
	 */
	public function test_search_comments_finds_unanalyzed_comment_by_keyword() {
		$post_id    = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $post_id,
				'comment_approved' => '1',
				'comment_content'  => 'Loved the Alcazaba at sunset, magical views.',
			)
		);

		$result = openstation_ai_search_dispatch_tool(
			'search_comments',
			array( 'query' => 'Alcazaba', 'offset' => 0 )
		);

		$ids = wp_list_pluck( $result['items'], 'id' );
		$this->assertContains( $comment_id, $ids, 'Keyword search should find the unanalyzed comment.' );
	}

	/**
	 * `search_comments_by_post` scopes results to the given post.
	 *
	 * @covers ::openstation_ai_search_fetch_comments_by_post
	 */
	public function test_search_comments_by_post_is_scoped_to_the_post() {
		$post_a = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$post_b = self::factory()->post->create( array( 'post_status' => 'publish' ) );

		$on_a = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $post_a,
				'comment_approved' => '1',
				'comment_content'  => 'Question about the night tour please.',
			)
		);
		self::factory()->comment->create(
			array(
				'comment_post_ID'  => $post_b,
				'comment_approved' => '1',
				'comment_content'  => 'Another question about the night tour.',
			)
		);

		$result = openstation_ai_search_dispatch_tool(
			'search_comments_by_post',
			array( 'post_id' => $post_a, 'query' => 'night tour', 'offset' => 0 )
		);

		$ids = wp_list_pluck( $result['items'], 'id' );
		$this->assertContains( $on_a, $ids );
		$this->assertCount( 1, $ids, 'Only the target post\'s comments should be returned.' );
	}

	/**
	 * The entity-detail builder no longer requires analysis meta — a plain
	 * published post resolves to a full record built from core fields.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_works_without_analysis_meta() {
		$post_id = self::factory()->post->create(
			array( 'post_status' => 'publish', 'post_title' => 'Plain post' )
		);

		$entity = openstation_ai_search_build_entity( 'post', $post_id );

		$this->assertIsArray( $entity );
		$this->assertSame( $post_id, $entity['id'] );
		$this->assertSame( 'Plain post', $entity['title'] );
		$this->assertArrayHasKey( 'excerpt', $entity );
		$this->assertArrayNotHasKey( 'ai_summary', $entity );
	}

	/**
	 * The continue label names the entity, once.
	 *
	 * The noun used to be built from the tool slug, which is already
	 * plural, so the button read "Continue searching in postss".
	 *
	 * @covers ::openstation_ai_continue_label
	 */
	public function test_continue_label_names_the_entity() {
		$this->assertSame(
			'Continue searching in posts (from item 11)',
			openstation_ai_continue_label( 'search_posts', 11 )
		);
		$this->assertSame(
			'Continue searching in pages (from item 11)',
			openstation_ai_continue_label( 'search_pages', 11 )
		);
		$this->assertSame(
			'Continue searching in comments (from item 4)',
			openstation_ai_continue_label( 'search_comments', 4 )
		);
	}

	/**
	 * Every resumable tool gets a label of its own.
	 *
	 * The function falls back to the post wording for an unrecognised
	 * tool, so a tool added to the resumable list without a matching case
	 * would silently tell the user it is searching posts.
	 *
	 * @covers ::openstation_ai_continue_label
	 */
	public function test_every_resumable_tool_gets_its_own_continue_label() {
		$labels = array();
		foreach ( openstation_ai_search_resumable_tools() as $tool ) {
			$labels[ $tool ] = openstation_ai_continue_label( $tool, 11 );
		}

		$this->assertSame(
			count( $labels ),
			count( array_unique( $labels ) ),
			'A duplicate label means a resumable tool fell through to the default post wording.'
		);
	}

	/**
	 * A Subscriber must not read a comment on a PRIVATE post through
	 * `search_comments`. "Approved" is a moderation decision, not a grant of
	 * visibility on the parent discussion.
	 *
	 * @covers ::openstation_ai_search_fetch_comments
	 * @covers ::openstation_ai_can_read_comment_parent
	 */
	public function test_search_comments_hides_comments_on_private_posts_from_subscriber() {
		$author_id  = self::factory()->user->create( array( 'role' => 'author' ) );
		$private_id = self::factory()->post->create(
			array( 'post_status' => 'private', 'post_author' => $author_id )
		);
		$public_id  = self::factory()->post->create( array( 'post_status' => 'publish' ) );

		$hidden  = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $private_id,
				'comment_approved' => '1',
				'comment_content'  => 'Secret marker paellamarker on a private post.',
			)
		);
		$visible = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $public_id,
				'comment_approved' => '1',
				'comment_content'  => 'Public marker paellamarker on a published post.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$result = openstation_ai_search_dispatch_tool(
			'search_comments',
			array( 'query' => 'paellamarker', 'offset' => 0 )
		);

		$ids = wp_list_pluck( $result['items'], 'id' );
		$this->assertNotContains( $hidden, $ids, 'A Subscriber must not see a comment on a private post.' );
		$this->assertContains( $visible, $ids, 'A comment on a published post is still returned.' );
	}

	/**
	 * A Subscriber must not read a comment on a PASSWORD-PROTECTED post
	 * through `search_comments` — there is no way to supply the password over
	 * the ability's GET dispatch.
	 *
	 * @covers ::openstation_ai_search_fetch_comments
	 * @covers ::openstation_ai_can_read_comment_parent
	 */
	public function test_search_comments_hides_comments_on_password_posts_from_subscriber() {
		$protected_id = self::factory()->post->create(
			array( 'post_status' => 'publish', 'post_password' => 'hunter2' )
		);

		$hidden = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $protected_id,
				'comment_approved' => '1',
				'comment_content'  => 'Secret marker walledgarden behind a password.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$result = openstation_ai_search_dispatch_tool(
			'search_comments',
			array( 'query' => 'walledgarden', 'offset' => 0 )
		);

		$ids = wp_list_pluck( $result['items'], 'id' );
		$this->assertNotContains( $hidden, $ids, 'A Subscriber must not see a comment on a password-protected post.' );
	}

	/**
	 * An Administrator, who holds `read_private_posts`, still finds comments
	 * on private posts — the gate is per-caller readability, not a blanket
	 * publish-only filter.
	 *
	 * @covers ::openstation_ai_search_fetch_comments
	 * @covers ::openstation_ai_can_read_comment_parent
	 */
	public function test_search_comments_still_shows_private_comments_to_admin() {
		$private_id = self::factory()->post->create( array( 'post_status' => 'private' ) );
		$comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $private_id,
				'comment_approved' => '1',
				'comment_content'  => 'Admin-visible marker paellamarker on a private post.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$result = openstation_ai_search_dispatch_tool(
			'search_comments',
			array( 'query' => 'paellamarker', 'offset' => 0 )
		);

		$ids = wp_list_pluck( $result['items'], 'id' );
		$this->assertContains( $comment_id, $ids, 'An administrator can read comments on private posts.' );
	}

	/**
	 * `search_comments_by_post` on a private post returns nothing — and never
	 * the parent title — for a Subscriber.
	 *
	 * @covers ::openstation_ai_search_fetch_comments_by_post
	 * @covers ::openstation_ai_can_read_post
	 */
	public function test_search_comments_by_post_hides_private_post_from_subscriber() {
		$private_id = self::factory()->post->create(
			array( 'post_status' => 'private', 'post_title' => 'Secret roadmap' )
		);
		$comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $private_id,
				'comment_approved' => '1',
				'comment_content'  => 'A comment on the secret roadmap.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$result = openstation_ai_search_dispatch_tool(
			'search_comments_by_post',
			array( 'post_id' => $private_id, 'query' => '', 'offset' => 0 )
		);

		$ids = wp_list_pluck( $result['items'], 'id' );
		$this->assertNotContains( $comment_id, $ids, 'A Subscriber must not read comments on a private post.' );
		$this->assertSame( 0, $result['count'] );
		$this->assertArrayNotHasKey( 'post_title', $result, 'The private parent title must not leak.' );
	}
}
