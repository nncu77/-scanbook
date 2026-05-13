import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScanClient } from "./scan-client";

export default async function ScanPage() {
  let needsAuth = false;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) needsAuth = true;
    } catch {
      // Supabase not configured; let the page render so the UI is visible.
    }
  }
  if (needsAuth) redirect("/login");
  return <ScanClient />;
}
