/**
 * The `@claude` workflow runs on pull requests from public forks.
 *
 * Every event `.github/workflows/claude.yml` listens to is raised on the
 * base repository, and its gate vouches for the person who mentioned
 * `@claude`, never for the code that gets checked out. On a fork pull
 * request, then, the action runs Claude Code inside a working tree the
 * fork's author wrote — with Claude's own OAuth token in the subprocess
 * environment, and a GitHub token beside it.
 *
 * The action defends `.claude/` (it deletes the checked-out copy and
 * restores the base branch's), and this file pins the three things that
 * defence depends on, because each was missing once:
 *
 *   1. Nothing tracked under `.claude/` is a symlink. The restore puts a
 *      link back as a link; the link's TARGET is whatever the pull
 *      request says it is. `.claude/skills -> ../.agents/skills` turned
 *      the trusted skill directory into a view over untrusted files, and
 *      a project skill is executable: a `!` expansion in its body runs
 *      before the model sees the prompt, with the skill's own
 *      `allowed-tools` frontmatter widening the workflow's tool list.
 *   2. The workflow disables that expansion for every skill source, and
 *      turns skills and slash commands off entirely on a fork.
 *   3. A fork never gets a write-capable token: the job's own `contents`
 *      permission is read-only, and the action is handed that job token
 *      instead of minting a GitHub App one.
 *
 * Textual checks on purpose: the workflow is YAML with GitHub
 * expressions, and the tracked-mode check has to see what SHIPS (a
 * developer's ignored `.claude/settings.local.json` is not our business),
 * so it asks git rather than the filesystem.
 */
import { describe, expect, test } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve( __dirname, '../..' );
const WORKFLOW = readFileSync(
	resolve( ROOT, '.github/workflows/claude.yml' ),
	'utf8'
);

/** `[ mode, path ]` for every tracked entry under `prefix`. */
function tracked( prefix: string ): Array< [ string, string ] > {
	const out = execFileSync(
		'git',
		[ 'ls-files', '--stage', '--', prefix ],
		{ cwd: ROOT, encoding: 'utf8' }
	);
	return out
		.split( '\n' )
		.filter( Boolean )
		.map( ( line ) => {
			// "<mode> <object> <stage>\t<path>"
			const [ meta, path ] = line.split( '\t' );
			return [ meta.split( ' ' )[ 0 ], path ];
		} );
}

/** The `<key>:` line inside the "Run Claude Code" step's `with:` block. */
function withInput( key: string ): string {
	const match = WORKFLOW.match( new RegExp( `^\\s+${ key }:(.*)$`, 'm' ) );
	expect( match, `claude.yml passes \`${ key }\` to the action` ).not.toBeNull();
	return ( match as RegExpMatchArray )[ 1 ].trim();
}

describe( 'trusted Claude configuration is made of regular files', () => {
	test( 'nothing tracked under .claude/ is a symlink', () => {
		const links = tracked( '.claude' ).filter( ( [ mode ] ) => '120000' === mode );
		expect( links, 'symlinks tracked under .claude/' ).toEqual( [] );
	} );

	test( 'the project skills live under .claude/skills/ themselves', () => {
		const files = tracked( '.claude/skills' ).map( ( [ , path ] ) => path );
		expect( files ).toContain( '.claude/skills/pixijs/SKILL.md' );
		// The old home of the skill library. If it comes back, so does the
		// temptation to link to it from `.claude/skills`.
		expect( tracked( '.agents' ) ).toEqual( [] );
	} );
} );

describe( 'claude.yml keeps a fork checkout from executing anything', () => {
	test( 'skill shell expansion is disabled by policy for every source', () => {
		// The `settings` input is a YAML block scalar holding JSON; read the
		// JSON so a typo (or a "false") fails here rather than in a fork PR.
		const match = WORKFLOW.match( /^\s+settings:\s*\|\n((?:[ \t]+\S.*\n?)+)/m );
		expect( match, 'claude.yml passes a `settings` block' ).not.toBeNull();
		const settings = JSON.parse( ( match as RegExpMatchArray )[ 1 ] ) as Record< string, unknown >;
		expect( settings.disableSkillShellExecution ).toBe( true );
	} );

	test( 'skills and slash commands are off on a fork pull request', () => {
		const args = withInput( 'claude_args' );
		expect( args ).toContain( '--disable-slash-commands' );
		expect( args ).toContain( "steps.origin.outputs.fork == 'true'" );
	} );

	test( 'a fork pull request never sees a write-capable GitHub token', () => {
		// The job token is what the fork path runs with, so its `contents`
		// permission is the ceiling on what a stolen token can do.
		expect( WORKFLOW ).toMatch( /^\s+contents: read\s*$/m );
		expect( WORKFLOW ).not.toMatch( /^\s+contents: write/m );
		const token = withInput( 'github_token' );
		expect( token ).toContain( "steps.origin.outputs.fork == 'true'" );
		expect( token ).toContain( 'github.token' );
		// And the origin step that decides "fork" fails closed.
		expect( WORKFLOW ).toContain( 'set -euo pipefail' );
	} );
} );
