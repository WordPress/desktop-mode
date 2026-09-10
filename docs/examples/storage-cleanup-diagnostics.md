# Observe stored-file cleanup failures

**Experimental.** A failed safety check stops the remaining daily cleanup sweep.
Individual unlink failures are reported while later candidates continue.
The next cron run retries retained bytes; this action is for diagnostics, not for forcing a
retry or bypassing the checks. No SQL or filesystem paths are exposed.

```php
<?php
/** Plugin Name: OpenStation Cleanup Diagnostics */
defined( 'ABSPATH' ) || exit;

add_action( 'openstation_stored_files_reconcile_failed', function ( $error ) {
    $stage = $error->get_error_data()['stage'] ?? 'unknown';
    // Forward a small, non-sensitive event to your monitoring integration.
    do_action( 'my_monitoring_event', 'openstation-cleanup-failed', array(
        'code'  => $error->get_error_code(),
        'stage' => $stage,
    ) );
} );
```

Stages are `orphan_rows` (candidate scan), `delete_row` (lock, revalidation,
or conditional delete), `known_bytes` (registered names), and `delete_bytes`
(lock or revalidation). `unlink_row_bytes` and `unlink_bytes` report filesystem
failures without aborting the sweep. SQLite reports a lock-stage failure because
its advisory-lock shim cannot safely coordinate destructive cleanup. The code is `openstation_reconcile_failed`.
Healthy files with active or trashed placements are retained.
