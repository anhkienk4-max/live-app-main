/**
 * ADA OPS icon rendition inspired by the approved blue/violet brand board.
 * Replace this rendition with an approved ADA Global master vector for final brand sign-off.
 */
export function AdaOpsIcon({
  dimension,
  maskable = false,
}: {
  dimension: number;
  maskable?: boolean;
}) {
  const scale = maskable ? 0.76 : 1;
  const mark = Math.round(dimension * 0.26 * scale);
  const word = Math.round(dimension * 0.28 * scale);
  const ops = Math.round(dimension * 0.095 * scale);
  const small = Math.round(dimension * 0.042 * scale);
  const gap = Math.round(dimension * 0.014 * scale);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#FFFFFF',
      backgroundColor: '#07183B',
      backgroundImage: 'linear-gradient(142deg, #086BEE 0%, #1642B8 38%, #180B50 100%)',
    }}>
      <svg width={mark} height={mark} viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="ada-symbol" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#00C6F5" />
            <stop offset="54%" stopColor="#3674F8" />
            <stop offset="100%" stopColor="#9D66FF" />
          </linearGradient>
        </defs>
        <path d="M4 78 37 13c5-10 19-10 24 0l35 65c6 12-10 20-17 9L49 35 21 87C14 98-2 90 4 78Z" fill="url(#ada-symbol)" />
        <path d="M28 80h44" stroke="#B5EDFF" strokeWidth="10" strokeLinecap="round" opacity=".74" />
      </svg>
      <div style={{
        display:'flex', alignItems:'center', justifyContent:'center',
        fontFamily:'Arial, sans-serif', fontSize:word, lineHeight:1,
        fontWeight:900, letterSpacing:'-0.07em',
        marginTop:gap, paddingRight:Math.round(dimension*0.012),
      }}>ada</div>
      <div style={{
        display:'flex',fontFamily:'Arial, sans-serif',fontSize:ops,
        fontWeight:800,letterSpacing:'0.15em',
        marginTop:gap,
      }}>OPS</div>
      <div style={{
        display:'flex',fontFamily:'Arial, sans-serif',fontSize:small,
        fontWeight:700,letterSpacing:'0.12em',
        marginTop:Math.round(gap*.7),
      }}>LIVESTREAM</div>
    </div>
  );
}
