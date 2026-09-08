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
 *      on a fork turns skills and slash commands off entirely and loads
 *      no project memory from the checkout. `CLAUDE.md` is restored, but
 *      it is an `@AGENTS.md` include and the included file is not, so
 *      with memory on the fork would write the instruction layer. The
 *      guide comes back in as a file the workflow builds from the
 *      default branch.
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

	test( 'skills, slash commands and project memory are off on a fork pull request', () => {
		// The flags have to sit on the TRUE side of the fork test — the
		// expression `a && b || c` yields b when a holds — not merely
		// appear somewhere in the same string.
		const args = withInput( 'claude_args' );
		const onFork = args.match( /steps\.origin\.outputs\.fork == 'true' && (.*) \|\|/ );
		expect( onFork, 'claude_args is gated on the fork test' ).not.toBeNull();
		const flags = ( onFork as RegExpMatchArray )[ 1 ];
		expect( flags ).toContain( '--disable-slash-commands' );
		// No `project` source: that is what keeps CLAUDE.md (and anything
		// it `@`-includes from the checkout) out of the prompt.
		expect( flags ).toMatch( /--setting-sources user\b/ );
		expect( flags ).not.toMatch( /--setting-sources [^ ']*project/ );
		// The trusted guide comes back in as a file the workflow built.
		expect( flags ).toContain( '--append-system-prompt-file' );
		expect( flags ).toContain( 'steps.guide.outputs.path' );
	} );

	test( 'the guide a fork run gets is built from the default branch', () => {
		const step = WORKFLOW.match( /- name: Collect the trusted agent guide\n([\s\S]*?)\n\n\s+- name:/ );
		expect( step, 'claude.yml has the guide step' ).not.toBeNull();
		const body = ( step as RegExpMatchArray )[ 1 ];
		expect( body ).toMatch( /^\s+id: guide$/m );
		expect( body ).toMatch( /^\s+if: steps\.origin\.outputs\.fork == 'true'$/m );
		// `origin` is this repository; the fork's refs never live there.
		expect( body ).toContain( 'git fetch --depth 1 --no-recurse-submodules origin "$DEFAULT_BRANCH"' );
		expect( body ).toContain( 'git show "FETCH_HEAD:CLAUDE.md"' );
		// Every `@path` include in CLAUDE.md is read from the same ref, so
		// the layout on trunk (`CLAUDE.md` is just `@AGENTS.md`) is served
		// whole, and a new include needs no workflow change.
		expect( body ).toContain( 'git show "FETCH_HEAD:${line#@}"' );
		expect( body ).toContain( 'set -euo pipefail' );
		expect( body ).toMatch( /echo "path=\$out" >> "\$GITHUB_OUTPUT"/ );
		// Every include on trunk today is a plain `@path` line, the only
		// shape the step resolves. If that changes, teach the step first.
		const includes = readFileSync( resolve( ROOT, 'CLAUDE.md' ), 'utf8' )
			.split( '\n' )
			.filter( ( l ) => l.startsWith( '@' ) );
		expect( includes.length ).toBeGreaterThan( 0 );
		for ( const inc of includes ) {
			expect( inc ).toMatch( /^@[\w./-]+$/ );
		}
	} );

	test( 'a fork pull request never sees a write-capable GitHub token', () => {
		// The job token is what the fork path runs with, so its `contents`
		// permission is the ceiling on what a stolen token can do.
		expect( WORKFLOW ).toMatch( /^\s+contents: read\s*$/m );
		expect( WORKFLOW ).not.toMatch( /^\s+contents: write/m );
		const token = withInput( 'github_token' );
		expect( token ).toMatch(
			/steps\.origin\.outputs\.fork == 'true' && github\.token/
		);
		// And the origin step that decides "fork" fails closed.
		expect( WORKFLOW ).toContain( 'set -euo pipefail' );
	} );
} );
