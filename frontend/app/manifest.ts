import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GraspMind AI",
    short_name: "GraspMind",
    description: "AI-powered study platform for students",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#111111",
    icons: [
      {
        src: "/grasp.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
