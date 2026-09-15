import { createFileRoute, Link } from "@tanstack/react-router";
import { ShoppingBag, LayoutDashboard, QrCode, Clock, Boxes } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SchoolOrder — School shop ordering made simple" },
      {
        name: "description",
        content:
          "One link for buyers to order drinks and snacks, and one console for the shop owner to manage stock, orders and payments.",
      },
      { property: "og:title", content: "SchoolOrder — School shop ordering made simple" },
      {
        property: "og:description",
        content: "Order in seconds with a pickup code, and run the shop from one owner console.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { t } = useI18n();

  const features = [
    { icon: QrCode, title: t("landing.f1Title"), body: t("landing.f1Body") },
    { icon: Clock, title: t("landing.f2Title"), body: t("landing.f2Body") },
    { icon: Boxes, title: t("landing.f3Title"), body: t("landing.f3Body") },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <section className="flex flex-col items-center gap-5 text-center">
          <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {t("app.tagline")}
          </span>
          <h1 className="text-3xl font-extrabold leading-tight sm:text-5xl">
            {t("landing.heroTitle")}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
            {t("landing.heroBody")}
          </p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12">
              <Link to="/guest" search={{ code: "" }}>
                <ShoppingBag className="mr-2 h-4 w-4" />
                {t("landing.guestCta")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12">
              <Link to="/owner">
                <LayoutDashboard className="mr-2 h-4 w-4" />
                {t("landing.ownerCta")}
              </Link>
            </Button>
          </div>
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title}>
              <CardContent className="flex flex-col gap-2 p-5">
                <f.icon className="h-5 w-5 text-primary" aria-hidden />
                <h2 className="text-base font-semibold">{f.title}</h2>
                <p className="text-sm text-muted-foreground">{f.body}</p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex flex-col gap-2 p-6">
              <h2 className="text-lg font-bold">{t("landing.guestTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("landing.guestBody")}</p>
              <Button asChild variant="secondary" className="mt-2 h-11 w-full sm:w-auto">
                <Link to="/guest" search={{ code: "" }}>
                  {t("landing.guestCta")}
                </Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col gap-2 p-6">
              <h2 className="text-lg font-bold">{t("landing.ownerTitle")}</h2>
              <p className="text-sm text-muted-foreground">{t("landing.ownerBody")}</p>
              <Button asChild variant="secondary" className="mt-2 h-11 w-full sm:w-auto">
                <Link to="/owner">{t("landing.ownerCta")}</Link>
              </Button>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
