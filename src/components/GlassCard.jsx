import { cn } from '../lib/utils';

export default function GlassCard({ children, className, onClick, hover = false }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'glass-card p-5',
        hover && 'cursor-pointer hover:border-accent/50 hover:shadow-lg hover:shadow-accent/5',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  );
}
