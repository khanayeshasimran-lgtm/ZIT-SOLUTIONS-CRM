import { BarChart3 } from 'lucide-react';

interface EmptyChartProps {
  title: string;
  message?: string;
}

export const EmptyChart = ({ title, message = "Add data to see insights" }: EmptyChartProps) => {
  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">{title}</h3>
      <div className="empty-state h-64">
        <BarChart3 className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <p className="text-muted-foreground">{message}</p>
      </div>
    </div>
  );
};
