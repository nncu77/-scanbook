import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: base, priority: 1, changeFrequency: "monthly" },
    { url: `${base}/eval`, priority: 0.8, changeFrequency: "weekly" },
    { url: `${base}/login`, priority: 0.3, changeFrequency: "yearly" },
    { url: `${base}/signup`, priority: 0.3, changeFrequency: "yearly" },
  ];
}
