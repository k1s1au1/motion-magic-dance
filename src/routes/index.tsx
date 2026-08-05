import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const DanceGame = lazy(() => import("@/components/DanceGame"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "رقص المرايا | لعبة رقص بالكاميرا" },
      {
        name: "description",
        content: "لعبة رقص عربية على الجوال تستخدم كاميرا هاتفك لتتبع حركات جسمك وتحسب نقاطك مثل Just Dance.",
      },
      { property: "og:title", content: "رقص المرايا | لعبة رقص بالكاميرا" },
      {
        property: "og:description",
        content: "قلّد الحركات أمام الكاميرا واجمع النقاط والسلاسل في لعبة رقص تعمل مباشرة من المتصفح.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main dir="rtl" className="min-h-dvh bg-background text-foreground">
      <ClientOnly fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">جاري التحميل…</div>}>
        <Suspense fallback={<div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">جاري التحميل…</div>}>
          <DanceGame />
        </Suspense>
      </ClientOnly>
    </main>
  );
}
