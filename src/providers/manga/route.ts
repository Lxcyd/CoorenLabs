import { Elysia } from "elysia";
import { mangaballRoutes } from "./mangaball/route";
import { allmangaRoutes } from "./allmanga/route";

export const mangaRoutes = new Elysia({ prefix: "/manga" })
  .get("/", () => {
    return {
      service: "manga",
      description: "Unified manga API — provider-isolated route architecture",
      providers: ["mangaball", "allmanga"],
      endpoints: {
        mangaball: [
          "GET /manga/mangaball/home          → Featured titles and banners",
          "GET /manga/mangaball/latest        → Latest updated titles",
          "GET /manga/mangaball/recommendation→ Recommended titles",
          "GET /manga/mangaball/popular       → Popular titles this season",
          "GET /manga/mangaball/added         → Recently added titles",
          "GET /manga/mangaball/new-chap      → Titles with new chapters",
          "GET /manga/mangaball/foryou        → Personalized suggestions (?time=day|week|month|year)",
          "GET /manga/mangaball/recent        → Recent chapter reads (?time=day|week|month|year)",
          "GET /manga/mangaball/search        → Search titles (?q=query&page=1)",
          "GET /manga/mangaball/filters       → Advanced filtering with tags and sorts",
          "GET /manga/mangaball/manga         → Browse Japanese Manga",
          "GET /manga/mangaball/manhwa        → Browse Korean Manhwa",
          "GET /manga/mangaball/manhua        → Browse Chinese Manhua",
          "GET /manga/mangaball/comics        → Browse English Comics",
          "GET /manga/mangaball/ongoing       → Browse ongoing series",
          "GET /manga/mangaball/completed     → Browse completed series",
          "GET /manga/mangaball/detail/:slug  → Full title details and chapter list",
          "GET /manga/mangaball/read/:id      → Chapter images and metadata",
          "GET /manga/mangaball/tags          → List all available tags/genres",
          "GET /manga/mangaball/tags-detail   → Detailed tag statistics",
          "GET /manga/mangaball/image/* → Image proxy for bypass"
        ],
        allmanga: [
          "GET /manga/allmanga/home           → Home Page (Popular, Latest, Tags, Random)",
          "GET /manga/allmanga/latest         → Latest updated titles (?page=1)",
          "GET /manga/allmanga/popular        → Popular titles (?page=1&period=daily|weekly|monthly|all)",
          "GET /manga/allmanga/random         → Random recommendations",
          "GET /manga/allmanga/search         → Search titles (?q=query&page=1)",
          "GET /manga/allmanga/tags           → List all available tags, genres, and magazines",
          "GET /manga/allmanga/genre/:genre   → Search titles by genre/tag slug (?page=1)",
          "GET /manga/allmanga/author/:author → Search titles by author slug (?page=1)",
          "GET /manga/allmanga/detail         → Full title details and chapter list (?id=MangaID)",
          "GET /manga/allmanga/read           → Chapter images and metadata (?id=ChapterID)",
          "GET /manga/allmanga/image/* → Image proxy for CDN bypass"
        ]
      }
    };
  }, {
    detail: { 
      tags: ['manga'], 
      summary: 'Manga API Overview' 
    }
  })
  .use(mangaballRoutes)
  .use(allmangaRoutes);
