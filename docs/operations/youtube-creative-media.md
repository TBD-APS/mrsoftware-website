# YouTube creative media

The signed-in YouTube draft has two routes into the same editable prompt form:
enter a prompt or ask Content Creator to prepare one. A generation never starts
from a widget event. The operator approves one thumbnail (16:9) or short clip
(16:9, four seconds, 720p, no audio), checks status, and downloads the asset.
Nothing is uploaded or published to YouTube.

The provider receives only the approved prompt and fixed settings. Never include
customer details in prompts. Keep the provider key on the Worker. A successful
completion stores the bytes in private R2 and serves a same-origin authenticated
download. The provider ID and approved draft revision, actor and request state
stay on the draft's job record. Signed provider URLs are never saved or exposed.

D1 reserves the request ID and enforces one active request of each kind per
draft before contacting ElevenLabs. An uncertain submission blocks new work of
that kind until reviewed; never remove the record or automatically retry based
only on a timeout. Check account-side generation history and reconcile before
starting another paid request. The browser polls only on explicit status checks.

## Activation checklist

1. Confirm workspace Pro+ and a restricted ElevenLabs Image & Video/Flows key
   using a read-only list call. Do not reuse a key that failed authorization.
2. Provision dedicated private R2 bucket `mrsoftware-youtube-media` with no
   public URL or public custom domain. Apply `0005_youtube_media.sql` to the
   approved sales D1 only. Set protected environment variable
   `COMMERCIAL_YOUTUBE_MEDIA_BUCKET` and use the guarded commercial release.
   Store the restricted provider key as `eleven-labs-api-key` in Azure Key
   Vault `kv-mrsoftwarev2-live`, not in GitHub. Only the protected main-branch
   `mrsoftware-commercial-production` release job has GitHub OIDC permission.
   Its dedicated managed identity uses `COMMERCIAL_AZURE_CLIENT_ID` and
   `COMMERCIAL_AZURE_TENANT_ID` (non-secret environment variables), with
   Key Vault Secrets User scoped to that single secret. No Azure client secret
   or vault-wide role is required. The release preflight checks
   both provider read-only endpoints, the required D1 table, and the bucket.
   The approved workflow binds the key to the uploaded Worker version only
   when media storage is enabled. Without both the binding and key, generation
   stays off.
3. Configure the ElevenLabs client tool `prepare_youtube_media`: wait for
   response; required string `kind` (image or video) and string `prompt`.
   Describe it as preparing an editable proposal, never generating, spending
   or publishing. The site binds it only on a saved, signed-in YouTube draft.
   The list-page widget and off-site embeds have no spend endpoint.
4. Check one approved harmless generation of each kind, actual file type,
   no-store download, duplicate submission and signed-out rejection. The
   local tests use fake providers and disposable data, not live generations.

Sources: [ElevenLabs Image & Video quickstart](https://elevenlabs.io/docs/eleven-api/guides/cookbooks/image-and-video)
and [widget client tools](https://elevenlabs.io/docs/eleven-agents/customization/widget#client-tools).
