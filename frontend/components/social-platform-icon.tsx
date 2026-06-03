import { Facebook, Instagram, Linkedin, Music2, Youtube } from "lucide-react";

export type SocialPlatformId =
  | "instagram"
  | "tiktok"
  | "x"
  | "facebook"
  | "linkedin"
  | "youtube_shorts"
  | "threads";

type SocialPlatformIconProps = {
  platform: SocialPlatformId;
  size?: number;
  className?: string;
};

function XIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M18.12 2H21l-6.3 7.2L22.2 22h-5.9l-4.63-5.8L6.6 22H3.7l6.76-7.73L1.8 2h6.04l4.2 5.28L18.12 2zm-1.03 18h1.64L6.95 3.9H5.2L17.1 20z" />
    </svg>
  );
}

function ThreadsIcon({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 9.2c0-3 2.1-5.2 5.3-5.2 3.5 0 5.8 2.4 5.8 6 0 4.8-3.6 7.8-8.2 7.8-4.1 0-6.9-2.5-6.9-6.3 0-3.5 2.4-6.1 6-6.1 3.4 0 5.3 1.8 6.1 4.8" />
      <path d="M12.6 11.3c4.4 0 7.2 1.6 7.2 4.3 0 2-1.7 3.2-4.3 3.2-2.7 0-4.7-1.3-4.7-3.4 0-2 1.8-3.2 4.5-3.2" />
    </svg>
  );
}

export function SocialPlatformIcon({ platform, size = 14, className }: SocialPlatformIconProps) {
  switch (platform) {
    case "instagram":
      return <Instagram size={size} className={className} />;
    case "tiktok":
      return <Music2 size={size} className={className} />;
    case "x":
      return <XIcon size={size} className={className} />;
    case "facebook":
      return <Facebook size={size} className={className} />;
    case "linkedin":
      return <Linkedin size={size} className={className} />;
    case "youtube_shorts":
      return <Youtube size={size} className={className} />;
    case "threads":
      return <ThreadsIcon size={size} className={className} />;
    default:
      return null;
  }
}
