import * as cheerio from "cheerio";
import { Cache } from "../../../../core/cache";
import { EPISODE_IFRAMES_TTL, ANIME_SALT_BASE } from "../lib/constants";
import { AnimeCard, Season, Episode, Genre, Tag, Cast } from "../lib/types";
import { getDirectSources, getPlayerIframeUrls } from "./source";
import { Logger } from "../../../../core/logger";

export async function ScrapeSeries(page: number = 1) {
  const url =
    ANIME_SALT_BASE + "/series/" + (page === 1 ? "" : `page/${page}/`);

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

export async function ScrapeSeriesInfo(slug: string) {
  const decodedURL = `${ANIME_SALT_BASE}/series/${slug}/`;

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

    // info extraction
    let year = "";
    let runtime = "";
    let totalSeasons = 0;
    let totalEpisodes = 0;

    $("div[style*='display: flex']").each((_, div) => {
      const text = $(div).text().trim();
      if (!text) return;

      if (/\d+\s*h\s*\d+\s*m|\d+\s*m|\d+\s*min/i.test(text)) {
        runtime = text;
      }
      if (/^\d{4}$/.test(text)) {
        year = text;
      }
      if (text.includes("Seasons")) {
        totalSeasons = Number(text.replace("Seasons", "").trim()) || 0;
      }
      if (text.includes("Episodes")) {
        totalEpisodes = Number(text.replace("Episodes", "").trim()) || 0;
      }
    });

    // fallback to old selectors if not found
    if (!year) year = $(".entry-meta .year").text().trim();
    if (totalSeasons === 0)
      totalSeasons =
        Number(
          $(".entry-meta .seasons").text().replace("Seasons", "").trim(),
        ) || 0;
    if (totalEpisodes === 0)
      totalEpisodes =
        Number(
          $(".entry-meta .episodes").text().replace("Episodes", "").trim(),
        ) || 0;

    const description =
      $("#overview-text p").first().text().trim() ||
      $(".description p").first().text().trim();

    const genres: Genre[] = [];
    const tags: Tag[] = [];
    const casts: Cast[] = [];
    const languages: string[] = [];
    const qualities: string[] = [];

    // Genres extraction
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

    // Tags and casts
    $("span.tag a").each((_, elem) => {
      const name = $(elem).text().trim();
      const url = $(elem).attr("href");
      if (url) tags.push({ name, url });
    });

    $(".cast-lst a").each((_, elem) => {
      const name = $(elem).text().trim();
      const url = $(elem).attr("href");
      if (url) casts.push({ name, url });
    });

    // seasons
    const bodyClass = $("body").attr("class");
    const match = bodyClass?.match(/postid-(\d+)/) || [];
    const postId = match[1];

    if (!postId) throw new Error("postid not found for " + slug);

    const seasons: Season[] = await getSeasonsByPostId(
      postId,
      1,
      totalSeasons || 1,
    );

    const recommendations: AnimeCard[] = [];
    const seen = new Set();

    $("section.section.episodes").each((_, section) => {
      const sectionTitle = $(section).find(".section-title").text().trim();

      // only process "Recommended Series"
      if (!sectionTitle.includes("Recommended")) return;

      $(section)
        .find("article")
        .each((_, item) => {
          const el = $(item);

          const url = el.find("a.lnk-blk").attr("href") || "";
          if (!url) return;

          const slug = url.split("/").filter(Boolean).pop() || "";

          if (seen.has(slug)) return;
          seen.add(slug);

          const img = el.find("img");

          let poster =
            img.attr("data-src") ||
            img.attr("data-lazy-src") ||
            img.attr("src") ||
            "";

          if (poster.startsWith("//")) poster = "https:" + poster;

          const title = img.attr("alt")?.replace("Image ", "").trim() || slug;

          const type = url.includes("/series/") ? "series" : "movie";

          recommendations.push({ type, title, slug, poster, url });
        });
    });

    return {
      title,
      year,
      totalSeasons,
      totalEpisodes,
      description,
      languages,
      qualities,
      runtime,
      poster,
      seasons,
      recommendations,
    };
  } catch (err) {
    Logger.error("ERROR", err);
  }
}

async function getSeasonsByPostId(
  postId: string,
  start_season: number,
  end_season: number,
) {
  const seasons: Season[] = [];

  for (let i = start_season; i <= end_season; i++) {
    const episodes: Episode[] = [];

    const res = await fetch(ANIME_SALT_BASE + "/wp-admin/admin-ajax.php", {
      headers: {
        accept: "*/*",
        "cache-control": "no-cache",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        pragma: "no-cache",
        "x-requested-with": "XMLHttpRequest",
      },
      body: `action=action_select_season&season=${i}&post=${postId}`,
      method: "POST",
    });

    if (!res.ok) {
      Logger.error(
        "Error: failed to fetch season " + i + " episodes for postid-" + postId,
      );
      continue;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    $("li").each((j, ep) => {
      const url = $(ep).find("a").attr("href");
      const thumbnail =
        $(ep).find("img").attr("data-src") || $(ep).find("img").attr("src");

      if (!url || !thumbnail) return;

      const slug = url.split("/").filter(Boolean).pop() || "";

      let title = $(ep).find(".entry-title").text().trim();
      if (!title) {
        title =
          $(ep)
            .find("img")
            .attr("alt")
            ?.replace(/^Image\s+/i, "")
            .trim() || "";
      }

      const epXseason = $(ep).find(".num-epi").text().trim();

      episodes.push({
        episode_no: j + 1,
        slug,
        title,
        url,
        epXseason,
        thumbnail,
      });
    });

    seasons.push({
      label: `Season ${i}`,
      season_no: i,
      episodes,
    });
  }

  return seasons;
}

export async function ScrapeEpisodeSources(slug: string) {
  const url = `${ANIME_SALT_BASE}/episode/${slug}/`;

  const key = `episode:iframes:${slug}`;
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
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch " + url);

    const html = await res.text();
    const $ = cheerio.load(html);

    const iframeUrls = $("aside#aa-options iframe")
      .map((_, el) => $(el).attr("data-src") || $(el).attr("src"))
      .get()
      .filter(Boolean);

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

    const playerIframeUrls = await getPlayerIframeUrls(iframeUrls);
    Cache.set(key, JSON.stringify(playerIframeUrls), EPISODE_IFRAMES_TTL);

    const directSources = await getDirectSources(playerIframeUrls);

    return {
      embeds: playerIframeUrls,
      downloadLinks,
      sources: directSources,
    };
  } catch (err) {
    Logger.error("ERROR", err);
  }
}
