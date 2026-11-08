# WEAR CONDOM

Standalone 18+ creator community and sexual-wellness starter site.

## Separate backend
- Supabase project: `cxqijbdtcaqyttbfzqds`
- Public tables used: `adult_creator_profiles`, `adult_creator_media`, `adult_subscription_tiers`, `adult_subscriptions`, `adult_wellness_articles`
- This project is separate from Love Gambia Connect.

## Supabase browser configuration
Edit `config.js` and replace `PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE` with the project's **anon/public** key. Never use the `service_role` key in browser code. The public key is safe to expose only when Row Level Security and policies are correctly configured.

## Features
- 18+ entry self-attestation
- Email/password registration and sign-in through Supabase Auth
- Creator profile editing
- Creator membership tier drafts (inactive; no payments)
- Creator media-link submissions with consent declaration and moderation status
- Approved creator discovery and wellness resource listing

## Important launch checks
- Configure robust age assurance appropriate to jurisdictions served.
- Confirm RLS policies, storage access, and all five table schemas.
- Add reporting, blocking, moderation operations, privacy policy, terms and a support contact.
- Integrate a compliant payment provider before enabling paid memberships.
- The age gate is not identity or age verification.
