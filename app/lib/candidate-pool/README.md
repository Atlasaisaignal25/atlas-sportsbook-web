# Atlas Candidate Pool

Candidate Pool is the future normalization layer for Atlas market opportunities.

It exists to separate the raw discovery of betting candidates from the products
that eventually consume those candidates. Today, `public_signals` is overloaded:
it acts as the free Signal Detected feed, the source for Top 5, the temporary
source for Precision Engine, the source for Challenges, and an admin/live overlay.

This module does not replace `public_signals` yet. It is intentionally not wired
to cron jobs, Supabase tables, Stripe, Scores, Top 5, Top 3, Challenges, or the
Precision Engine. This task only defines the contract that future engines can
share.

Future consumers:

- Precision Engine: Top Signal and Top Play.
- Subscription Engine: Top 5 and Top 3.
- Signal Detected: free public market opportunities.
- Challenges: free Signal Detected picks that are not part of premium products.

Candidate Pool is not a UI.

Candidate Pool is not a database table yet.

Candidate Pool is a pre-product layer for normalization, validation, risk flags,
and decision-ready candidate objects.
