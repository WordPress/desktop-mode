# Observe safely aborted stored-file cleanup

**Experimental.** A failed safety check stops the remaining daily cleanup sweep.
The next cron run retries; this action is for diagnostics, not for forcing a
retry or bypassing the checks. No SQL or filesystem paths are exposed.

```php
<?php
/** Plugin Name: OpenStation Cleanup Diagnostics */
defined( 'ABSPATH' ) || exit;

add_action( 'openstation_stored_files_reconcile_failed', function ( $error ) {
    $stage = $error->get_error_data()['stage'] ?? 'unknown';
    // Forward a small, non-sensitive event to your monitoring integration.
    do_action( 'my_monitoring_event', 'openstation-cleanup-stopped', array(
        'code'  => $error->get_error_code(),
        'stage' => $stage,
    ) );
} );
```

Stages are `orphan_rows` (candidate scan), `delete_row` (lock, revalidation,
conditional delete or unlink), `known_bytes` (registered names), and `delete_bytes`
(lock, revalidation or unlink). The code is `openstation_reconcile_failed`.
Healthy files with active or trashed placements are retained.
