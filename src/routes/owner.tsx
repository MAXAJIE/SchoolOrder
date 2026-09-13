import { createFileRoute } from "@tanstack/react-router";
import { ConsoleApp } from "@/components/console/ConsoleApp";

export const Route = createFileRoute("/owner")({
  head: () => ({
    meta: [
      { title: "Owner console — SchoolOrder" },
      { name: "description", content: "Manage products, stock, orders, promo codes and dealers." },
      { property: "og:title", content: "Owner console — SchoolOrder" },
      {
        property: "og:description",
        content: "Owner and dealer workspace for the SchoolOrder shop.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ConsoleApp,
});
