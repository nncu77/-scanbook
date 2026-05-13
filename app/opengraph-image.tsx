import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ScanBook — Snap a receipt, get structured data in 3 seconds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 100%)",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 32, letterSpacing: -0.5 }}>
          ScanBook
        </div>
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1, marginBottom: 32 }}>
          Snap a receipt.
        </div>
        <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.1, color: "#a3a3a3" }}>
          Structured data in 3s.
        </div>
        <div style={{ fontSize: 24, color: "#737373", marginTop: 56 }}>
          AI-powered receipt OCR · Confidence-aware · Cost-routed
        </div>
      </div>
    ),
    { ...size }
  );
}
