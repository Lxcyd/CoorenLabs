import * as cheerio from "cheerio";
import { ANIME_SALT_BASE } from "../lib/constants";
import { AnimeCard } from "../lib/types";
import { Logger } from "../../../../core/logger";
import { Cache } from "../../../../core/cache";

const CATEGORY_CACHE_TTL = 60 * 60 * 24 * 7; // 1 week

export async function ScrapeCategory(
  type: string,
  page: number = 1,
  filter?: string,
) {
  const cacheKey = `category:${type}:${filter || "all"}:page:${page}`;

  // 🔥 1. Check cache first
  const cached = await Cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const url =
    ANIME_SALT_BASE +
    "/category/" +
    type +
    "/" +
    (page === 1 ? "" : `page/${page}/`) +
    (filter ? `?type=${filter}` : "");

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch " + url);

    const html = await res.text();
    const $ = cheerio.load(html);

    const data: AnimeCard[] = [];

    $(".aa-cn ul li").each((_, item) => {
      const el = $(item);

      let title = el.find(".entry-title").text().trim();
      if (!title) {
        title =
          el
            .find("img")
            .attr("alt")
            ?.replace(/^Image\s+/i, "")
            .trim() || "";
      }

      const url = el.find("a.lnk-blk").attr("href") || "";

      const img = el.find(".post-thumbnail img");

      let poster =
        img.attr("data-src") ||
        img.attr("data-lazy-src") ||
        img.attr("src") ||
        "";

      if (poster.startsWith("//")) poster = "https:" + poster;

      if (!url || !poster) return;

      const itemType = url.includes("/series/") ? "series" : "movie";
      const slug = url.split("/").filter(Boolean).pop() || "";

      data.push({
        type: itemType,
        title,
        slug,
        poster,
        url,
      });
    });

    // pagination
    const start = 1;
    const current = page;
    const end = Number($("nav.pagination a.page-link").last().text() || 1);

    const pagination = { current, start, end };
    const cgType = type.split("/").pop();

    const result = { cgType, pagination, data };

    // 🔥 2. Save to cache
    await Cache.set(cacheKey, JSON.stringify(result), CATEGORY_CACHE_TTL);

    return result;
  } catch (err) {
    Logger.error("ERROR", err);
  }
}
