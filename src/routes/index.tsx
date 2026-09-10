import { createFileRoute } from "@tanstack/react-router";
import { ShopPage } from "@/components/shop/ShopPage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SchoolOrder — Order drinks from your school shop" },
      {
        name: "description",
        content:
          "Browse today's drinks, pay by cash or DuitNow QR, and get a pickup code instantly. No account needed.",
      },
      { property: "og:title", content: "SchoolOrder — Order drinks from your school shop" },
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
