import React from 'react'

export type StatusSegment = {
  // time in seconds from midnight (0..86400)
  timeStart: number
  timeEnd: number
  status: 'good' | 'warning' | 'bad' | 'on' | 'none'
  hasDot?: boolean
}

export default function TimelineStrip({
  segments,
  showGuides,
  hoursCount,
  columnWidths,
  pixelWidth,
  windowStart
}: {
  segments: StatusSegment[]
  showGuides?: boolean
  hoursCount?: number
  columnWidths?: number[]
  pixelWidth?: number
  windowStart?: number // seconds from midnight
  windowMinutes?: number
}){
  // console.log("TimelineStrip segments:", segments)
  const width = pixelWidth || 820
  const height = 32
  const show = !!showGuides
  const hrs = hoursCount && hoursCount > 0 ? hoursCount : 1
  // work in seconds
  const totalSeconds = hrs * 3600
  const viewStart = windowStart ?? 0 // in seconds
  const viewEnd = viewStart + totalSeconds
  const cols = columnWidths && columnWidths.length === hrs ? columnWidths : new Array(hrs).fill(1/hrs)

  // compute pixel widths for each column with rounding but ensure final boundary equals `width`
  const colPixels: number[] = cols.map((v, i) => i < cols.length - 1 ? Math.round(v * width) : 0)
  if (colPixels.length > 0) {
    const sumPrev = colPixels.slice(0, -1).reduce((s, n) => s + n, 0)
    colPixels[colPixels.length - 1] = Math.max(0, width - sumPrev)
  }

  // cumulative pixel offsets for columns (start at 0, end at width)
  const cumulativePx: number[] = [0]
  for (let i = 0; i < colPixels.length; i++) cumulativePx.push(cumulativePx[i] + colPixels[i])

  const getColor = (status: string) => {
    switch(status) {
      case 'good': return '#17db28'
      case 'warning': return '#e9e62e'
      case 'bad': return '#b81919'
      case 'on': return '#444'
      case 'none': return '#1a1919'
      default: return '#000000'
    }
  }

  const clamp = (v:number, min=0, maxV=totalSeconds) => Math.max(min, Math.min(maxV, v))

  return (
    <svg width={width} height={height} style={{background:'#0d0f10',borderRadius:0,overflow:'visible'}} shapeRendering="crispEdges">
      {/* Background */}
      <rect x={0} y={0} width={width} height={height} fill="#0f1112" rx={4} />

      {/* Colored status segments */}
      {segments.map((s,i)=>{

        // console.log("segmentsTTTTTTT", s)

        // skip if completely outside view
        if (s.timeEnd <= viewStart || s.timeStart >= viewEnd) return null

        // Clamp segment to visible window and convert to seconds relative to viewStart
        const visStartAbs = clamp(s.timeStart, viewStart, viewEnd)
        const visEndAbs = clamp(s.timeEnd, viewStart, viewEnd)
        const relStart = Math.max(0, visStartAbs - viewStart)
        const relEnd = Math.max(0, visEndAbs - viewStart)

        const secondToPx = (relSec:number) => {
          const clamped = Math.max(0, Math.min(totalSeconds, relSec))
          const hourIndex = Math.min(hrs - 1, Math.floor(clamped / 3600))
          const hourStartSec = hourIndex * 3600
          const localSec = clamped - hourStartSec
          const hourLeft = cumulativePx[hourIndex]
          const hourWidth = colPixels[hourIndex]
          return hourLeft + Math.round((localSec / 3600) * hourWidth)
        }

        const startPx = Math.max(0, secondToPx(relStart))
        const endPx = Math.max(0, secondToPx(relEnd))
        const w = Math.max(1, endPx - startPx)
        return (
          <rect key={`seg-${i}`} x={startPx} y={3} width={w} height={height-6} fill={getColor(s.status)} rx={0} />
        )
      })}

      {/* optional guide lines (disabled by default for Timeline view) */}
      {show && Array.from({length:13}).map((_, i)=>{
        const x = Math.floor((i / 12) * width)
        return (
          <line key={`dot-${i}`} x1={x} y1={-8} x2={x} y2={height+8} stroke="#555" strokeDasharray="2,3" strokeWidth={1} />
        )
      })}

      {show && Array.from({length:5}).map((_, i)=>{
        const x = Math.floor((i / 4) * width)
        return (
          <line key={`quarter-${i}`} x1={x} y1={-8} x2={x} y2={height+8} stroke="#ddd" strokeWidth={1} />
        )
      })}

      {/* dots for segments that request them (hasDot) - render max one dot per minute */}
      {show && (() => {
        const seen = new Set<number>()
        const dots: JSX.Element[] = []
        segments.forEach((s, idx) => {
          if (!s.hasDot) return
          const absMid = Math.floor((s.timeStart + s.timeEnd) / 2)
          if (absMid <= viewStart || absMid >= viewEnd) return
          const relMid = Math.max(0, Math.min(totalSeconds, absMid - viewStart))
          const minuteIndex = Math.floor(relMid / 60)
          if (seen.has(minuteIndex)) return
          seen.add(minuteIndex)

          const hourIndex = Math.min(hrs - 1, Math.floor(relMid / 3600))
          const hourStartSec = hourIndex * 3600
          const localSec = relMid - hourStartSec
          const hourLeft = cumulativePx[hourIndex]
          const hourWidth = colPixels[hourIndex]
          const cx = Math.floor(hourLeft + Math.round((localSec / 3600) * hourWidth))
          dots.push(<circle key={`dot-sec-${idx}`} cx={cx} cy={height - 6} r={3} fill="#000" stroke="#fff" strokeWidth={1.6} />)
        })
        return dots
      })()}
    </svg>
  )
}
