/**
 * Logo — renders the latest provided XCR8 brand image as-is.
 *
 * The asset already contains the full centered mark, so the component only
 * controls the display width and preserves the SVG aspect ratio.
 */

type LogoSize = "sm" | "md";

const sizes: Record<LogoSize, number> = {
  // standard nav / card header
  md: 180,
  // compact (e.g. mobile nav, onboarding step)
  sm: 132,
};

export function Logo({ size = "md", className = "" }: { size?: LogoSize; className?: string }) {
  const width = sizes[size];

  return (
    <div
      className={`relative shrink-0 ${className}`}
      style={{ width }}
      aria-label="XCR8"
      role="img"
    >
      <img
        className="block dark:hidden"
        src="/Xcr8_black-removebg-preview.png"
        alt="XCR8"
        style={{ width: "100%", height: "auto", pointerEvents: "none", userSelect: "none" }}
        draggable={false}
      />
      <img
        className="hidden dark:block"
        src="/5d03bb27-9df6-417f-b28f-5984e329bdc0-removebg-preview.png"
        alt="XCR8"
        style={{ width: "100%", height: "auto", pointerEvents: "none", userSelect: "none" }}
        draggable={false}
      />
    </div>
  );
}
