import { createFileRoute } from "@tanstack/react-router";
import { ShopPage } from "@/components/shop/ShopPage";

// Alias of "/" so existing links keep working. The shop lives in one place only.
export const Route = createFileRoute("/place_order")({
  head: () => ({
    meta: [
      { title: "Order now — SchoolOrder" },
      {
        name: "description",
        content:
          "Browse today's drinks, pay by cash or DuitNow QR, and get a pickup code instantly. No account needed.",
      },
      { property: "og:title", content: "Order now — SchoolOrder" },
      {
        property: "og:description",
        content: "Browse drinks, pay by cash or DuitNow, and collect with a pickup code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShopPage,
});
