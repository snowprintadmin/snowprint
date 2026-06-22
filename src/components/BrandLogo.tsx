type BrandLogoProps = {
  size?: "sm" | "md" | "lg" | "xl";
  showText?: boolean;
  subtitle?: string;
};

const sizeClass = {
  sm: "h-12 w-12 rounded-2xl",
  md: "h-16 w-16 rounded-[1.35rem]",
  lg: "h-20 w-20 rounded-[1.5rem]",
  xl: "h-28 w-28 rounded-[2rem]"
};

export default function BrandLogo({
  size = "md",
  showText = true,
  subtitle = "Friendly printing made easy"
}: BrandLogoProps) {
  return (
    <div className="flex items-center gap-4">
      <div
        className={`${sizeClass[size]} flex shrink-0 items-center justify-center overflow-hidden bg-white shadow-card`}
      >
        <img
          src="/brand/snowprint-logo.png"
          alt="SnowPrint logo"
          className="h-full w-full object-contain"
          onError={(event) => {
            event.currentTarget.style.display = "none";
            const parent = event.currentTarget.parentElement;
            if (parent) parent.textContent = "🐶";
          }}
        />
      </div>

      {showText && (
        <div>
          <p className="text-xl font-black leading-tight text-snow-navy">
            SnowPrint
          </p>
          <p className="text-xs text-snow-muted">{subtitle}</p>
        </div>
      )}
    </div>
  );
}
