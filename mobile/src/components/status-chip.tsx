import { View } from "react-native";
import { Text } from "@/components/text";
import type { DueStatus } from "@/lib/api/types";
import { useTheme } from "@/lib/theme";

// The words carry the meaning; color only reinforces it (same labels as the web).
const LABELS: Record<DueStatus, string> = { overdue: "Overdue", today: "Today", soon: "Soon", later: "Upcoming" };

export function StatusChip({ status }: { status: DueStatus }) {
  const { colors } = useTheme();
  const tone = {
    overdue: { fg: colors.overdue, bg: colors.overdue + "1f" },
    today: { fg: colors.signalInk, bg: colors.signal + "24" },
    soon: { fg: colors.soon, bg: colors.soon + "1f" },
    later: { fg: colors.mutedForeground, bg: colors.muted },
  }[status];
  return (
    <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
      <Text variant="mono" style={{ color: tone.fg, fontSize: 11 }} accessibilityLabel={`Status: ${LABELS[status]}`}>
        {LABELS[status]}
      </Text>
    </View>
  );
}
