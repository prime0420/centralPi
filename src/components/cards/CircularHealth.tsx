import React from 'react'

export default function CircularHealth({percent}:{percent:number}){
  const size = 160
  const stroke = 8
  const radius = (size - stroke) / 2
  // const circumference = 2 * Math.PI * radius
  // const pct = Math.max(0, Math.min(100, percent))
  // const offset = circumference - (pct / 100) * circumference
  const status = percent > 75 ? 'good' : percent > 40 ? 'warning' : 'bad'
  // const ringColor = status === 'good' ? '#18b648' : status === 'warning' ? '#f2c94c' : '#e03a3a'

  // image sources (user-provided images placed in /images)
  const imgMap: Record<string,string> = {
    good: './good.webp',
    warning: './warning.webp',
    bad: './bad.webp',
  }
  const imgSrc = imgMap[status]

  const faceR = radius - stroke * 0.8
  const cx = size/2
  const cy = size/2

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:2}}>
      <svg width={size} height={size} style={{transform:'rotate(-90deg)', marginTop:16}}>

        {/* face and body group: render user-provided avatar image centered */}
        <g transform={`rotate(90 ${cx} ${cy})`}>
          {imgSrc && (
            (() => {
              const imgSize = faceR * 4.2
              const ix = cx - imgSize/2
              const iy = cy - imgSize/2 - 6
              return <image href={imgSrc} x={ix} y={iy} width={imgSize} height={imgSize} preserveAspectRatio="xMidYMid meet" />
            })()
          )}
        </g>
      </svg>

    </div>
  )
}
