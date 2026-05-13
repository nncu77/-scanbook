import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ReceiptEditor, type Receipt, type DuplicateRef } from "./receipt-editor";

const STORAGE_BUCKET = "receipts";

export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.from("receipts").select("*").eq("id", id).single();
  if (error || !data) notFound();

  const receipt = data as unknown as Receipt;
  let imageUrl: string | null = null;
  if (receipt.image_url) {
    const { data: signed } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(receipt.image_url, 3600);
    imageUrl = signed?.signedUrl ?? null;
  }

  const invoiceNum: string | null =
    receipt.corrected_data?.invoice_number?.value ??
    receipt.raw_extraction?.data?.invoice_number?.value ??
    null;

  let duplicates: DuplicateRef[] = [];
  if (invoiceNum) {
    const { data: dups } = await supabase
      .from("receipts")
      .select("id, created_at")
      .eq("user_id", receipt.user_id)
      .neq("id", receipt.id)
      .or(
        `raw_extraction->data->invoice_number->>value.eq.${invoiceNum},corrected_data->invoice_number->>value.eq.${invoiceNum}`
      )
      .limit(5);
    duplicates = (dups ?? []) as DuplicateRef[];
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-4">
        <Link href="/dashboard" className="text-sm text-muted-foreground hover:underline">
          ← Dashboard
        </Link>
      </div>
      <ReceiptEditor receipt={receipt} imageUrl={imageUrl} duplicates={duplicates} />
    </div>
  );
}
