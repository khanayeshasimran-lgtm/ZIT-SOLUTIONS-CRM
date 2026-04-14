// src/components/GlassTile.tsx
interface GlassTileProps {
  size: number;
  icon: React.ReactNode;
  glowColor: string;
  delay?: number;
}

export const GlassTile = ({ size, icon, glowColor, delay = 0 }: GlassTileProps) => (
  <div style={{
    width: size,
    height: size,
    borderRadius: Math.round(size * 0.26),
    background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)',
    border: '1px solid rgba(255,255,255,0.1)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: `0 8px 32px rgba(0,0,0,0.3), 0 0 20px ${glowColor}, inset 0 1px 0 rgba(255,255,255,0.1)`,
    animationDelay: `${delay}s`,
  }} />
  // inner wrapper to apply delay independently from parent float
  // just wrap icon in a div
);