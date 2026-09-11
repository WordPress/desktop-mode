# AI-assisted site branding

*Status: Experimental.*

Configure an AI provider under WordPress **Settings → Connectors**, then select
Brand Studio under **Preferences → Themes** and choose **Make it with AI**.
The button is hidden until a text-generation provider is connected; return to
Preferences after connecting one to refresh its availability.
For example: “Use Automattic’s branding, with a bright workspace and subtle glass.”
Review the proposed colours, font, glass strengths and references, then Apply or
Cancel. Applying changes this site for all users; generating only creates a preview.

The studio submits a background job and polls its status, so research can outlive
the host's HTTP gateway timeout. Transport retries reuse the submission UUID;
Cancel stops polling. The job cannot change branding, and its temporary input and
result expire after one day. [Transport contract](../desktop-themes.md#ai-brand-proposals).

Model selection uses `openstation_ai_model_config` with sources
`brand-studio/research` and `brand-studio/proposal`. The first attaches native web
search when supported. The second requests structured output independently, so
models do not have to support web search and strict JSON in the same turn.

An alternate runtime can supply proposals:

```php
add_filter( 'openstation_brand_studio_generate', function ( $generated, $brief, $current ) {
    // Return null to use Core. Otherwise return WP_Error or:
    // [ 'proposal' => [ name, rationale, brandPalette, brandFont, brandOpacity, sources ],
    //   'webSearch' => false, 'warning' => 'No live web research.' ].
    // All ten colours and both glass percentages must be present.
    // The regular strict validation and admin permission gate still apply.
    return $generated;
}, 10, 3 );
```

The provider receives a structural subset of the validation schema. String
lengths, numeric bounds and array size are enforced by OpenStation after generation,
following [Anthropic’s structured-output guidance](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

Observe completion without applying the proposed settings:

```php
add_action( 'openstation_brand_ai_job_finished', function ( $id, $owner, $status ) {
    // $status['status'] is 'completed' or 'failed'; $status['result'] is review data.
    // Record the outcome in your own observability system if needed.
}, 10, 3 );
```

AI proposals request every colour role explicitly and retry malformed structured
output once with validation feedback. The preview shows colours, font and glass
settings without a generated summary. The response retains `rationale` as an
empty string for consumers; explanation length cannot invalidate a palette.

The system instructions describe each role and the compiler’s compositing order.
Schema property descriptions repeat those semantics, including alpha in the last
hex pair (`00` transparent, `FF` opaque). Colour alpha produces composited
foundations; `brandOpacity.widgets` and `.dock` control actual background glass.
Required lists cover every top-level field, every colour role, and both opacity
values. Transparency does not permit omitting a key.
