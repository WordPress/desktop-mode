<?php
/**
 * Tests for the `/desktop-mode/v1/comment-stats/<id>` REST
 * endpoint's authorization model (OPENSTA-155).
 *
 * The route wears the My WordPress module's authorization gate
 * (`openstation_my_wordpress_user_can_use()`, `edit_posts` by
 * default — it does not gate WP Explorer's window or launcher, which
 * the app's own capabilities decide), and the handler additionally
 * refuses when the caller can't read the comment's parent post. A
 * low-capability account must not read comments on a post it can't
 * otherwise see: private, sealed behind a password, or of a post type
 * with no readable front end. An orphaned comment (its post is gone)
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

	/**
	 * An internal post type: not publicly queryable, so it has no
	 * readable front end, but `map_meta_cap` is on — which is what makes
	 * `read_post` on a *published* one resolve to plain `read`.
	 */
	const INTERNAL_TYPE = 'os_test_internal';

	private $published_post_id;
	private $published_comment_id;
	private $private_comment_id;
	private $protected_comment_id;
	private $internal_comment_id;
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

		// The shape a plugin's submission log / queue / internal note
		// takes: comments, `publish` status, no front end. Unregistered
		// again in tear_down — the test suite only resets post types for
		// core's own tests.
		register_post_type(
			self::INTERNAL_TYPE,
			array(
				'public'             => false,
				'publicly_queryable' => false,
				'map_meta_cap'       => true,
				'supports'           => array( 'title', 'editor', 'comments' ),
			)
		);

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
		$internal_post_id = self::factory()->post->create(
			array(
				'post_author' => self::$admin_id,
				'post_status' => 'publish',
				'post_type'   => self::INTERNAL_TYPE,
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
		$this->internal_comment_id = self::factory()->comment->create(
			array(
				'comment_post_ID'  => $internal_post_id,
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

	public function tear_down() {
		unregister_post_type( self::INTERNAL_TYPE );
		parent::tear_down();
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
	 * ...but a caller who has already entered the password is no longer
	 * looking at a sealed post: `post_password_required()` reads the
	 * `wp-postpass` cookie, so the read falls through to `read_post` and
	 * the `edit_post` requirement never applies.
	 *
	 * @covers ::openstation_my_wordpress_can_read_comment_post
	 */
	public function test_author_reads_comment_on_unlocked_protected_post() {
		wp_set_current_user( self::$author_id );

		// The same hasher and cookie name post_password_required() reads;
		// it require_once's the class lazily, so pull it in first.
		require_once ABSPATH . WPINC . '/class-phpass.php';
		$hasher                                 = new PasswordHash( 8, true );
		$_COOKIE[ 'wp-postpass_' . COOKIEHASH ] = $hasher->HashPassword( 'secret' );

		$status = $this->dispatch( $this->protected_comment_id )->get_status();
		unset( $_COOKIE[ 'wp-postpass_' . COOKIEHASH ] );

		$this->assertSame( 200, $status );
	}

	/**
	 * An author is refused a comment on a *published* post of a post
	 * type with no readable front end. This is the branch `read_post`
	 * alone misses: it resolves to plain `read` on a published post, and
	 * every logged-in user holds that, so without the post-type
	 * viewability check an internal submission log or queue would read
	 * like a public post.
	 *
	 * @covers ::openstation_my_wordpress_can_read_comment_post
	 */
	public function test_author_cannot_read_comment_on_internal_post_type() {
		wp_set_current_user( self::$author_id );

		// The leak this guards: the caller does hold the capability
		// `read_post` resolves to here.
		$this->assertTrue(
			current_user_can( 'read_post', get_comment( $this->internal_comment_id )->comment_post_ID ),
			'read_post alone would have authorized this read.'
		);
		$this->assertSame( 403, $this->dispatch( $this->internal_comment_id )->get_status() );
	}

	/**
	 * An administrator can `edit_post` the internal parent, so the
	 * dossier still opens for whoever actually administers the type.
	 *
	 * @covers ::openstation_my_wordpress_can_read_comment_post
	 */
	public function test_admin_reads_comment_on_internal_post_type() {
		wp_set_current_user( self::$admin_id );
		$this->assertSame( 200, $this->dispatch( $this->internal_comment_id )->get_status() );
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
