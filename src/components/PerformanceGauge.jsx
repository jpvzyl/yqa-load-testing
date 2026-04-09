import { motion } from 'framer-motion';
import { clamp, scoreToColor } from '../lib/utils';

export default function PerformanceGauge({ score = 0, grade, size = 120 }) {
  const clamped = clamp(score, 0, 100);
  const strokeWidth = size * 0.08;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fillOffset = circumference - (clamped / 100) * circumference;
  const color = scoreToColor(clamped);
  const center = size / 2;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(30, 58, 95, 0.5)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: fillOffset }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {grade && (
          <span
            className="font-extrabold leading-none"
            style={{ color, fontSize: size * 0.28 }}
          >
            {grade}
          </span>
        )}
        <span
          className="font-semibold text-text-secondary leading-none"
          style={{ fontSize: size * 0.14, marginTop: grade ? 2 : 0 }}
        >
          {clamped}
        </span>
      </div>
    </div>
  );
}
