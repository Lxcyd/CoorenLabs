import * as cheerio from "cheerio";
import { PROXIFY } from "../route";
import { Cache } from "../../../../core/cache";
import {
  ASCDN_SOURCE_TTL,
  embedPlayerOrigins,
  RUBYSTREAM_SOURCE_TTL,
} from "../lib/constants";
import { getRubystmSource } from "./embed/rubystm";
import { getAsCdnSource } from "./embed/as-cdn";
import { DirectSource } from "../lib/types";
import { proxifySource } from "../lib/proxy";
import { Logger } from "../../../../core/logger";

export async function getPlayerIframeUrls(iframeUrls: string[]) {
  const playerIframeUrls = [];
  const { asCdnOrigin, rubyStreamOrigin, cloudyUpnOrigin } = embedPlayerOrigins;
  const directOrigins = [asCdnOrigin, rubyStreamOrigin, cloudyUpnOrigin];

  for (let url of iframeUrls) {
    if (!url) continue;
    if (url.startsWith("//")) url = "https:" + url;

    // If it is already a direct player URL, add it directly
    if (directOrigins.some((origin) => url.startsWith(origin))) {
      playerIframeUrls.push(url);
      continue;
    }

    try {
      const res = await fetch(url);
      if (!res.ok) {
        Logger.warn(`Error fetching player-iframe url from - ${url}`);
        continue;
      }

      const html = await res.text();
      const $ = cheerio.load(html);

      let iframeUrl =
        $(".Video iframe").attr("src") || $("iframe").first().attr("src");
      if (!iframeUrl) continue;

      if (iframeUrl.startsWith("//")) iframeUrl = "https:" + iframeUrl;
      playerIframeUrls.push(iframeUrl);
    } catch (err) {
      Logger.error("Error:", err);
    }
  }

  Logger.info(`Scraped ${playerIframeUrls.length} player iframe url(s)`);
  return playerIframeUrls;
}

const { asCdnOrigin, rubyStreamOrigin } = embedPlayerOrigins;

export async function getDirectSources(playerIframeUrls: string[]) {
  const directSources: DirectSource[] = [];

  for (const url of playerIframeUrls) {
    try {
      if (url.startsWith(asCdnOrigin)) {
        const key = `source:${url}`;
        const cachedSource = await Cache.get(key);

        if (cachedSource) {
          directSources.push(JSON.parse(cachedSource));
        } else {
          const src = await getAsCdnSource(url);
          if (src) {
            Cache.set(key, JSON.stringify(src), ASCDN_SOURCE_TTL);
            directSources.push(src);
          }
        }
      } else if (url.startsWith(rubyStreamOrigin)) {
        const key = `source:${url}`;
        const cachedSource = await Cache.get(key);

        if (cachedSource) {
          directSources.push(JSON.parse(cachedSource));
        } else {
          const src = await getRubystmSource(url);
          if (src) {
            Cache.set(key, JSON.stringify(src), RUBYSTREAM_SOURCE_TTL);
            directSources.push(src);
          }
        }
      } else Logger.warn("No source-scraper found for", url, "- skipping");
    } catch (err) {
      Logger.error("Error:", err);
    }
  }

  Logger.info(`Successfully Scraped ${directSources.length} direct source(s)`);

  if (PROXIFY) {
    return directSources.map((src) => proxifySource(src));
  } else {
    return directSources;
  }
}
