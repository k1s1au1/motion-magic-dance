import { createFileRoute, Link } from "@tanstack/react-router";
import { GAMES } from "@/games/registry";
import { readBest } from "@/engine/score";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Motion Arcade — العب بجسمك أمام الكاميرا" },
      {
        name: "description",
        content:
          "منصة ألعاب حركية تستخدم كاميرا جوالك كمستشعر لحركة جسمك: ملاكمة، تفادي، فقاعات، رد فعل، إيقاع وحارس مرمى.",
      },
      { property: "og:title", content: "Motion Arcade — العب بجسمك" },
      {
        property: "og:description",
        content: "جسمك هو وحدة التحكم. ستة ألعاب حركية تعمل بالكاميرا مباشرة على جوالك.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Hub,
});

function Hub() {
  const [bests, setBests] = useState<Record<string, number>>({});
  useEffect(() => {
    const m: Record<string, number> = {};
    for (const g of GAMES) m[g.id] = readBest(g.id);
    setBests(m);
  }, []);

  return (
    <main dir="rtl" className="stage min-h-[100dvh] px-5 pb-14 pt-10">
      <header className="mx-auto max-w-xl text-center">
        <p className="text-xs tracking-[0.35em] text-muted-foreground">MOTION ARCADE</p>
        <h1 className="mt-2 text-4xl font-black title-glow">العب بجسمك</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          الكاميرا تقرأ حركتك فقط — ما تظهر صورتك داخل اللعبة. تحرّك، اقفز، والكم لتتحكم.
        </p>
      </header>

      <section className="mx-auto mt-8 grid max-w-xl grid-cols-2 gap-4">
        {GAMES.map((g) => (
          <Link
            key={g.id}
            to="/play/$gameId"
            params={{ gameId: g.id }}
            className="group relative overflow-hidden rounded-3xl border border-[oklch(1_0_0/0.14)] p-4 text-right transition-transform active:scale-95"
            style={{ background: `linear-gradient(150deg, ${g.accent}33, ${g.accent2}1a)` }}
          >
            <span className="text-4xl">{g.emoji}</span>
            <h2 className="mt-2 text-lg font-black text-foreground">{g.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{g.tagline}</p>
            <p className="mt-3 text-[0.7rem] text-muted-foreground">
              أفضل نتيجة: <span className="font-bold text-foreground">{bests[g.id] ?? 0}</span>
            </p>
            <span
              className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full blur-2xl"
              style={{ background: g.accent, opacity: 0.35 }}
            />
          </Link>
        ))}
      </section>

      <p className="mx-auto mt-10 max-w-xs text-center text-xs text-muted-foreground">
        كل المعالجة تتم على جهازك — ما يُرسل أي فيديو لأي سيرفر.
      </p>
    </main>
  );
}
