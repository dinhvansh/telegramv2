import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(145deg, rgb(8, 38, 115) 0%, rgb(0, 83, 219) 55%, rgb(0, 150, 136) 100%)",
          color: "white",
          fontFamily: "Segoe UI",
          position: "relative",
          overflow: "hidden",
          borderRadius: 16,
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 6,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.18)",
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            lineHeight: 1,
            transform: "translateY(1px)",
          }}
        >
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.08em" }}>
            S
          </div>
          <div
            style={{
              marginTop: 2,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.24em",
              opacity: 0.9,
            }}
          >
            TG
          </div>
        </div>
      </div>
    ),
    size,
  );
}
