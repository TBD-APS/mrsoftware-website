# ElevenLabs company webhook

The intended callback is `https://mrsoftware.dk/api/webhooks/elevenlabs`.
The website consumes Boney's versioned `@mr-software/elevenlabs` package; it
does not copy provider verification logic. Module `mr.elevenlabs` 0.1.0 is a
system connection for tenant `mr-software`, application `mrsoftware-website`,
connection `elevenlabs-main`. Payload/query fields cannot change that scope.

Only this exact route on `mrsoftware.dk` accepts POST JSON. Dashboard, preview
and other hosts return 404 on it. GET returns 405, never a list of recordings.
Company pages and Cloudflare Access verification retain their existing handlers.

## Activation

The receiver is default-off. Deploy only through the existing owner-merged
production Action. No local Wrangler deployment is authorized by this change.

1. Bind the dedicated `mrsoftware-elevenlabs` D1 database as `ELEVENLABS_INBOX`
   using the reviewed ID in `wrangler.jsonc`. Apply `migrations/elevenlabs/0001_inbox.sql`
   to that database; it only adds the inbox and index. The sales database is
   separate. The deployment does not run a migration automatically.
2. In [ElevenLabs Webhooks](https://elevenlabs.io/app/developers/webhooks), create
   an HMAC webhook named `MR Software` with the exact callback above. Save the
   generated signing secret as Worker secret `ELEVENLABS_WEBHOOK_SECRET` through
   the approved deployment/secret process. Do not paste it into chat, commit it
   or put it in a GitHub variable. The ElevenLabs API key is a different secret.
3. Configure the required ElevenLabs event subscriptions/agent post-call settings
   and retries. Keep audio delivery off: the shared receiver limits requests to
   1 MiB. Voice-removal, transcription, failure and generation envelopes fit the
   same contract, subject to that limit.
4. Grant this system connection by setting `ELEVENLABS_WEBHOOK_ENABLED` to `true`
   and keeping `ELEVENLABS_MODULE_VERSION` at `0.1.0` in an owner-reviewed release.
   The current checked-in default is `false`; enabling it is an explicit change.
5. Send an ElevenLabs test delivery and redeliver it. Confirm 200 `accepted` then
   200 `duplicate` and one private database row. A 503 is incomplete activation
   or storage failure, and must never be reported as a successful delivery.

The handler verifies HMAC over the original bytes, rejects signatures older than
30 minutes or over 60 seconds in the future, and awaits one atomic D1 INSERT
before acknowledging. Simultaneous copies and a newly signed retry share a
payload key within the trusted scope. Invalid signatures return 401 without
writing. Errors never return payloads or provider/database exception text.

## Private storage and processing

`payload` can contain transcripts and personal data. The database has no public
read endpoint. Access, permitted processing and erasure belong to the company
operator. This change only receives evidence; it sends no messages, triggers
no model/tool calls and marks no business record as processed. Add a separately
authorized, idempotent consumer when a concrete product workflow needs it.

Select and configure a retention policy before enabling production ingestion;
the receiver does not silently schedule deletion of evidence. Restrict database
and Worker administration to the existing authorized operators. To disconnect,
disable the webhook in ElevenLabs and set the host enable flag to false through
the release process. Existing stored evidence remains subject to retention.

## Validation

`node --test tests/elevenlabs-webhook.test.mjs` exercises the installed Boney
artifact with real local D1 storage through Miniflare, including concurrent
duplicates, wrong signatures, missing bindings and default-off behavior. `npm
test` retains the existing website/Access/browser gates. Tests use synthetic
data and no real ElevenLabs credentials.
