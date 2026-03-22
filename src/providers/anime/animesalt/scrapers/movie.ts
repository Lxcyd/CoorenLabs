import * as cheerio from "cheerio";
import { Cache } from "../../../../core/cache";
import { MOVIE_IFRAMES_TTL, ANIME_SALT_BASE } from "../lib/constants";
import { AnimeCard, Genre, Tag, Cast } from "../lib/types";
import { getDirectSources, getPlayerIframeUrls } from "./source";
import { Logger } from "../../toonstream/lib/logger";

export async function ScrapeMovies(page: number = 1) {
  const url =
    ANIME_SALT_BASE + "/movies/" + (page === 1 ? "" : `page/${page}/`);

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

      const type = url.includes("/series/") ? "series" : "movie";
      const slug = url.split("/").filter(Boolean).pop() || "";

      data.push({
        type,
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

    return { pagination, data };
  } catch (err) {
    Logger.error("ERROR", err);
  }
}

export async function ScrapeMovieInfo(slug: string) {
  const decodedURL = `${ANIME_SALT_BASE}/movies/${slug}/`;

  Logger.info("Fetching", decodedURL);

  try {
    const res = await fetch(decodedURL);
    if (!res.ok) throw new Error("Failed to fetch " + decodedURL);

    const html = await res.text();
    const $ = cheerio.load(html);

    // title extraction from h1
    const title = $("h1").first().text().trim();

    if (!title) throw new Error("title not found for " + decodedURL);

    // poster extraction from first img within .bd container
    const posterImg = $(".bd img").first();
    let poster =
      posterImg.attr("data-src") ||
      posterImg.attr("data-lazy-src") ||
      posterImg.attr("src") ||
      "";
    if (poster && poster.startsWith("//")) poster = "https:" + poster;

    // year and duration extraction from info components
    let year = "";
    let duration = "";

    $("div[style*='display: flex']").each((_, div) => {
      const text = $(div).text().trim();
      if (!text) return;

      // Match duration like 1h 45m
      if (/\d+h\s*\d+m/.test(text)) {
        duration = text;
      }
      // Match year like 2025
      if (/^\d{4}$/.test(text)) {
        year = text;
      }
    });

    // fallback to old selectors if not found
    if (!year) year = $(".entry-meta .year").text().trim();
    if (!duration) duration = $(".entry-meta .duration").text().trim();

    const description =
      $("#overview-text p").first().text().trim() ||
      $(".description p").first().text().trim();

    const genres: Genre[] = [];
    const languages: string[] = [];

    // Genres extraction from header/h4
    $("h4:contains('Genres')")
      .next("div")
      .find("a")
      .each((_, elem) => {
        const name = $(elem).text().trim();
        const url = $(elem).attr("href");
        if (!url) return;
        const slug = url.split("/").filter(Boolean).pop() || "";
        genres.push({ name, slug, url });
      });

    // Languages extraction
    $("h4:contains('Languages')")
      .next("div")
      .find("a")
      .each((_, elem) => {
        const lang = $(elem).text().trim();
        if (lang) languages.push(lang);
      });

    const downloadLinks: any[] = [];

    $(".mdl-cn.anm-b table tbody tr").each((_, elem) => {
      const row = $(elem);

      const server = row.find("td").eq(0).text().trim();
      const language = row.find("td").eq(1).text().trim();
      const quality = row.find("td").eq(2).text().trim();
      let url = row.find("td a").attr("href") || "";
      url = url.split(/[\s"]/)[0];

      if (!url) return;

      downloadLinks.push({
        server,
        language,
        quality,
        url,
      });
    });

    // Fallback for genres
    if (genres.length === 0) {
      $("span.genres a").each((_, elem) => {
        const name = $(elem).text().trim();
        const url = $(elem).attr("href");
        if (!url) return;
        const slug = url.split("/").filter(Boolean).pop() || "";
        genres.push({ name, slug, url });
      });
    }

    const recommendations: AnimeCard[] = [];

    const seen = new Set();

    $("section.section.episodes article").each((_, item) => {
      const el = $(item);

      const url = el.find("a.lnk-blk").attr("href") || "";
      if (!url) return;

      const slug = url.split("/").filter(Boolean).pop() || "";

      // prevent duplicates (carousel duplicates items)
      if (seen.has(slug)) return;
      seen.add(slug);

      const img = el.find(".post-thumbnail img");

      let poster =
        img.attr("data-src") ||
        img.attr("data-lazy-src") ||
        img.attr("src") ||
        "";

      if (poster.startsWith("//")) {
        poster = "https:" + poster;
      }

      const title = img.attr("alt")?.replace("Image ", "").trim() || slug;

      const type = url.includes("/series/") ? "series" : "movie";

      recommendations.push({
        type,
        title,
        slug,
        poster,
        url,
      });
    });

    return {
      title,
      year,
      duration,
      poster,
      description,
      languages,
      genres,
      downloadLinks,
      ...(await ScrapeMovieSources(slug, $)),
      recommendations,
    };
  } catch (err) {
    Logger.warn("ERROR", err);
  }
}

export async function ScrapeMovieSources(slug: string, $?: cheerio.CheerioAPI) {
  const url = `${ANIME_SALT_BASE}/movies/${slug}/`;

  const key = `movie:iframes:${slug}`;
  const cachedIframes = await Cache.get(key);

  if (cachedIframes) {
    const parsedIframes = JSON.parse(cachedIframes);
    const directSources = await getDirectSources(parsedIframes);

    return {
      embeds: parsedIframes,
      sources: directSources,
    };
  }

  try {
    if (!$) {
      Logger.info("Fetching", url);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch " + url);

      const html = await res.text();
      $ = cheerio.load(html);
    }

    const iframeUrls = $("aside#aa-options iframe")
      .map((_, el) => $(el).attr("data-src") || $(el).attr("src"))
      .get()
      .filter(Boolean);

    const playerIframeUrls = await getPlayerIframeUrls(iframeUrls);

    await Cache.set(key, JSON.stringify(playerIframeUrls), MOVIE_IFRAMES_TTL);

    const directSources = await getDirectSources(playerIframeUrls);

    return {
      embeds: playerIframeUrls,
      sources: directSources,
    };
  } catch (err) {
    Logger.error("ERROR", err);
  }
}
