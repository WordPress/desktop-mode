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
	 * A password-protected post is never returned — its body is content
	 * WordPress withholds behind `post_password_required()`, and `publish`
	 * is also the status of a password-protected post. It must not appear in
	 * `items`, and it must not be counted in `total` (or the counter becomes
	 * an oracle for the protected body).
	 *
	 * @covers ::openstation_ai_search_fetch_posts
	 */
	public function test_search_posts_excludes_password_protected_posts() {
		$public_id = self::factory()->post->create(
			array(
				'post_status'  => 'publish',
				'post_title'   => 'Public paella recipe',
				'post_content' => 'A Valencian rice dish, freely readable.',
			)
		);
		$secret_id = self::factory()->post->create(
			array(
				'post_status'   => 'publish',
				'post_password' => 'hunter2',
				'post_title'    => 'Secret paella recipe',
				'post_content'  => 'The paella secret nobody should read.',
			)
		);

		$result = openstation_ai_search_dispatch_tool(
			'search_posts',
			array( 'query' => 'paella', 'offset' => 0 )
		);

		$ids = wp_list_pluck( $result['items'], 'id' );
		$this->assertContains( $public_id, $ids, 'The public post should be found.' );
		$this->assertNotContains( $secret_id, $ids, 'The password-protected post must not leak its body.' );

		$this->assertSame( 1, $result['count'], 'Only the public post should be counted in the batch.' );
		$this->assertSame(
			1,
			$result['total'],
			'The protected post must not inflate total — that counter is an oracle for its contents.'
		);
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
	 * The model can name any id; a Subscriber must not read a private post
	 * through it. The entity builder re-checks authorization instead of
	 * trusting the model-supplied id.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_withholds_private_post_from_subscriber() {
		$post_id = self::factory()->post->create(
			array( 'post_status' => 'private', 'post_title' => 'Secret plans' )
		);

		$subscriber = self::factory()->user->create( array( 'role' => 'subscriber' ) );
		wp_set_current_user( $subscriber );

		$this->assertNull(
			openstation_ai_search_build_entity( 'post', $post_id ),
			'A Subscriber must not read a private post through the entity builder.'
		);
	}

	/**
	 * A draft/pending/future post is equally withheld — the guard keys off
	 * read authorization, not the single `private` status.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_withholds_draft_post_from_subscriber() {
		$post_id = self::factory()->post->create(
			array( 'post_status' => 'draft', 'post_title' => 'Unpublished' )
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$this->assertNull( openstation_ai_search_build_entity( 'post', $post_id ) );
	}

	/**
	 * An administrator, who can read private content, still gets the record.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_returns_private_post_for_administrator() {
		$post_id = self::factory()->post->create(
			array( 'post_status' => 'private', 'post_title' => 'Secret plans' )
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$entity = openstation_ai_search_build_entity( 'post', $post_id );
		$this->assertIsArray( $entity );
		$this->assertSame( 'private', $entity['status'] );
		$this->assertSame( 'Secret plans', $entity['title'] );
	}

	/**
	 * A model-named id resolving to a non-public CPT row is withheld even
	 * though its status is `publish` — the branch pins the actual post type
	 * to post/page, because `read_post` on a `publish` status maps to plain
	 * `read`, which every logged-in user holds.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_withholds_non_public_cpt_row() {
		register_post_type( 'os_secret_cpt', array( 'public' => false ) );
		$post_id = self::factory()->post->create(
			array(
				'post_type'    => 'os_secret_cpt',
				'post_status'  => 'publish',
				'post_title'   => 'Internal record',
				'post_content' => 'Plugin-private data.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$this->assertNull(
			openstation_ai_search_build_entity( 'post', $post_id ),
			'A non-public CPT row must not be readable through the entity builder.'
		);

		_unregister_post_type( 'os_secret_cpt' );
	}

	/**
	 * An unapproved comment (its content and moderation verdicts) is
	 * withheld from a Subscriber.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_withholds_unapproved_comment_from_subscriber() {
		$post_id    = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $post_id,
				'comment_approved' => '0',
				'comment_content'  => 'Pending moderation.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$this->assertNull(
			openstation_ai_search_build_entity( 'comment', $comment_id ),
			'A Subscriber must not read an unapproved comment through the entity builder.'
		);
	}

	/**
	 * A non-moderator viewing an approved comment gets the public record but
	 * neither the moderation verdicts nor the wp-admin edit link.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_suppresses_moderation_fields_for_non_moderator() {
		$post_id    = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $post_id,
				'comment_approved' => '1',
				'comment_content'  => 'Great write-up.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$entity = openstation_ai_search_build_entity( 'comment', $comment_id );
		$this->assertIsArray( $entity );
		$this->assertArrayNotHasKey( 'harmful', $entity, 'Verdicts are moderator-only.' );
		$this->assertArrayNotHasKey( 'spam', $entity, 'Verdicts are moderator-only.' );
		$this->assertSame( '', $entity['edit_url'], 'The edit link needs edit_comment.' );
	}

	/**
	 * A moderator viewing an approved comment still sees the verdicts and
	 * the edit link — the gate withholds nothing they are entitled to.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_exposes_moderation_fields_to_moderator() {
		$post_id    = self::factory()->post->create( array( 'post_status' => 'publish' ) );
		$comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $post_id,
				'comment_approved' => '1',
				'comment_content'  => 'Great write-up.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$entity = openstation_ai_search_build_entity( 'comment', $comment_id );
		$this->assertIsArray( $entity );
		$this->assertArrayHasKey( 'harmful', $entity );
		$this->assertArrayHasKey( 'spam', $entity );
		$this->assertNotSame( '', $entity['edit_url'] );
	}

	/**
	 * A published post is publicly viewable even when it carries a password,
	 * and every logged-in user passes `read_post` on it — so the password
	 * gate has to be asked separately or the body leaks in the excerpt.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_withholds_password_protected_post_from_subscriber() {
		$post_id = self::factory()->post->create(
			array(
				'post_status'   => 'publish',
				'post_password' => 'hunter2',
				'post_title'    => 'Members only',
				'post_content'  => 'The members-only body.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$this->assertNull(
			openstation_ai_search_build_entity( 'post', $post_id ),
			'A Subscriber without the password must not read a protected post.'
		);
	}

	/**
	 * Being able to edit the post is the other way past the password, which
	 * is how core answers the same question.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_returns_password_protected_post_to_editor() {
		$post_id = self::factory()->post->create(
			array(
				'post_status'   => 'publish',
				'post_password' => 'hunter2',
				'post_title'    => 'Members only',
				'post_content'  => 'The members-only body.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );

		$entity = openstation_ai_search_build_entity( 'post', $post_id );
		$this->assertIsArray( $entity );
		$this->assertStringContainsString( 'members-only body', $entity['excerpt'] );
	}

	/**
	 * Approval is not publication: an approved comment outlives its post
	 * being switched to private, and the record carries the parent's title
	 * and permalink. Naming a comment id must not walk around the post gate.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_withholds_comment_on_private_parent() {
		$post_id    = self::factory()->post->create(
			array( 'post_status' => 'private', 'post_title' => 'Secret plans' )
		);
		$comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $post_id,
				'comment_approved' => '1',
				'comment_content'  => 'Looks good to me.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$this->assertNull(
			openstation_ai_search_build_entity( 'comment', $comment_id ),
			'A private parent must not leak its title through an approved comment.'
		);
	}

	/**
	 * The same comment on a draft parent, same answer — the gate keys off
	 * read authorization on the parent, not one status.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_withholds_comment_on_draft_parent() {
		$post_id    = self::factory()->post->create(
			array( 'post_status' => 'draft', 'post_title' => 'Unpublished' )
		);
		$comment_id = self::factory()->comment->create(
			array( 'comment_post_ID' => $post_id, 'comment_approved' => '1' )
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$this->assertNull( openstation_ai_search_build_entity( 'comment', $comment_id ) );
	}

	/**
	 * An administrator reads private content, so the same comment still
	 * resolves for them — the gate withholds nothing they are entitled to.
	 *
	 * @covers ::openstation_ai_search_build_entity
	 */
	public function test_build_entity_returns_comment_on_private_parent_for_administrator() {
		$post_id    = self::factory()->post->create(
			array( 'post_status' => 'private', 'post_title' => 'Secret plans' )
		);
		$comment_id = self::factory()->comment->create(
			array( 'comment_post_ID' => $post_id, 'comment_approved' => '1' )
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'administrator' ) ) );

		$entity = openstation_ai_search_build_entity( 'comment', $comment_id );
		$this->assertIsArray( $entity );
		$this->assertSame( 'Secret plans', $entity['post_title'] );
	}

	/**
	 * The search corpus is gated the same way the entity card is. Otherwise
	 * the model reads the protected body and repeats it in the answer prose,
	 * which is the same disclosure by a longer route.
	 *
	 * @covers ::openstation_ai_search_fetch_posts
	 */
	public function test_search_posts_excludes_password_protected_post_for_subscriber() {
		$post_id = self::factory()->post->create(
			array(
				'post_status'   => 'publish',
				'post_password' => 'hunter2',
				'post_title'    => 'Paella for members',
				'post_content'  => 'A Valencian rice dish with saffron and rabbit.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$result = openstation_ai_search_dispatch_tool(
			'search_posts',
			array( 'query' => 'paella', 'offset' => 0 )
		);

		$this->assertNotContains(
			$post_id,
			wp_list_pluck( $result['items'], 'id' ),
			'A protected post must not reach the model as a searchable excerpt.'
		);
	}

	/**
	 * An editor searching the same corpus still gets the protected post.
	 *
	 * @covers ::openstation_ai_search_fetch_posts
	 */
	public function test_search_posts_includes_password_protected_post_for_editor() {
		$post_id = self::factory()->post->create(
			array(
				'post_status'   => 'publish',
				'post_password' => 'hunter2',
				'post_title'    => 'Paella for members',
				'post_content'  => 'A Valencian rice dish with saffron and rabbit.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'editor' ) ) );

		$result = openstation_ai_search_dispatch_tool(
			'search_posts',
			array( 'query' => 'paella', 'offset' => 0 )
		);

		$this->assertContains( $post_id, wp_list_pluck( $result['items'], 'id' ) );
	}

	/**
	 * Comment search carries the parent's title and permalink on every item,
	 * so it inherits the parent's read gate.
	 *
	 * @covers ::openstation_ai_search_fetch_comments
	 */
	public function test_search_comments_excludes_comment_on_private_parent() {
		$post_id    = self::factory()->post->create(
			array( 'post_status' => 'private', 'post_title' => 'Secret plans' )
		);
		$comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $post_id,
				'comment_approved' => '1',
				'comment_content'  => 'Absolutely loved the saffron tip.',
			)
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$result = openstation_ai_search_dispatch_tool(
			'search_comments',
			array( 'query' => 'saffron', 'offset' => 0 )
		);

		$this->assertNotContains(
			$comment_id,
			wp_list_pluck( $result['items'], 'id' ),
			'A private parent must not leak its title through comment search.'
		);
	}

	/**
	 * `search_comments_by_post` takes its post id from the model, so it is
	 * untrusted the same way an entity id is.
	 *
	 * @covers ::openstation_ai_search_fetch_comments_by_post
	 */
	public function test_search_comments_by_post_refuses_unreadable_parent() {
		$post_id = self::factory()->post->create(
			array( 'post_status' => 'private', 'post_title' => 'Secret plans' )
		);
		self::factory()->comment->create(
			array( 'comment_post_ID' => $post_id, 'comment_approved' => '1' )
		);

		wp_set_current_user( self::factory()->user->create( array( 'role' => 'subscriber' ) ) );

		$result = openstation_ai_search_dispatch_tool(
			'search_comments_by_post',
			array( 'post_id' => $post_id, 'query' => '', 'offset' => 0 )
		);

		$this->assertSame( 0, $result['count'] );
		$this->assertSame( '', (string) ( $result['post_title'] ?? '' ), 'The parent title must not be echoed back.' );
		$this->assertArrayHasKey( 'error', $result );
	}
}
