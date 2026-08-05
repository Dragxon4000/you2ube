import type { MetadataRoute } from "next";

/**
 * Static sitemap for SEO. The app is a single-page dashboard, so there's
 * really only one meaningful URL: the home page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://you2ube.app";
  return [
    {
      url: appUrl,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
