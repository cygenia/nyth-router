type NythLogoProps = {
  size?: 'sm' | 'md' | 'lg' | 'hero';
  showWordmark?: boolean;
  className?: string;
};

const sizeMap = {
  sm: 'h-10 w-10',
  md: 'h-12 w-12',
  lg: 'h-16 w-16',
  hero: 'h-24 w-24',
};

export function NythLogo({ size = 'md', showWordmark = false, className = '' }: NythLogoProps) {
  const logo = (
    <div className={`nyth-logo ${sizeMap[size]} ${className}`} aria-label="NYTH logo">
      <span className="nyth-logo__aura" aria-hidden="true" />
      <span className="nyth-logo__orbit" aria-hidden="true"><span /></span>
      <span className="nyth-logo__orbit nyth-logo__orbit--two" aria-hidden="true"><span /></span>
      <span className="nyth-logo__palette nyth-logo__palette--base" aria-hidden="true" />
      <span className="nyth-logo__palette nyth-logo__palette--accent" aria-hidden="true" />
      <span className="nyth-logo__palette nyth-logo__palette--shine" aria-hidden="true" />
      <span className="nyth-logo__glint" aria-hidden="true" />
    </div>
  );

  if (!showWordmark) return logo;

  return (
    <div className="flex items-center gap-3">
      {logo}
      <div>
        <div className="font-display text-lg font-semibold tracking-tight text-ink-50">Nyth</div>
        <div className="text-[11px] tracking-[0.14em] text-ink-300">ready for work</div>
      </div>
    </div>
  );
}
