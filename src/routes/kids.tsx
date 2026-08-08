import { createFileRoute, Link, ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";

const StarCatcher = lazy(() => import("@/components/kids/StarCatcher"));
const BalloonPop = lazy(() => import("@/components/kids/BalloonPop"));
const FreezeDance = lazy(() => import("@/components/kids/FreezeDance"));
const AnimalPoses = lazy(() => import("@/components/kids/AnimalPoses"));
const SubwayRunner = lazy(() => import("@/components/kids/SubwayRunner"));
const FruitNinja = lazy(() => import("@/components/kids/FruitNinja"));
const GoalKeeper = lazy(() => import("@/components/kids/GoalKeeper"));
const LaserDodge = lazy(() => import("@/components/kids/LaserDodge"));


export const Route = createFileRoute("/kids")({
  head: () => ({
    meta: [
      { title: "ألعاب الأطفال الحركية بالكاميرا | رقص المرايا" },
      {
        name: "description",
        content: "خمس ألعاب حركية للأطفال تعمل بكاميرا الجوال: مغامرة المترو، اصطاد النجوم، فرقعة البالونات، تمثال، وقلّد الحيوان.",
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

type GameId = "stars" | "balloons" | "freeze" | "animals" | "subway";

const GAMES: { id: GameId; name: string; emoji: string; desc: string; color: string }[] = [
  { id: "subway", name: "مغامرة المترو", emoji: "🏃", desc: "اركض واقفز لتفادي العقبات", color: "from-blue-500 to-indigo-600" },
  { id: "stars", name: "اصطاد النجوم", emoji: "⭐", desc: "المس النجوم النازلة بيديك", color: "from-amber-400 to-orange-500" },
  { id: "balloons", name: "فرقعة البالونات", emoji: "🎈", desc: "فرقع البالونات الطايرة", color: "from-pink-500 to-rose-600" },
  { id: "freeze", name: "تمثال!", emoji: "🗿", desc: "ارقص وتجمّد عند الإشارة", color: "from-cyan-400 to-blue-500" },
  { id: "animals", name: "قلّد الحيوان", emoji: "🦒", desc: "سوّ وقفة الحيوان واثبت", color: "from-green-400 to-emerald-600" },
];

function KidsPage() {
  const [game, setGame] = useState<GameId | null>(null);
  const back = () => setGame(null);

  return (
    <main dir="rtl" className="min-h-dvh bg-[#0a0a1a] text-foreground font-sans">
      <ClientOnly fallback={<Loading />}>
        <Suspense fallback={<Loading />}>
          {game === "stars" && <StarCatcher onBack={back} />}
          {game === "balloons" && <BalloonPop onBack={back} />}
          {game === "freeze" && <FreezeDance onBack={back} />}
          {game === "animals" && <AnimalPoses onBack={back} />}
          {game === "subway" && <SubwayRunner onBack={back} />}
        </Suspense>
      </ClientOnly>

      {game === null && (
        <div className="kid-stage mx-auto min-h-dvh w-full max-w-md px-6 pb-12 pt-10">
          <header className="text-center space-y-2">
            <h1 className="text-5xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-white/60 drop-shadow-2xl">
              ألعاب الصغار 🎪
            </h1>
            <p className="text-sm text-white/50 font-medium leading-relaxed">
              عالم من المرح والحركة بالكاميرا! <br />
              قف بعيداً قليلاً لتستمتع باللعب.
            </p>
          </header>

          <div className="mt-10 grid grid-cols-1 gap-5">
            {GAMES.map((g) => (
              <button
                key={g.id}
                onClick={() => setGame(g.id)}
                className={`group relative overflow-hidden rounded-3xl p-px transition-all duration-300 active:scale-95 shadow-lg`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br ${g.color} opacity-80 group-hover:opacity-100 transition-opacity`} />
                <div className="relative flex items-center gap-5 bg-black/20 backdrop-blur-xl rounded-[23px] p-5">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-4xl shadow-inner group-hover:scale-110 transition-transform duration-500">
                    {g.emoji}
                  </div>
                  <div className="text-right">
                    <h3 className="text-xl font-black text-white">{g.name}</h3>
                    <p className="text-xs text-white/70 font-bold">{g.desc}</p>
                  </div>
                  <div className="mr-auto opacity-0 group-hover:opacity-100 translate-x-4 group-hover:translate-x-0 transition-all">
                    <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center text-white font-black text-lg">
                      ←
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <Link
            to="/"
            className="mt-10 flex w-full items-center justify-center gap-3 rounded-2xl bg-white/5 py-4 text-sm font-black text-white/60 border border-white/10 hover:bg-white/10 transition-colors active:scale-95"
          >
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
