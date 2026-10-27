/**
 * ADA OPS mobile icon artwork.
 * Code-rendered PNGs avoid an external icon/CDN dependency.
 * Replace the wordmark with the approved ADA Global logo artwork
 * when the licensed source asset is available.
 */
export function AdaOpsIcon({
  dimension,
  maskable = false,
}: {
  dimension: number;
  maskable?: boolean;
}) {
  const contentScale = maskable ? 0.75 : 1;
  const logoSize = Math.round(dimension * 0.34 * contentScale);
  const opsSize = Math.round(dimension * 0.118 * contentScale);
  const captionSize = Math.round(dimension * 0.042 * contentScale);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        width: "100%",
        color: "#FFFFFF",
        backgroundColor: "#07183B",
        backgroundImage: "linear-gradient(145deg, #0B2864 0%, #07183B 65%, #050D2B 100%)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: "Arial, sans-serif",
            fontSize: logoSize,
            fontWeight: 900,
            letterSpacing: "-0.08em",
            lineHeight: 1,
            paddingRight: Math.round(dimension * 0.03),
          }}
        >
          ada
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Arial, sans-serif",
            fontSize: opsSize,
            fontWeight: 700,
            letterSpacing: "0.13em",
            marginTop: Math.round(dimension * 0.008),
          }}
        >
          OPS
        </div>
        {dimension >= 512 ? (
          <div
            style={{
              display: "flex",
              fontFamily: "Arial, sans-serif",
              fontSize: captionSize,
              fontWeight: 600,
              letterSpacing: "0.09em",
              marginTop: Math.round(dimension * 0.022),
            }}
          >
            LIVESTREAM
          </div>
        ) : null}
      </div>
    </div>
  );
}
