import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { GameScreen } from "@/components/GameScreen";
import { getGame } from "@/games/registry";

export const Route = createFileRoute("/play/$gameId")({
  head: () => ({
    meta: [
      { title: "الجولة — Motion Arcade" },
      { name: "description", content: "جولة لعب حركية تتحكم فيها بجسمك أمام الكاميرا." },
      { property: "og:title", content: "الجولة — Motion Arcade" },
      { property: "og:description", content: "جولة لعب حركية تتحكم فيها بجسمك أمام الكاميرا." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlayPage,
});

function PlayPage() {
  const { gameId } = useParams({ from: "/play/$gameId" });
  const game = getGame(gameId);

  if (!game) {
    return (
      <div className="stage flex min-h-[100dvh] flex-col items-center justify-center gap-4" dir="rtl">
        <p className="text-lg font-bold text-foreground">ما لقينا هذي اللعبة</p>
        <Link to="/" className="btn-neon">
          رجوع للألعاب
        </Link>
      </div>
    );
  }

  return <GameScreen game={game} />;
}
