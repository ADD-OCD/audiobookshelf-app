# Audiobookshelf+ release process

Covers how distributable APKs are signed, versioned, and published. See `docs/app-identity.md`
for why the fork has its own package IDs at all.

## Signing identity

All distributed `app.absplus.android` APKs must be signed with the permanent Audiobookshelf+
release key.

- **Certificate SHA-256 fingerprint**: `C5:40:04:6A:10:FE:8A:97:DD:75:AD:BA:1D:7D:60:E6:9D:69:6B:10:49:2F:F3:81:E1:3F:62:DF:70:2E:B9:D4`
- Key algorithm: RSA 4096-bit, SHA256withRSA, valid 30 years (until 2056).
- The keystore (`android/keystore/audiobookshelf-plus-release.jks`) and its credentials
  (`android/keystore.properties`) are **never committed to git** — both are gitignored. Anyone
  building a signed release needs their own local copy of both files, generated once and backed
  up securely (a password manager entry for the credentials, encrypted offline storage for the
  keystore file itself). **Losing the keystore file permanently breaks the ability to publish an
  update that existing installs can upgrade to** — there is no recovery path.
- `android/app/build.gradle`'s `signingConfigs.release` reads from `keystore.properties` when
  present and falls back to an unsigned release build when it's absent, so a normal clone without
  the secret still builds (just can't produce an installable signed release).
- Do not record the store/key passwords or any private key material anywhere in this repository,
  in commit messages, in issues, or in chat/AI tool output. The fingerprint above is public and
  safe to share; the keystore and its passwords are not.

## What gets published where

**Debug builds (`app.absplus.android.debug`) are never uploaded to GitHub Releases** — not as a
normal release, not as a prerelease, not as a stabilization/RC/device-test build, not as a
feature-test build. Every APK attached to a GitHub release, regardless of how temporary or
test-oriented it is, must:

1. Use the release package ID, `app.absplus.android`.
2. Be signed with the permanent Audiobookshelf+ release key above.

Debug builds may still be built and installed locally for day-to-day development and diagnostics
— they're just not what gets handed to anyone for testing. If a debug build is ever genuinely
needed for a specific diagnostic purpose, it must be explicitly requested; it is not the default.

## versionCode convention for test/RC builds

Because every distributed build now shares one package ID and one signing identity, they all
compete for the same `versionCode` space — Android will refuse to install a build whose
`versionCode` isn't strictly greater than what's already installed, and Google Play permanently
rejects re-uploading a `versionCode` that's ever been used. There is no separate "test" numbering
track to fall back on.

**Convention: one monotonically-increasing integer, shared by every distributed build, numbered
release or temporary test/RC build alike. Never reuse, never skip backward, never jump ahead
arbitrarily — always exactly `last distributed versionCode + 1`.**

The last distributed value is recorded here and must be updated immediately after any build is
published (release, prerelease, or test build):

| versionCode | What it was |
| --- | --- |
| 123 | Audiobookshelf+ v0.14.0 (current stable baseline) |
| 124 | `fix/keyboard-aware-login` device-test build (commit `b66f9d96`) — **failed physical device test** (Galaxy S26 Ultra): keyboard still covered/blocked the server-connection/login form; page did not scroll. Superseded by 125. Not merged into `plus`. |
| 125 | `fix/keyboard-aware-login` device-test build (commit `1596c0f3`) — corrected fix (WebView now gets a real IME inset so the keyboard genuinely resizes it) pending physical device re-test. Not merged into `plus`. |

Before building anything intended for distribution — including a one-off test/RC build — bump
`versionCode` to the next integer above the value in this table, build, distribute, then update
the table. This is a plain sequential counter (no gaps reserved for releases vs. test builds), so
it stays simple, never collides, and never complicates eventual Google Play publication (Play only
requires each upload's `versionCode` to be strictly greater than the last, which this trivially
satisfies).

## Announcements

Audiobookshelf+ has no in-app "what's new"/announcements screen (checked during the v0.14.0
release — there isn't one to reuse). The [GitHub Discussions "Announcements" category](https://github.com/ADD-OCD/audiobookshelf-app/discussions/categories/announcements)
on this repo is the established, preferred place for users to read about completed Audiobookshelf+
changes, and is treated as part of the release itself, not an optional afterthought.

**Every normal Audiobookshelf+ release must have a matching Announcements post describing the
meaningful user-visible changes included in that release.** Rules for writing it:

- Write it before building the final release APK, as part of the release checklist below.
- Describe only functionality actually included in the release being announced — nothing merely
  investigated, deferred, or still in progress.
- Use plain, user-facing language (what changed for the user), not implementation details,
  internal class/file names, commit SHAs, branch names, or signing/repository-administration
  details.
- Small fixes/features don't each need their own post — they can accumulate and be summarized
  together in the next normal release's announcement.
- Temporary test/RC builds do not get their own Announcements post unless explicitly requested —
  they're for validation, not user-facing history.

## Summary checklist for any new distributed APK

1. Check the `versionCode` table above; use `last + 1`.
2. Build the **release** variant (`app.absplus.android`), not debug.
3. Confirm it's signed with the fingerprint above (`apksigner verify --verbose --print-certs`).
4. For a normal release (not a test/RC build): write/post the Announcements entry for it first.
5. Publish it, then update the `versionCode` table in this document.
