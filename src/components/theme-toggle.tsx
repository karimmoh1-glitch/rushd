"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

const CYCLE = ["light", "dark", "system"] as const;
const ICONS = { light: Sun, dark: Moon, system: MonitorSmartphone };
const LABELS = { light: "Light", dark: "Dark", system: "System" };

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoids a hydration mismatch: the server has no idea what the client's
  // resolved theme is, so render nothing meaningful until after mount —
  // the standard next-themes pattern for this exact problem.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const current = (theme as (typeof CYCLE)[number]) ?? "system";
  const Icon = ICONS[current];

  function cycle() {
    const next = CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length];
    setTheme(next);
  }

  if (!mounted) {
    return <div className="h-9 w-9" aria-hidden="true" />;
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={cycle}
      aria-label={`Theme: ${LABELS[current]}. Click to change.`}
      title={`Theme: ${LABELS[current]}`}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}
