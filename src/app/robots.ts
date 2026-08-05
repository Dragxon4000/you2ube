import type { MetadataRoute } from "next";

/**
 * Static robots.txt served at /robots.txt.
 *
 * Disallows crawlers from API routes (they're not user-facing content and
 * can trigger rate limits / session creation on crawl). Allows everything
 * else including the home page.
 */
export default function robots(): MetadataRoute.Robots {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://you2ube.app";
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/_next/"],
      },
    ],
    sitemap: `${appUrl}/sitemap.xml`,
  };
}
