import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScanClient } from "./scan-client";

export default async function ScanPage() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) redirect("/login");
    } catch {
      // Supabase not configured; render the page anyway so user can see the UI.
    }
  }
  return <ScanClient />;
}
