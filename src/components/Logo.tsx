/**
 * Логотип FREZALVIV, намальований у коді — не залежить від файлу картинки
 * і лишається різким на будь-якому екрані.
 *
 * Знак лишає власні фірмові кольори (синє коло, білий знак), решта
 * інтерфейсу — золото на темному, як і було.
 */

const BLUE_DARK = "#0b6ea4";
const BLUE_LIGHT = "#1b93cf";

/** Тільки знак — для шапки, вкладки, дрібних місць. */
export function LogoMark({ size = 44, className = "" }: { size?: number; className?: string }) {
  const id = `freza-mark-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="FREZALVIV"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={BLUE_LIGHT} />
          <stop offset="1" stopColor={BLUE_DARK} />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="24" fill={`url(#${id})`} />
      {/* дуга — натяк на обертання фрези */}
      <path
        d="M13 30a13 13 0 0 1 6-17"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* блискавка */}
      <path d="M27.5 8 L15 27h7.6L20 40l13.5-19.5H26L27.5 8z" fill="#fff" />
    </svg>
  );
}

/** Знак разом із назвою — для сайдбара, сторінки входу. */
export function Logo({ size = 44, className = "" }: { size?: number; className?: string }) {
  return (
    <span className={`flex items-center gap-3 ${className}`}>
      <LogoMark size={size} />
      <span
        className="font-bold tracking-wide"
        style={{ fontSize: size * 0.52, lineHeight: 1 }}
      >
        <span style={{ color: BLUE_LIGHT }}>FREZA</span>
        <span className="text-ink-muted">LVIV</span>
      </span>
    </span>
  );
}
