import { PlayerPerformanceChart } from "@/components/PlayerPerformanceChart";
import { usePerformanceContext } from "./PerformanceLayout";

/** Just the history chart, so recharts is only downloaded by people who open it. */
const PerformanceHistory = () => {
  const { currentUserId, userRole } = usePerformanceContext();
  return <PlayerPerformanceChart currentUserId={currentUserId} userRole={userRole} />;
};

export default PerformanceHistory;
