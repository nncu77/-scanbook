import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <section className="text-center mb-16">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
          Snap a receipt. Get structured data in 3 seconds.
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
          ScanBook turns paper receipts and invoices into accounting-ready records using
          Claude vision, with field-level confidence scores and human-in-the-loop review.
        </p>
        <div className="flex flex-wrap gap-3 justify-center">
          <Link href="/scan" className={buttonVariants({ size: "lg" })}>Scan a receipt</Link>
          <Link href="/dashboard?demo=true" className={buttonVariants({ variant: "outline", size: "lg" })}>Try the demo</Link>
        </div>
      </section>

      <section className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Structured output</CardTitle>
            <CardDescription>Claude returns a typed JSON payload via tool use — not a string we parse.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Merchant, 統一編號, invoice number, totals, line items — schema-validated.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Confidence-aware</CardTitle>
            <CardDescription>Every field carries a calibrated 0–1 score. Low-confidence values surface for human review.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Red &lt; 0.6, amber &lt; 0.8, green ≥ 0.8 — fix what matters, trust the rest.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Cost-routed</CardTitle>
            <CardDescription>Haiku triages clear receipts; only blurry or complex ones escalate to Sonnet.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Per-receipt token cost tracked in the DB. See aggregates at{" "}
            <Link href="/eval" className="underline">/eval</Link>.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Taiwan-aware</CardTitle>
            <CardDescription>統一發票 number, 統一編號 checksum, ROC date conversion baked in.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Exports to CSV / Excel for downstream accounting workflows.
          </CardContent>
        </Card>
      </section>

      <section className="mt-12 max-w-2xl mx-auto text-xs text-muted-foreground text-center border-t pt-6">
        <strong className="text-foreground">Privacy.</strong> Uploaded images are sent to Anthropic Claude for OCR
        and stored in your private Supabase Storage bucket — visible only to you (or to anyone you share an account
        with). They are not shared with third parties beyond the OCR pipeline, not used for training, and can be
        deleted at any time from the receipt detail page.
      </section>
    </div>
  );
}
