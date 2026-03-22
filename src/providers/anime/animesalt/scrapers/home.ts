import * as cheerio from "cheerio";
import { ANIME_SALT_BASE } from "../lib/constants";
import { Logger } from "../../../../core/logger";
import {
  AnimeCard,
  LastEpisode,
  MainSection,
  SidebarSection,
} from "../lib/types";

export async function ScrapeHomePage() {
  try {
    const url = ANIME_SALT_BASE + "/";
    const res = await fetch(url);

    if (!res.ok) throw new Error("Failed to fetch " + url);

    const html = await res.text();
    const $ = cheerio.load(html);

    const mainSections: MainSection[] = [];
    const sidebarSections: SidebarSection[] = [];
    const lastEpisodes: LastEpisode[] = [];
    const networks: {
      name: string;
      slug: string;
      url: string;
      logo: string;
    }[] = [];

    $("#gs_logo_area_3 a").each((_, el) => {
      const link = $(el);
      const url = link.attr("href") || "";
      if (!url.includes("/category/network/")) return;

      const slug = url.split("/").filter(Boolean).pop() || "";
      const img = link.find("img");

      const name = img.attr("title")?.trim() || img.attr("alt")?.trim() || slug;

      let logo = img.attr("data-src") || img.attr("src") || "";
      if (logo.startsWith("//")) logo = "https:" + logo;

      networks.push({ name, slug, url, logo });
    });

    // 1. Fresh Drops (Last Episodes)
    $(".widget_list_episodes").each((_, sect) => {
      $(sect)
        .find(".latest-ep-swiper-slide li")
        .each((_, ep) => {
          const url = $(ep).find("a.lnk-blk").attr("href");
          const thumbnail =
            $(ep).find(".post-thumbnail img").attr("data-src") ||
            $(ep).find(".post-thumbnail img").attr("src") ||
            "";

          if (!url || !thumbnail) return;

          const slug = url.split("/").filter(Boolean).pop() || "";
          let title = $(ep).find("header h2.entry-title").text().trim();
          if (!title) {
            title =
              $(ep)
                .find(".post-thumbnail img")
                .attr("alt")
                ?.replace(/^Image\s+/i, "")
                .trim() || "";
          }
          const season = $(ep).find(".post-thumbnail .post-ql").text().trim();
          const epNum = $(ep).find(".post-thumbnail .year").text().trim();
          const epXseason = `${season} ${epNum}`.trim();

          lastEpisodes.push({
            title,
            slug,
            url,
            epXseason,
            ago: "",
            thumbnail,
          });
        });
    });

    // 2. Main Swiper Sections (On-Air Series, New Anime Arrivals, etc)
    $("section.widget_list_movies_series").each((_, sect) => {
      const titleElem = $(sect).find("h3.section-title a");
      // Extract text but remove the "View More" part if it's there
      let sectionTitle = titleElem
        .clone()
        .children()
        .remove()
        .end()
        .text()
        .trim();
      if (!sectionTitle)
        sectionTitle = $(sect).find("h3.section-title").text().trim();

      const viewMoreUrl = titleElem.attr("href");

      const data: AnimeCard[] = [];

      $(sect)
        .find(".latest-movies-series-swiper-slide li")
        .each((_, item) => {
          const img = $(item).find("article .post-thumbnail img");
          const title = img.attr("alt")?.replace("Image ", "") || "";
          const url = $(item).find("article a.lnk-blk").attr("href") || "";
          const poster = img.attr("data-src") || img.attr("src") || "";

          if (!url || !poster) return;

          const type = url.includes("/series/") ? "series" : "movie";
          const slug = url.split("/").filter(Boolean).pop() || "";

          data.push({ type, title, slug, poster, url });
        });

      if (data.length) {
        mainSections.push({ label: sectionTitle, viewMore: viewMoreUrl, data });
      }
    });

    // 3. Chart Sections (Most-Watched Series, Most-Watched Films)
    // These are identified by h3.section-title followed by .aa-cn chart area
    $(".section-title").each((_, header) => {
      const label = $(header).text().trim();
      // Skip if it's already part of mainSections (though those titles are usually inside a section)
      if ($(header).closest("section.widget_list_movies_series").length) return;

      const chartArea = $(header).nextAll(".aa-cn").first();
      if (!chartArea.length) return;

      const data: AnimeCard[] = [];

      chartArea.find(".chart-item").each((_, item) => {
        const title = $(item).find(".chart-title").text().trim();
        const url = $(item).find("a.chart-poster").attr("href") || "";
        const img = $(item).find(".chart-poster img");
        const poster = img.attr("data-src") || img.attr("src") || "";

        if (!url || !poster) return;

        const type = url.includes("/series/") ? "series" : "movie";
        const slug = url.split("/").filter(Boolean).pop() || "";

        data.push({ type, title, slug, poster, url });
      });

      if (data.length) {
        sidebarSections.push({ label, data });
      }
    });

    return {
      networks,
      main: mainSections,
      sidebar: sidebarSections,
      lastEpisodes,
    };
  } catch (err) {
    Logger.error("ScrapeHomePage Error:", err);
  }
}
