import React from 'react'

export type StatusSegment = {
  timeStart: number // 0-60 minutes within the hour
  timeEnd: number
  status: 'good' | 'warning' | 'bad' | 'on' | 'none' // none = gray (not built)
}

export default function TimelineStrip({segments, showGuides, hoursCount, columnWidths, pixelWidth, windowStart}:{segments:StatusSegment[]; showGuides?:boolean; hoursCount?:number; columnWidths?:number[]; pixelWidth?:number; windowStart?:number; windowMinutes?:number}){
  const width = pixelWidth || 820
  const height = 32
  const show = !!showGuides
  const hrs = hoursCount && hoursCount > 0 ? hoursCount : 1
  const totalMinutes = hrs * 60
  const viewStart = windowStart ?? 0 // in minutes, which minute to start displaying from
  const viewEnd = viewStart + totalMinutes
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
      default: return '#000000'
    }
  }

  // console.log("segments:", segments)

  const shouldShowDot = (status: string) => status === 'good' || status === 'warning'

  return (
    <svg width={width} height={height} style={{background:'#0d0f10',borderRadius:0,overflow:'visible'}} shapeRendering="crispEdges">
      {/* Background */}
      <rect x={0} y={0} width={width} height={height} fill="#0f1112" rx={4} />

      {/* Colored status segments */}
      {segments.map((s,i)=>{
        // Check if segment overlaps with the visible window
        if (s.timeEnd <= viewStart || s.timeStart >= viewEnd) return null

        // Clamp segment to visible window
        const visStart = Math.max(s.timeStart, viewStart)
        const visEnd = Math.min(s.timeEnd, viewEnd)

        // Map to local coordinates (0..totalMinutes) for display
        const localStart = visStart - viewStart
        const localEnd = visEnd - viewStart
        const clamp = (v:number,min=0,max=totalMinutes)=>Math.max(min,Math.min(max,v))
        const segStart = clamp(localStart)
        const segEnd = clamp(localEnd)

        const minuteToPx = (m:number) => {
          const hourIndex = Math.min(hrs-1, Math.floor(m / 60))
          const hourStartMin = hourIndex * 60
          const localMin = m - hourStartMin
          const hourLeft = cumulativePx[hourIndex]
          const hourWidth = colPixels[hourIndex]
          return hourLeft + Math.round((localMin / 60) * hourWidth)
        }

        const startPx = Math.max(0, minuteToPx(segStart))
        const endPx = Math.max(0, minuteToPx(segEnd))
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

      {show && (() => {
        // build minute resolution status map from segments
        const minuteStatus: Array<'good'|'warning'|'bad'|'on'|'none'> = new Array(60).fill('none')
        segments.forEach(s => {
          const startM = Math.max(0, Math.floor(s.timeStart))
          const endM = Math.min(60, Math.ceil(s.timeEnd))
          for (let m = startM; m < endM; m++) minuteStatus[m] = s.status
        })
        return minuteStatus.map((st, m) => {
          if (!shouldShowDot(st)) return null
          const cx = Math.floor(((m + 0.5) / 60) * width)
          return <circle key={`dot-min-${m}`} cx={cx} cy={height - 6} r={3} fill="#000" stroke="#fff" strokeWidth={1.6} />
        })
      })()}
    </svg>
  )
}
