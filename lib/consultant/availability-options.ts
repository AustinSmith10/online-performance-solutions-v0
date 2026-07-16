import type { ConsultantAvailability } from "@/types";

export const AVAILABILITY_OPTIONS: {
  value: ConsultantAvailability;
  label: string;
  description: string;
  dotClassName: string;
}[] = [
  {
    value: "available",
    label: "Available",
    description: "You can receive new project assignments.",
    dotClassName: "bg-emerald-500",
  },
  {
    value: "on_leave",
    label: "On leave",
    description: "You are temporarily unavailable. Admins will see this before assigning.",
    dotClassName: "bg-zinc-400",
  },
  {
    value: "at_capacity",
    label: "At capacity",
    description: "Your current workload is full. Admins will see this before assigning.",
    dotClassName: "bg-amber-500",
  },
];
