import { Bot, ImagePlus, Mic, TrendingUp, type LucideIcon } from "lucide-react";

export type StudioToolId =
  | "intelligence"
  | "assistant"
  | "image-generator"
  | "voiceover"
  | "trend-mapper";

export type StudioToolStatus = "live" | "next" | "planned";

export type StudioTool = {
  id: StudioToolId;
  name: string;
  tagline: string;
  description: string;
  status: StudioToolStatus;
  icon: LucideIcon;
  href: string;
};

export const studioTools: StudioTool[] = [
  {
    id: "assistant",
    name: "Cr8or AI",
    tagline: "Brainstorm, compose, and plan inside one creator workspace.",
    description:
      "Your AI copilot for content ideas, platform-ready drafts, analytics context, and next best moves.",
    status: "live",
    icon: Bot,
    href: "/ai-studio/assistant",
  },
  {
    id: "image-generator",
    name: "Image Generator",
    tagline: "Create visual concepts for posts and promos.",
    description: "AI art directions, cover concepts, ad creatives, and thumbnails.",
    status: "live",
    icon: ImagePlus,
    href: "/ai-studio/image-generator",
  },
  {
    id: "voiceover",
    name: "Voiceover",
    tagline: "Draft spoken scripts and narration beats.",
    description: "Voice script builder for reels, tutorials, promos, and explainer content.",
    status: "live",
    icon: Mic,
    href: "/ai-studio/voiceover",
  },
  {
    id: "trend-mapper",
    name: "Trend Mapper",
    tagline: "Find trend angles that fit your niche.",
    description: "Maps trending topics to practical post angles and creator actions.",
    status: "live",
    icon: TrendingUp,
    href: "/ai-studio/trend-mapper",
  },
];

export const toolStatusLabel: Record<StudioToolStatus, string> = {
  live: "Live",
  next: "Next up",
  planned: "Planned",
};
