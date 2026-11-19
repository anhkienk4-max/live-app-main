import { ImageResponse } from 'next/og'

/**
 * 1170x2532 reference-board launch artwork for compatible iOS standalone devices.
 * The OS controls whether startup artwork is shown; Android uses manifest icon/theme.
 */
export function GET() {
  return new ImageResponse(
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
      color: '#ffffff', backgroundColor: '#07183B',
      backgroundImage: 'linear-gradient(150deg, #065EF0 0%, #081E59 44%, #060C32 83%)',
    }}>
      <div style={{
        display: 'flex', width: 900, height: 500, position: 'absolute',
        top: -320, right: -380, borderRadius: '50%',
        backgroundImage: 'linear-gradient(135deg, #703FEE, #2563EB)', opacity: 0.82,
      }} />
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', marginBottom: 310, zIndex: 2,
      }}>
        <div style={{
          display: 'flex', fontFamily: 'Arial, sans-serif', fontSize: 300,
          fontWeight: 900, letterSpacing: '-0.085em', lineHeight: 1,
        }}>ada</div>
        <div style={{
          display: 'flex', fontFamily: 'Arial, sans-serif', fontSize: 91,
          fontWeight: 850, letterSpacing: '0.16em', marginTop: 22,
        }}>OPS</div>
        <div style={{
          display: 'flex', fontFamily: 'Arial, sans-serif', fontSize: 40,
          fontWeight: 700, letterSpacing: '0.23em', marginTop: 28,
        }}>LIVESTREAM</div>
      </div>
      <div style={{
        display: 'flex', width: 1700, height: 580, position: 'absolute',
        bottom: -230, left: -220, borderRadius: '50%',
        transform: 'rotate(-10deg)',
        backgroundImage: 'linear-gradient(100deg, #168AFB 0%, #395EEE 60%, #8E7CE9 100%)',
      }} />
      <div style={{
        display: 'flex', width: 1500, height: 415, position: 'absolute',
        bottom: -225, left: -120, borderRadius: '50%',
        transform: 'rotate(9deg)',
        backgroundImage: 'linear-gradient(110deg, #081A63 0%, #041138 80%)',
      }} />
      <div style={{
        display: 'flex', position: 'absolute', bottom: 155,
        flexDirection: 'column', alignItems: 'center', zIndex: 3,
        fontFamily: 'Arial, sans-serif', fontSize: 25,
        fontWeight: 700, letterSpacing: '0.16em', color: '#E4ECFF',
      }}>
        <span>ADA GLOBAL</span>
        <span style={{ marginTop: 8 }}>LIVESTREAM OPERATIONS</span>
      </div>
    </div>,
    { width: 1170, height: 2532 },
  )
}
