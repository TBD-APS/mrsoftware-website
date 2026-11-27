# Newsletter workspace

The private workspace at `/backoffice/newsletter/` uses the same exact-host
Cloudflare Access and Worker allowlist as Sales. Drafts, text previews, approval,
downloads and subscriber records are independent of delivery. Apply the reviewed
`commercial/migrations/0004_newsletter.sql` to the existing commercial D1 binding
along the approved release path, before rolling the Worker that needs the tables.

## Pilot use

- Record a subscriber only after verifying affirmative, specific permission to get
  MR Software's email newsletter. Record the date and a short reference to evidence
  kept in an approved system. Do not enter sales leads without opt-in, import
  CRM lists, or copy private correspondence into the reference. The workspace
  does not automatically collect or import subscribers.
- Write a draft in Danish or English and review its plain-text preview. Saving an
  edit clears approval. Downloading exports only the saved text and subject, never
  addresses. Treat it as an editorial artifact, not a send-ready mailing list.
- Suppress any withdrawal reported by email or any other channel in the workspace.
  Existing opt-outs cannot be re-added from this pilot interface. Recipient emails
  use an opaque unsubscribe link: opening it displays an action; a confirmation
  or an RFC 8058 one-click POST suppresses the address.
- Approval records the saved revision and exact active audience. Any subscriber
  change before sending requires saving and approving again. The initial release
  accepts at most 25 active addresses per newsletter, with no hidden segmentation.
- A provider acceptance is not an inbox-delivery receipt. A stuck Submit or
  Needs reconciliation outcome must be reviewed in the provider console against
  the attempt before considering another draft. No automatic retry or resend.

## Sending is off by default

An owner must approve the provider, its handling of subscriber data, sender and
recipient pilot. Separately configure the verified sender domain in the selected
Resend account, including the provider's DNS authentication instructions. No
domain or provider setup is performed by deploying this feature alone.

- `NEWSLETTER_FROM_EMAIL`: a bare address on the verified domain.
- `NEWSLETTER_RESEND_API_KEY`: secret, send-only for the verified domain. Do not
  expose it to the browser or include it in deployments' printed inputs.
- `NEWSLETTER_SEND_ENABLED`: must be explicitly set to `true` to allow sends.
  Leave unset until the owner verifies the public unsubscribe address on the
  commercial demos host and the approved sender. Before inviting subscribers,
  confirm sender authentication including the one-click headers on an approved
  internal test and check the actual recipient delivery and opt-out.

For setup: [Resend's batch API](https://resend.com/docs/api-reference/emails/send-batch-emails),
[batch idempotency](https://resend.com/changelog/batch-idempotency-keys/),
[one-click unsubscribe](https://www.rfc-editor.org/rfc/rfc8058.html), and the
[Danish Consumer Ombudsman's guidance](https://forbrugerombudsmanden.dk/alle-emner/uanmodede-henvendelser/uanmodede-elektroniske-henvendelser-spam).
