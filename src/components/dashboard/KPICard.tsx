import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KPICardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  isEmpty?: boolean;
  variant?: 'default' | 'gradient';
}

export const KPICard = ({ title, value, icon: Icon, trend, isEmpty, variant = 'default' }: KPICardProps) => {
  return (
    <div 
      className={cn(
        "relative overflow-hidden rounded-xl border border-border p-6 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
        variant === 'gradient' 
          ? "bg-gradient-to-br from-primary/10 via-background to-background" 
          : "bg-card"
      )}
    >
      {/* Decorative background pattern */}
      <div className="absolute top-0 right-0 w-32 h-32 opacity-[0.03] pointer-events-none">
        <Icon className="w-full h-full" />
      </div>
      
      <div className="relative flex items-start justify-between">
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className={cn(
            "text-2xl font-bold tracking-tight",
            isEmpty ? "text-muted-foreground" : "text-foreground"
          )}>
            {isEmpty ? '—' : value}
          </p>
          {trend && !isEmpty && (
            <div className="flex items-center gap-1 mt-2">
              <span
                className={cn(
                  "inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full",
                  trend.isPositive 
                    ? "bg-success/10 text-success" 
                    : "bg-destructive/10 text-destructive"
                )}
              >
                {trend.isPositive ? '↑' : '↓'} {Math.abs(trend.value)}%
              </span>
              <span className="text-xs text-muted-foreground">vs last month</span>
            </div>
          )}
          {isEmpty && (
            <p className="text-xs text-muted-foreground mt-1">No data yet</p>
          )}
        </div>
        <div className={cn(
          "h-12 w-12 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
          variant === 'gradient'
            ? "bg-primary text-primary-foreground shadow-lg"
            : "bg-primary/10 text-primary"
        )}>
          <Icon className="h-6 w-6" />
        </div>
      </div>
    </div>
  );
};
