import { createClient } from "@/lib/supabase/server";
import { NotificationTray } from "./NotificationTray";
import type { Notification } from "@/lib/notifications/types";

export async function NotificationTrayServer({
  projectBasePath,
  align,
}: {
  projectBasePath: string;
  align?: "left" | "right";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <NotificationTray
      initialNotifications={(data ?? []) as Notification[]}
      projectBasePath={projectBasePath}
      align={align}
    />
  );
}
