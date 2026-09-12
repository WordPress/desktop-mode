<?php
/**
 * Tests for the `/desktop-mode/v1/comment-stats/<id>` REST
 * endpoint's authorization model (OPENSTA-155).
 *
 * The route wears the My WordPress window's own filterable gate
 * (`openstation_my_wordpress_user_can_use()`, `edit_posts` by
 * default), and the handler additionally refuses when the caller
 * can't read the comment's parent post. A low-capability account
 * must not read comments on private or password-protected posts it
 * can't otherwise see, and an orphaned comment (its post is gone)
 * is moderators-only.
 *
 * @package WordPress
 * @subpackage UnitTests
 *
 * @group openstation
 * @group desktop-mode-my-wordpress
 */
class Tests_OpenStation_MyWordpressCommentStats extends WP_UnitTestCase {

	protected static $admin_id;
	protected static $subscriber_id;
	protected static $author_id;

	private $published_post_id;
	private $published_comment_id;
	private $private_comment_id;
	private $protected_comment_id;
	private $orphan_comment_id;

	public static function wpSetUpBeforeClass( WP_UnitTest_Factory $factory ) {
		self::$admin_id      = $factory->user->create( array( 'role' => 'administrator' ) );
		self::$subscriber_id = $factory->user->create( array( 'role' => 'subscriber' ) );
		self::$author_id     = $factory->user->create( array( 'role' => 'author' ) );
	}

	public function set_up() {
		parent::set_up();

		wp_set_current_user( self::$admin_id );
		do_action( 'rest_api_init' );

		// An administrator-owned published, private and
		// password-protected post, each with one approved comment —
		// plus one approved comment whose post is gone.
		$this->published_post_id = self::factory()->post->create(
			array(
				'post_author' => self::$admin_id,
				'post_status' => 'publish',
			)
		);
		$private_post_id = self::factory()->post->create(
			array(
				'post_author' => self::$admin_id,
				'post_status' => 'private',
			)
		);
		$protected_post_id = self::factory()->post->create(
			array(
				'post_author'   => self::$admin_id,
				'post_status'   => 'publish',
				'post_password' => 'secret',
			)
		);

		$this->published_comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $this->published_post_id,
				'comment_approved' => '1',
			)
		);
		$this->private_comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $private_post_id,
				'comment_approved' => '1',
			)
		);
		$this->protected_comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $protected_post_id,
				'comment_approved' => '1',
			)
		);
		$this->orphan_comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => 0,
				'comment_approved' => '1',
			)
		);
	}

	/**
	 * Dispatch a comment-stats request for the given comment.
	 *
	 * @param int $comment_id Comment id.
	 * @return WP_REST_Response
	 */
	private function dispatch( $comment_id ) {
		$request = new WP_REST_Request( 'GET', '/desktop-mode/v1/comment-stats/' . (int) $comment_id );
		return rest_get_server()->dispatch( $request );
	}

	/**
	 * Logged-out requests are rejected by the permission callback.
	 *
	 * @covers ::openstation_my_wordpress_register_comment_stats_route
	 */
	public function test_logged_out_request_is_rejected() {
		wp_set_current_user( 0 );
		$this->assertSame( 401, $this->dispatch( $this->published_comment_id )->get_status() );
	}

	/**
	 * A subscriber has no `edit_posts` and is refused at the route,
	 * even for a comment on a public post. This is the OPENSTA-155
	 * reproduction: the subscriber used to read the full dossier.
	 *
	 * @covers ::openstation_my_wordpress_register_comment_stats_route
	 */
	public function test_subscriber_is_rejected_by_route() {
		wp_set_current_user( self::$subscriber_id );
		$this->assertSame( 403, $this->dispatch( $this->published_comment_id )->get_status() );
	}

	/**
	 * An author (has `edit_posts`, lacks `read_private_posts`) is
	 * refused a comment on another user's private post.
	 *
	 * @covers ::openstation_my_wordpress_comment_stats_callback
	 */
	public function test_author_cannot_read_comment_on_private_post() {
		wp_set_current_user( self::$author_id );
		$this->assertSame( 403, $this->dispatch( $this->private_comment_id )->get_status() );
	}

	/**
	 * An author is refused a comment on a password-protected post it
	 * can't edit.
	 *
	 * @covers ::openstation_my_wordpress_comment_stats_callback
	 */
	public function test_author_cannot_read_comment_on_protected_post() {
		wp_set_current_user( self::$author_id );
		$this->assertSame( 403, $this->dispatch( $this->protected_comment_id )->get_status() );
	}

	/**
	 * An author reads a comment on a public post normally.
	 *
	 * @covers ::openstation_my_wordpress_comment_stats_callback
	 */
	public function test_author_reads_comment_on_public_post() {
		wp_set_current_user( self::$author_id );
		$response = $this->dispatch( $this->published_comment_id );
		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( $this->published_comment_id, $response->get_data()['comment']['id'] );
	}

	/**
	 * An administrator reads comments on private and
	 * password-protected posts.
	 *
	 * @covers ::openstation_my_wordpress_comment_stats_callback
	 */
	public function test_admin_reads_comment_on_restricted_posts() {
		wp_set_current_user( self::$admin_id );
		$this->assertSame( 200, $this->dispatch( $this->private_comment_id )->get_status() );
		$this->assertSame( 200, $this->dispatch( $this->protected_comment_id )->get_status() );
	}

	/**
	 * An orphaned comment (its post is gone) is moderators-only —
	 * even when a global post is set, which get_post( 0 ) would
	 * otherwise silently substitute for the missing parent.
	 *
	 * @covers ::openstation_my_wordpress_can_read_comment_post
	 */
	public function test_orphaned_comment_is_moderators_only() {
		wp_set_current_user( self::$author_id );
		$this->assertSame( 403, $this->dispatch( $this->orphan_comment_id )->get_status() );

		// A stray global post must not stand in for the missing parent.
		$GLOBALS['post'] = get_post( $this->published_post_id );
		$this->assertSame( 403, $this->dispatch( $this->orphan_comment_id )->get_status() );
		unset( $GLOBALS['post'] );

		wp_set_current_user( self::$admin_id );
		$response = $this->dispatch( $this->orphan_comment_id );
		$this->assertSame( 200, $response->get_status() );
		$this->assertNull( $response->get_data()['post'] );
	}

	/**
	 * A site that widens the window gate via the filter widens the
	 * route with it — but the parent-post gate still holds on its
	 * own, so private posts stay unreadable.
	 *
	 * @covers ::openstation_my_wordpress_register_comment_stats_route
	 * @covers ::openstation_my_wordpress_comment_stats_callback
	 */
	public function test_filter_widened_route_still_enforces_parent_post_gate() {
		add_filter( 'openstation_my_wordpress_user_can_use', '__return_true' );

		wp_set_current_user( self::$subscriber_id );
		$this->assertSame( 200, $this->dispatch( $this->published_comment_id )->get_status() );
		$this->assertSame( 403, $this->dispatch( $this->private_comment_id )->get_status() );
		$this->assertSame( 403, $this->dispatch( $this->protected_comment_id )->get_status() );
	}

	/**
	 * A site that narrows the window gate via the filter locks the
	 * route down with it, administrators included.
	 *
	 * @covers ::openstation_my_wordpress_register_comment_stats_route
	 */
	public function test_filter_narrowed_route_refuses_admins() {
		add_filter( 'openstation_my_wordpress_user_can_use', '__return_false' );

		wp_set_current_user( self::$admin_id );
		$this->assertSame( 403, $this->dispatch( $this->published_comment_id )->get_status() );
	}

	/**
	 * A missing comment is a 404, not a 403 — the not-found check runs
	 * before the parent-post gate.
	 *
	 * @covers ::openstation_my_wordpress_comment_stats_callback
	 */
	public function test_missing_comment_is_not_found() {
		wp_set_current_user( self::$admin_id );
		$this->assertSame( 404, $this->dispatch( 999999 )->get_status() );
	}
}
