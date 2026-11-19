import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "ADA OPS LIVESTREAM",
    short_name: "ADA OPS",
    description: "Livestream Operations Management",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    shortcuts: [
      { name: "Lịch ca", short_name: "Lịch ca", url: "/calendar" },
      { name: "Hồ sơ", short_name: "Hồ sơ", url: "/profile" },
      { name: "Thông báo", short_name: "Thông báo", url: "/notifications" },
    ],
    background_color: "#07183B",
    theme_color: "#07183B",
    icons: [
      { src: "/icon1", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon3", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
