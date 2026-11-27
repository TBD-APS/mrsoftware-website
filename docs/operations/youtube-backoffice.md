# YouTube in the MR Software backoffice

The YouTube workspace is at `/backoffice/youtube/` on the Cloudflare Access-protected backoffice host. It shares the sales workspace's access allowlist and is not available on the public demo host.

1. Create a draft with the video title, description, tags, and product.
2. Save it and download the saved metadata. Upload the approved video file and apply the metadata in the right channel in YouTube Studio. This application neither receives video files nor authenticates to Studio.
3. After uploading, paste the YouTube link in the draft and choose **Check YouTube link**. The check sends a normalized watch URL to YouTube. If YouTube returns usable oEmbed metadata, the workspace saves the latest successful check's video ID, title, channel name, and timestamp. The check does not prove the video's visibility setting, channel ownership, or playback from all regions. No failure replaces a previous successful check.

The draft ID is stable across reloads. The server rejects a save or a check if another editor has changed the draft, and a draft edit does not alter metadata on an uploaded video. The database stores no media, provider HTML, or Google credentials. Only an explicit link check contacts YouTube; page loads and draft editing do not.

## Release and verification

The additive `commercial/migrations/0003_youtube.sql` migration creates `sales_youtube_drafts`. Apply it with the existing approval and backup procedure in the [commercial release runbook](commercial-release.md) before releasing a Worker that depends on it. A rollback does not require deleting this table.

Use the exact repository Node version. Focused tests:

```sh
npm run build:commercial
node --test tests/commercial-youtube.test.mjs
npx playwright test --config playwright.commercial.config.mjs commercial/private/tests/ux/youtube.pw.mjs
```

The tests use ephemeral D1, a synthetic staff identity and a fake provider response, and cover saving and reopening a draft on desktop and phone. The provider test exercises response handling and verifies the fixed YouTube origin. It does not connect a Google account, upload a test or real video, or establish a production provider connection.

Automatic upload and public publication are not enabled by this release. Those actions belong in a configured and approved Boney YouTube host with the authorized channel connection, operator review of the exact media and metadata, and provider evidence recorded separately from a link check.
