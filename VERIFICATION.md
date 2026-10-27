# Release verification

Verified on 2026-10-27, macOS arm64, standard Paseo desktop/daemon 0.13.0.

- TypeScript typecheck and Biome checks pass against the published 0.13.0 SDK.
- Twenty-one unit tests cover bounded context, stale source rejection, generation failure/retry, structured Codex output, shared cache, concurrent cancellation and duplicate-send protection, composer identity checks, hidden/read-only inputs, ambiguous split views, draft preservation and duplicate insertion prevention.
- The local plugin loads as `running` in the unmodified Paseo daemon. No custom composer API is imported. The desktop/web adapter accesses the standard input component’s internal ref after verifying its host and agent.
- A successful top-level demo turn creates the plugin timeline row. The manual `suggestion.show` RPC also creates the row for an existing completed reply.
- A real `suggestion.resolve` RPC, using the host's existing Codex configuration, returns “What edge cases should I test when adding a task?” for the sample conversation.
- A real `suggestion.send` RPC posts the explicitly supplied test question to the dedicated demo conversation. A second identical request returns `sent: false`.
- An isolated Chromium test renders the shipped React component using React Native Web and a mocked Paseo host. It checks clicking the suggestion text and button, appending to a pre-existing draft, filling an empty draft, focus and send-button state, repeated clicks, no automatic sending, stale reply rejection, a turn starting during validation, hidden input fallback, inline editing/explicit sending, dismissal, failure/retry, and a 390-pixel dark layout without horizontal overflow.
- `assets/screenshot.png`, `assets/edit.png`, and `assets/compact-dark.png` are captures of that component test harness. The surrounding conversation is sample data, not an actual user transcript. These images do not claim to show the full native Paseo application.

Physical iOS/Android devices and Windows/Linux desktop hosts have not been tested. The plugin uses public React Native timeline components, but native device acceptance remains open. The user confirmed that click-to-fill works in the standard macOS Paseo app. The original input was observed containing the generated question with Send enabled. The wider edge-case matrix above was exercised in the isolated browser harness; a full real-app regression matrix is not claimed.

The published source installs without a build step or third-party runtime dependencies. Development dependencies are locked in `package-lock.json`; they are not installed by the plugin at runtime. The Codex CLI is a user-supplied prerequisite, never installed by this plugin.
