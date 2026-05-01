/**
 * src/components/GlassTile.tsx
 *
 * DAY 1 FIX: The original file accepted an `icon` prop but never rendered it.
 * The component body closed with a comment explaining what should happen.
 * Fixed: icon is now rendered inside the tile at a size proportional to `size`.
 */

interface GlassTileProps {
  size: number;
  icon: React.ReactNode;
  glowColor: string;
  delay?: number;
}

export const GlassTile = ({ size, icon, glowColor, delay = 0 }: GlassTileProps) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: Math.round(size * 0.26),
      background:
        'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
      border: '1px solid rgba(255,255,255,0.1)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: `0 8px 32px rgba(0,0,0,0.3), 0 0 20px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.1)`,
      animationDelay: `${delay}s`,
    }}
  >
    {/* Render icon at ~40% of tile size, capped for readability */}
    <div
      style={{
        width: Math.min(Math.round(size * 0.4), 48),
        height: Math.min(Math.round(size * 0.4), 48),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'rgba(255,255,255,0.85)',
        filter: `drop-shadow(0 0 6px ${glowColor})`,
      }}
    >
      {icon}
    </div>
  </div>
);