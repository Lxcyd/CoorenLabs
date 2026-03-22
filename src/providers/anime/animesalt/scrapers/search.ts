import * as cheerio from "cheerio";
import { ANIME_SALT_BASE } from "../lib/constants";
import { AnimeCard } from "../lib/types";
import { Logger } from "../../../../core/logger";

export async function ScrapeSearch(query: string, page: number = 1) {
  const url =
    page === 1
      ? `${ANIME_SALT_BASE}/?s=${encodeURIComponent(query).replaceAll("%20", "+")}`
      : `${ANIME_SALT_BASE}/page/${page}/?s=${encodeURIComponent(query).replaceAll("%20", "+")}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch " + url);

    const html = await res.text();
    const $ = cheerio.load(html);

    const data: AnimeCard[] = [];

    $(".aa-cn ul li").each((_, item) => {
      const el = $(item);

      const url =
        el.find("a.lnk-blk").attr("href") ||
        el.find("article a").attr("href") ||
        "";
      const img = el.find(".post-thumbnail img");

      let poster =
        img.attr("data-src") ||
        img.attr("data-lazy-src") ||
        img.attr("src") ||
        "";

      if (poster.startsWith("//")) poster = "https:" + poster;

      if (!url || !poster) return;

      const type = url.includes("/series/") ? "series" : "movie";

      let title = el.find(".entry-title").text().trim();
      if (!title) {
        title =
          img
            .attr("alt")
            ?.replace(/^Image\s+/i, "")
            .trim() || "";
      }

      const slug = url.split("/").filter(Boolean).pop() || "";

      data.push({ type, title, slug, poster, url });
    });

    // pagination
    const start = 1;
    const current = page;
    const end = Number($("nav.pagination a.page-link").last().text() || 1);

    const pagination = { current, start, end };
    return { query, pagination, data };
  } catch (err) {
    Logger.error("ERROR", err);
  }
}
