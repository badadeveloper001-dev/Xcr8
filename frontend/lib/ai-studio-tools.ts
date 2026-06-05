import { Bot, ImagePlus, Lightbulb, Mic, TrendingUp, Wand2, type LucideIcon } from "lucide-react";

export type StudioToolId =
  | "assistant"
  | "composer"
  | "brainstorm"
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
    tagline: "Your named AI copilot across every creator screen.",
    description:
      "Conversational workspace guide that answers product questions and plans next moves.",
    status: "live",
    icon: Bot,
    href: "/ai-studio/assistant",
  },
  {
    id: "composer",
    name: "Composer",
    tagline: "Talk your way into a full post concept.",
    description: "Conversational writing partner for posts, hooks, structure, and CTA.",
    status: "live",
    icon: Wand2,
    href: "/ai-studio/composer",
  },
  {
    id: "brainstorm",
    name: "Brainstorm",
    tagline: "Generate batches of angles and hooks fast.",
    description: "Idea engine for campaigns, content series, and creator brand growth.",
    status: "live",
    icon: Lightbulb,
    href: "/ai-studio/brainstorm",
  },
  {
    id: "image-generator",
    name: "Image Generator",
    tagline: "Create visual concepts for posts and promos.",
    description: "AI art directions, cover concepts, ad creatives, and thumbnails.",
    status: "next",
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
