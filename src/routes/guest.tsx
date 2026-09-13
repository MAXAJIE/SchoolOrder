import { createFileRoute } from "@tanstack/react-router";
import { ShopPage } from "@/components/shop/ShopPage";

export const Route = createFileRoute("/guest")({
  head: () => ({
    meta: [
      { title: "Order now — SchoolOrder" },
      {
        name: "description",
        content:
          "Tap a product, pick your options, pay by cash or DuitNow QR and get a pickup code instantly. No account needed.",
      },
      { property: "og:title", content: "Order now — SchoolOrder" },
      {
        property: "og:description",
        content: "Tap, customise, pay and collect with a pickup code.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ShopPage,
});
