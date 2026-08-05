import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";

const StarCatcher = lazy(() => import("@/components/kids/StarCatcher"));
const BalloonPop = lazy(() => import("@/components/kids/BalloonPop"));
const FreezeDance = lazy(() => import("@/components/kids/FreezeDance"));
const AnimalPoses = lazy(() => import("@/components/kids/AnimalPoses"));

export const Route = createFileRoute("/kids")({
  head: () => ({
    meta: [
      { title: "ألعاب الأطفال الحركية بالكاميرا | رقص المرايا" },
      {
        name: "description",
        content: "أربع ألعاب حركية للأطفال تعمل بكاميرا الجوال: اصطاد النجوم، فرقعة البالونات، تمثال، وقلّد الحيوان.",
      },
      { property: "og:title", content: "ألعاب الأطفال الحركية بالكاميرا" },
      {
        property: "og:description",
        content: "ألعاب حركية ممتعة للأطفال تتبع حركة الجسم بالكاميرا مباشرة من المتصفح، بدون أي تحميل.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KidsPage,
});

type GameId = "stars" | "balloons" | "freeze" | "animals";

const GAMES: { id: GameId; name: string; emoji: string; desc: string; cls: string }[] = [
  { id: "stars", name: "اصطاد النجوم", emoji: "⭐", desc: "المس النجوم النازلة بيديك", cls: "kid-card-1" },
  { id: "balloons", name: "فرقعة البالونات", emoji: "🎈", desc: "فرقع البالونات الطايرة", cls: "kid-card-2" },
  { id: "freeze", name: "تمثال!", emoji: "🗿", desc: "ارقص وتجمّد عند الإشارة", cls: "kid-card-3" },
  { id: "animals", name: "قلّد الحيوان", emoji: "🦒", desc: "سوّ وقفة الحيوان واثبت", cls: "kid-card-4" },
];

function KidsPage() {
  const [game, setGame] = useState<GameId | null>(null);
  const back = () => setGame(null);

  return (
    <main dir="rtl" className="min-h-dvh bg-background text-foreground">
      <ClientOnly fallback={<Loading />}>
        <Suspense fallback={<Loading />}>
          {game === "stars" && <StarCatcher onBack={back} />}
          {game === "balloons" && <BalloonPop onBack={back} />}
          {game === "freeze" && <FreezeDance onBack={back} />}
          {game === "animals" && <AnimalPoses onBack={back} />}
        </Suspense>
      </ClientOnly>

      {game === null && (
        <div className="kid-stage mx-auto min-h-dvh w-full max-w-md px-5 pb-10 pt-8">
          <h1 className="kid-title text-center text-4xl">ألعاب الصغار 🎪</h1>
          <p className="mt-2 text-center text-sm text-muted-foreground">
            ألعاب حركية بالكاميرا — قف على بعد متر تقريبًا وخلّ جسمك كامل يبين.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4">
            {GAMES.map((g) => (
              <button key={g.id} onClick={() => setGame(g.id)} className={`kid-card ${g.cls}`}>
                <span className="text-5xl">{g.emoji}</span>
                <span className="mt-2 text-base font-extrabold">{g.name}</span>
                <span className="mt-1 text-xs opacity-80">{g.desc}</span>
              </button>
            ))}
          </div>

          <Link to="/" className="btn-kid mt-8 block text-center">
            رجوع للعبة الرقص 💃
          </Link>
        </div>
      )}
    </main>
  );
}

function Loading() {
  return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">جاري التحميل…</div>;
}
