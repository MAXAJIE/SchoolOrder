import { createFileRoute } from "@tanstack/react-router";
import { ShopPage } from "@/components/shop/ShopPage";
import { normalizeShopCode } from "@/lib/shop-code";

type GuestSearch = { code: string };

export const Route = createFileRoute("/guest")({
  // The shop code lives in the URL so a poster, a QR sticker or a shared link
  // always opens one specific shop. Anything unusable becomes an empty code,
  // which renders the "enter your shop code" screen instead of failing.
  validateSearch: (search: Record<string, unknown>): GuestSearch => ({
    code: normalizeShopCode(typeof search["code"] === "string" ? search["code"] : ""),
  }),
  head: () => ({
    meta: [
      { title: "Order now — SchoolOrder" },
      {
        name: "description",
        content:
          "Open your shop with its shop code, pick your options, pay by cash or DuitNow QR and get a pickup code instantly. No account needed.",
      },
      { property: "og:title", content: "Order now — SchoolOrder" },
      {
        property: "og:description",
        content: "Enter your shop code, customise, pay and collect with a pickup code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShopPage,
});
