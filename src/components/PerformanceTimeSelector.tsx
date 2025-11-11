import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PerformanceTimeSelectorProps {
  selectedMonths: number;
  onSelect: (months: number) => void;
}

const timeRanges = [
  { label: "1M", months: 1 },
  { label: "3M", months: 3 },
  { label: "6M", months: 6 },
  { label: "12M", months: 12 },
  { label: "18M", months: 18 },
  { label: "3Y", months: 36 },
];

export function PerformanceTimeSelector({ selectedMonths, onSelect }: PerformanceTimeSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {timeRanges.map((range) => (
        <Button
          key={range.months}
          variant={selectedMonths === range.months ? "default" : "outline"}
          size="sm"
          onClick={() => onSelect(range.months)}
          className={cn(
            "min-w-[60px]",
            selectedMonths === range.months && "bg-primary text-primary-foreground"
          )}
        >
          {range.label}
        </Button>
      ))}
    </div>
  );
}
