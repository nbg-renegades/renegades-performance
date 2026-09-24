import { PerformanceRadarChart } from "@/components/PerformanceRadarChart";
import { PerformanceNeighborhood } from "@/components/PerformanceNeighborhood";
import { usePerformanceContext } from "./context";

/**
 * The radar comparison and the neighbourhood panel answer the same question - where do I
 * stand against the squad - so they belong on one screen.
 *
 * usePerformanceComparison subscribes to every change on performance_entries and refetches
 * when one lands. That subscription now only exists while this route is mounted, instead
 * of on every visit to /performance.
 */
const PerformanceComparison = () => {
  const { currentUserId, userRole } = usePerformanceContext();
  return (
    <div className="space-y-4 md:space-y-6">
      <PerformanceRadarChart currentUserId={currentUserId} userRole={userRole} />
      <PerformanceNeighborhood playerId={currentUserId} />
    </div>
  );
};

export default PerformanceComparison;
