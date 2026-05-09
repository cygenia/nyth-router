import { motion } from 'framer-motion';

// Animated aurora-style background with floating bubble "elementals" and a
// soft grid noise pattern. Sits behind the entire app at z-index 0.
export function AuroraBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-0 overflow-hidden bg-aurora">
      <div className="absolute inset-0 bubble-noise opacity-60" />
      <motion.div
        aria-hidden
        className="absolute -top-40 -left-32 h-[640px] w-[640px] rounded-full bg-aurora-rose/40 blur-[140px]"
        animate={{ x: [0, 80, -50, 0], y: [0, 50, -30, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="absolute top-1/3 -right-40 h-[560px] w-[560px] rounded-full bg-aurora-violet/40 blur-[160px]"
        animate={{ x: [0, -60, 70, 0], y: [0, 40, -50, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="absolute -bottom-40 left-1/4 h-[640px] w-[640px] rounded-full bg-aurora-sky/30 blur-[160px]"
        animate={{ x: [0, 70, -40, 0], y: [0, -40, 30, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-1/4 right-1/4 h-[420px] w-[420px] rounded-full bg-aurora-mint/30 blur-[140px]"
        animate={{ x: [0, -40, 40, 0], y: [0, 40, -40, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* tiny floating bubbles */}
      {bubbles.map((b, i) => (
        <motion.div
          key={i}
          aria-hidden
          className="absolute rounded-full mix-blend-screen blur-2xl"
          style={{
            left: `${b.left}%`,
            top: `${b.top}%`,
            width: b.size,
            height: b.size,
            background: b.color,
            opacity: 0.55,
          }}
          animate={{ y: [0, -25, 0], x: [0, 12, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 6 + b.delay, repeat: Infinity, ease: 'easeInOut', delay: b.delay }}
        />
      ))}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_transparent_30%,_rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}

const bubbles = [
  { left: 10, top: 14, size: 60, color: '#ff8fb6', delay: 0.1 },
  { left: 28, top: 70, size: 90, color: '#bca5ff', delay: 0.5 },
  { left: 58, top: 32, size: 45, color: '#9ec9ff', delay: 1.2 },
  { left: 76, top: 16, size: 70, color: '#9ce4c5', delay: 1.6 },
  { left: 88, top: 72, size: 55, color: '#fff4a4', delay: 2.0 },
  { left: 38, top: 12, size: 35, color: '#ffd2a4', delay: 2.4 },
  { left: 65, top: 80, size: 50, color: '#f6a4ff', delay: 2.8 },
];
