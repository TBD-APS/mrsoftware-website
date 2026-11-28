# YouTube backoffice acceptance and gaps

Baseline: live commercial release 46137534898, source c177cd1.
Scope: YouTube drafts and the embedded Content Creator panel. This is not a
newsletter, publishing, or app-wide identity release.

| Flow | Baseline evidence | Gap or next check |
| --- | --- | --- |
| Sign in and reach YouTube | Verified with an allowed staff account in production; signed-out production reads redirect, and the public demo hostname rejects the page. | The second allowed mailbox was not signed in during this check. |
| Start, preview, save, reopen, and edit a draft | Existing tests cover server validation, D1 persistence, revision conflicts, and access. Source review found the heading remains “New YouTube draft” after a successful create. | Reproduce the heading in the browser, then make it reflect the saved record. Add a browser journey for preview, save, reload, list, edit and conflict. |
| Prepare handoff | The saved draft yields a plain-text metadata download and a link to Studio; the workspace does not upload or publish. | Saving edits rerenders the handoff and can discard a pasted, unchecked link. Preserve it within the current page and test the exact downloaded bytes. |
| Check a YouTube link | API tests exercise permitted formats, rejection, provider failure, and a saved receipt. | Test browser success and failure against a deterministic provider. Private videos may not be visible to the verifier; a successful check does not prove visibility, ownership, or reliable playback. |
| Open Content Creator | Signed-in production browser opened the widget; text input and Start a call appeared without starting a conversation. | The active greeting is about shopping for gadgets, not planning a video. Inspect the exact agent before changing its default message; do not change use of the agent on another surface without verifying scope. |
| Recover when the widget asset fails | Source leaves Open Content Creator disabled and asks for a reload in text. | Provide an explicit recovery action; do not re-register an uncertain custom element in the same document. |
| Use assistant outputs | The widget is a conversation surface only. It has no backoffice tools in this integration. | No title or description is automatically saved. Live text/voice quality and publishing are not verified by opening the panel. |

Use disposable D1 and simulated providers for browser writes. Do not create
production test drafts, send newsletter emails, upload a video, or start a live
agent conversation for this release. Any new agent tool, publishing integration
or draft deletion is a separate decision, not a defect in the current contract.

## Fixes and verification

- The pre-fix desktop run reproduced the stale heading and missing recovery
  link. The saved state now updates the heading and preview; editing an
  existing draft does not rebuild the Studio form or erase its pending link.
  A failed widget load offers an explicit page reload without changing the
  pinned adapter or retrying custom element registration in place.
- Six focused browser cases passed on desktop and 390 px phone: the full
  draft-to-receipt journey, the failed widget recovery path, and opening the
  pinned widget without a provider session. The journey tests a failed and
  successful simulated lookup, exact downloaded metadata, stable links, and
  retention of unsaved edits on a revision conflict.
- In ElevenLabs, the reviewed Main publication changed only First message.
  The signed-in production widget displayed the new video-planning greeting
  after reloading. No conversation was started. The existing system prompt
  still includes a tech shop role; the greeting change is not proof that
  follow-up answers fit MR Software. A separate prompt/agent decision and
  controlled text/voice test are needed before certifying that behavior.
- No production draft, video, email, role, tool, or account configuration was
  created or changed in this test. YouTube provider eligibility for any
  specific private video remains unverified.
