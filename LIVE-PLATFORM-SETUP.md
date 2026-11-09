# WEAR CONDOM live platform integration

## Supabase migration
Run `supabase/live-platform.sql` in the SQL Editor of the separate WEAR CONDOM Supabase project (`cxqijbdtcaqyttbfzqds`). Do not run it in Love Gambia Connect.

This creates:
- live stream records and a private stream-secret table
- persistent live chat with Realtime publication
- creator wallets and an append-only wallet ledger
- atomic token tipping between signed-in users
- private payment webhook event storage

The browser cannot credit wallets, alter balances, read stream keys, or write payment events. A payment integration must verify the provider's signed webhook server-side before issuing token credits.

## Live video
The intended first adapter is Cloudflare Stream Live. Create live inputs only from a server/Edge Function, keep API tokens and ingest keys server-side, and expose only the playback URL to approved viewers. Creators can broadcast through OBS or another RTMP/SRT broadcaster. Review Cloudflare's current acceptable-use terms and obtain approval for the site's content category before enabling it.

## Payments
No real payment provider has been activated. The site owner must open a merchant account, complete KYC, and obtain written confirmation that the provider accepts the platform's adult-content business category. Then add its secret key and webhook signing secret as server-side Supabase/Vercel secrets. Never put them in `config.js` or browser JavaScript.

Potential Gambian providers to evaluate (not yet approved for this site's content category):
- Modem Pay: https://modempay.com/
- Waychit: https://waychit.com/developers
- HexAI Payment Gateway: https://hpg.hexai.gm/docs

## Important launch controls
The 18+ screen in the front end is only a self-attestation, not age verification. Before real broadcasts or payments, implement robust age and identity verification, performer consent and rights checks, reporting/moderation, takedown handling, privacy controls, and a reviewed payment/refund policy.
