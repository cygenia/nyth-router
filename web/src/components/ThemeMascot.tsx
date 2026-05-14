import { NythLogo } from './NythLogo';
import { ThemeName } from '../lib/preferences';

type ThemeMascotProps = {
  theme: ThemeName;
  variant?: 'login' | 'home';
  className?: string;
};

export function ThemeMascot({ theme, variant = 'home', className = '' }: ThemeMascotProps) {
  return (
    <div className={`theme-mascot theme-mascot--logo theme-mascot--${variant} theme-mascot--${theme} ${className}`} aria-hidden="true">
      <div className="theme-mascot__glow theme-mascot__glow--back" />
      <div className="theme-mascot__logo-wrap">
        <NythLogo size="hero" />
      </div>
      <div className="theme-mascot__sheen" />
      <div className="theme-mascot__floor" />
    </div>
  );
}
