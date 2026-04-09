import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import GlassCard from './GlassCard';
import { cn } from '../lib/utils';

const TREND_CONFIG = {
  up: { icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/15' },
  down: { icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/15' },
  neutral: { icon: Minus, color: 'text-text-secondary', bg: 'bg-gray-500/15' },
};

function AnimatedNumber({ value, duration = 1.2 }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });

  const numericValue = typeof value === 'string' ? parseFloat(value.replace(/[^0-9.-]/g, '')) : value;
  const suffix = typeof value === 'string' ? value.replace(/[0-9.,\-\s]/g, '') : '';
  const hasDecimal = String(value).includes('.');
  const decimalPlaces = hasDecimal ? (String(value).split('.')[1]?.replace(/[^0-9]/g, '').length || 0) : 0;

  useEffect(() => {
    if (!inView || isNaN(numericValue)) return;

    let start = 0;
    const startTime = performance.now();
    const step = (now) => {
      const progress = Math.min((now - startTime) / (duration * 1000), 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      start = eased * numericValue;
      setDisplay(start);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [inView, numericValue, duration]);

  if (isNaN(numericValue)) return <span>{value}</span>;

  return (
    <span ref={ref}>
      {hasDecimal ? display.toFixed(decimalPlaces) : Math.round(display).toLocaleString()}
      {suffix}
    </span>
  );
}

export default function MetricCard({ label, value, subtitle, trend, color, className }) {
  const trendInfo = trend ? TREND_CONFIG[trend] || TREND_CONFIG.neutral : null;
  const TrendIcon = trendInfo?.icon;

  return (
    <GlassCard className={cn('relative overflow-hidden', className)}>
      {color && (
        <div
          className="absolute top-0 left-0 w-1 h-full rounded-l-xl"
          style={{ backgroundColor: color }}
        />
      )}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">
            {label}
          </p>
          <motion.p
            className="text-2xl font-bold text-text-primary"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <AnimatedNumber value={value} />
          </motion.p>
          {subtitle && (
            <p className="text-xs text-text-muted">{subtitle}</p>
          )}
        </div>
        {trendInfo && TrendIcon && (
          <span className={cn('inline-flex items-center rounded-full p-1.5', trendInfo.bg)}>
            <TrendIcon className={cn('w-3.5 h-3.5', trendInfo.color)} />
          </span>
        )}
      </div>
    </GlassCard>
  );
}
