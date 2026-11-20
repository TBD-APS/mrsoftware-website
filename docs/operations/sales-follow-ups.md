# Daily sales follow-ups

The Today screen must find work across the complete sales database before limiting each page. Taking the latest workspace records first can hide an older due opportunity, unanswered enquiry or open quote after newer, unrelated records arrive.

## Daily queues

- Follow up: open opportunities with a next follow-up on or before the browser's local calendar date, ordered by that date and record ID.
- New enquiries: enquiry-stage opportunities without a follow-up date, ordered by creation time and record ID.
- Open quotes: draft and sent quotes, ordered by validity date and record ID. Quote amounts and customer snapshots remain the saved values.

Each queue has bounded pages of 25 records. Fetch 26 matching rows to discover the next page. A validated cursor identifies the last ordering value and record ID; newer unrelated records do not displace the work. Cursor links belong in the page URL so reload, shared links and Back retain the selected pages. The date is also retained in those links. Users can return to the first page without knowing a record ID.

Referenced customer names accompany opportunity results, including customers outside the recent workspace snapshot. All reads use the existing authenticated private host and `private, no-store` responses. Public hosts cannot read these queues. Reading or paging creates no events and changes no customer, opportunity or quote.

## Journeys and verification

The existing journeys stay within their click budgets: Today to a due opportunity takes one click, saving a customer takes two, saving a follow-up takes three, and preparing a quote takes three. No budget or gate exemption increases.

Verify an older due opportunity, unanswered enquiry and open quote after more than 100 newer nonmatching records. Verify more than one page of matching work, equal ordering dates, customer links, reload and Back, local-date boundaries, invalid cursors and private-host authorization. Saving an opportunity to a future date or closing it must remove it from the due queue; closing a quote must remove it from open quotes without altering its saved amounts.

Tracking: [SAS-561](https://linear.app/workslip/issue/SAS-561/offer-public-qrpwa-demos-and-williams-sales-backoffice).
