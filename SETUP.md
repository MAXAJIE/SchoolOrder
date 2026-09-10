# SchoolOrder — self-hosting guide

SchoolOrder is a school beverage shop: buyers order without an account, owners manage
products/stock/orders/promo codes, dealers submit bulk requests. UI language switches
between English, 中文 and Bahasa Melayu; light/dark themes included.

## 1. Requirements

- Node 20+ (or Bun 1.1+)
- A Supabase project
- Optional: a Cloudflare account for deployment

## 2. Install

```bash
bun install        # or: npm install
```

## 3. Connect your Supabase project

Copy `.env.example` to `.env` and fill in your own values:

```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<your anon / publishable key>
VITE_SUPABASE_PROJECT_ID=<your-ref>
SUPABASE_URL=https://<your-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<your anon / publishable key>
SUPABASE_PROJECT_ID=<your-ref>
```

## 4. Create the database

Run every file in `supabase/migrations/` in order, in the Supabase SQL editor,
or with the Supabase CLI:

```bash
supabase link --project-ref <your-ref>
supabase db push
```

Then create two private storage buckets if they do not exist:

- `payment-proofs`
- `shop-images`

The migrations include the row-level security policies for both buckets.

## 5. Auth settings (Supabase dashboard → Authentication)

- Email/password sign-in: enabled.
- Email confirmation: on by default. Turn it off if you want staff to sign in
  immediately after registering.
- Google sign-in: optional; add your own Google OAuth client ID and secret.
- Add your site URL and redirect URLs.

## 6. Run locally

```bash
bun run dev      # http://localhost:8080
bun run build    # production build into dist/
```

## 7. Deploy to Cloudflare

The build output in `dist/` is a Cloudflare-compatible server build.

```bash
bun run build
npx nitro deploy --prebuilt
```

Set the same environment variables in your Cloudflare project settings.

## 8. First run

1. Open `/auth`, register the owner account, sign in.
2. You will be asked to create your shop — this makes you the owner.
3. Add products with at least one variant, price, cost and stock.
4. Upload your DuitNow QR image in Settings and share the public shop link.
5. Dealers register at `/auth`, copy their user ID from Settings, and the owner
   adds them under the Dealers tab.

## Notes

- Prices, stock deduction, promo discounts and order totals are all calculated
  in the database, never in the browser.
- Each order gets a private link plus a pickup code; nothing else exposes buyer data.
- Payment proof images are private and only visible to the shop owner.
