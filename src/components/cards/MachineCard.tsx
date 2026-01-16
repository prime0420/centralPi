import React from 'react'

type Props = {id: string; percent: number; partCount: string; productionData?: number[]}

export default function MachineCard({id, percent, partCount, productionData}: Props){
  // color scheme per percent
  const isStopped = percent === 0
  const isGood = percent > 75 && !isStopped
  const isWarning = percent > 40 && percent <= 75 && !isStopped

  // card color palettes (primary top, secondary bottom)
  const palettes = {
    good: { primary: '#37c05f', secondary: '#25a94a', text: '#fff' },
    warning: { primary: '#FFD700', secondary: '#F2C200', text: '#111' },
    bad: { primary: '#e44b4b', secondary: '#c73a3a', text: '#fff' },
    stopped: { primary: '#2b2f33', secondary: '#191b1d', text: '#ddd' }
  }

  const palette = isStopped ? palettes.stopped : isGood ? palettes.good : isWarning ? palettes.warning : palettes.bad
  const bgPrimary = palette.primary
  const bgSecondary = palette.secondary
  const textColor = palette.text

  // allow overriding step font size for the small chart inside this card
  const rootStyle: React.CSSProperties = {
    background: `linear-gradient(180deg, ${bgPrimary} 0%, ${bgSecondary} 100%)`,
    borderRadius: 6,
    padding: 12,
    color: textColor,
    boxShadow: 'inset 0 -6px 12px rgba(0,0,0,0.08)',
    // make embedded chart step labels small by default
    ['--step-font-size' as any]: '10px'
  }

  const accentColor = isStopped ? '#444' : (isGood ? '#0b0b0b' : '#fff')

  return (
    <div className="card" style={rootStyle}>
      {/* Top area */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div style={{lineHeight:1}}>
          <div style={{fontWeight:700,fontSize:13}}>{id}</div>
          <div style={{fontSize:11,opacity:0.95,marginTop:6}}>Shift quantity • {partCount}</div>
        </div>

        <div style={{textAlign:'right'}}>
          <div style={{fontSize:36,fontWeight:700,color:accentColor}}>{percent.toFixed(1)}%</div>
          <div style={{fontSize:11,opacity:0.95,marginTop:6}}>111 / 187 Pcs</div>
        </div>
      </div>

      {/* divider line */}
      <div style={{height:4, background:accentColor, borderRadius:4, margin:'10px 0'}} />

      {/* Lower area — chart */}
      {productionData && productionData.length > 0 && (
        <div style={{background:'rgba(0,0,0,0.06)',padding:8,borderRadius:4}}>
          {(() => {
            const maxValue = Math.max(...productionData)

            // compute "nice" step size and ticks (target ~4 ticks)
            const targetTicks = 4
            const nice = (range:number, ticks:number) => {
              if (range === 0) return {step:1, ticks:[0]}
              const rawStep = range / ticks
              const exp = Math.floor(Math.log10(rawStep))
              const pow10 = Math.pow(10, exp)
              const f = rawStep / pow10
              let nf = 1
              if (f <= 1) nf = 1
              else if (f <= 2) nf = 2
              else if (f <= 5) nf = 5
              else nf = 10
              const step = nf * pow10
              const maxTick = Math.ceil(maxValue / step) * step
              const ticksArr = []
              for (let v = 0; v <= maxTick; v += step) ticksArr.push(v)
              return {step, ticksArr}
            }

            const {ticksArr = [0]} = nice(maxValue, targetTicks)
            const viewW = productionData.length * 10 + 40

            return (
              <svg width="100%" height={84} style={{display:'block'}} viewBox={`0 0 ${viewW} 84`} preserveAspectRatio="none">
                {/* left Y labels and matching thin grid lines */}
                {ticksArr.map((step, idx) => {
                  const y = 64 - (step / Math.max(maxValue || 1,1)) * 48
                  return (
                    <g key={`tick-${idx}`}>
                      <text x={6} y={y+4} fontSize={`var(--step-font-size)`} fill={textColor} opacity={0.9}>{step}</text>
                      <line x1={36} y1={y} x2={viewW - 6} y2={y} stroke={textColor} strokeWidth={0.8} opacity={0.12} />
                    </g>
                  )
                })}

                {/* data line */}
                {productionData.map((v,i)=>{
                  if(i===0) return null
                  const y1 = 64 - (productionData[i-1]/Math.max(maxValue,1))*48
                  const y2 = 64 - (v/Math.max(maxValue,1))*48
                  const x1 = (i-1)*10 + 40
                  const x2 = i*10 + 40
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={accentColor} strokeWidth={2} strokeLinecap="round" opacity={0.95} />
                })}
              </svg>
            )
          })()}
        </div>
      )}
    </div>
  )
}
