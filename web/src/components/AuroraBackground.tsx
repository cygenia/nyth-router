export function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden bg-aurora">
      <div className="absolute inset-0 bubble-noise opacity-25" />
      <div aria-hidden className="aurora-mist aurora-mist-a" />
      <div aria-hidden className="aurora-mist aurora-mist-b" />
      <div aria-hidden className="aurora-wave aurora-wave-a" />
      <div aria-hidden className="aurora-wave aurora-wave-b" />
      <div aria-hidden className="aurora-wave aurora-wave-c" />
      <div aria-hidden className="aurora-drift-band" />
      <div aria-hidden className="aurora-orb aurora-orb-rose" />
      <div aria-hidden className="aurora-orb aurora-orb-violet" />
      <div aria-hidden className="aurora-orb aurora-orb-sky" />
      <div aria-hidden className="aurora-lines" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_38%,_var(--aurora-overlay)_100%)]" />
    </div>
  );
}
