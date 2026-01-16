import React, {useMemo, useState, useRef, useEffect} from 'react'
import TimelineStrip, { StatusSegment } from './graphs/TimelineStrip'

type MachineRow = {id: string; segments: StatusSegment[]; status: string}

function makeSampleTimelineRows(totalMinutes: number): MachineRow[] {
  const machineIds = ['2407400-1 → MS100', '2407661-1 → IM365', '2407771-1 → IM364', '2202991-1 → PP202', '2407237-1 → Torion Assembly', '2407399-1 → SM77']
  const statuses = ['Unscheduled', 'Break', 'Other']

  return machineIds.map(id => {
    const segs: StatusSegment[] = []
    let cursor = 0

    // Generate segments across the full span (totalMinutes)
    const segStatusOptions = ['good', 'warning', 'bad', 'none'] as const
    while (cursor < totalMinutes) {
      const len = Math.max(1, Math.floor(5 + Math.random() * 30))
      const status = segStatusOptions[Math.floor(Math.random() * segStatusOptions.length)]
      segs.push({timeStart: cursor, timeEnd: Math.min(cursor + len, totalMinutes), status})
      cursor += len
    }

    return {
      id,
      segments: segs,
      status: statuses[Math.floor(Math.random() * statuses.length)]
    }
  })
}


export default function TimelineView(){
  // full 24-hour day: 12AM (0:00) to 12AM next day (24:00)
  const allHourLabels = ['12:00AM','1:00AM','2:00AM','3:00AM','4:00AM','5:00AM','6:00AM','7:00AM','8:00AM','9:00AM','10:00AM','11:00AM','12:00PM','1:00PM','2:00PM','3:00PM','4:00PM','5:00PM','6:00PM','7:00PM','8:00PM','9:00PM','10:00PM','11:00PM','12:00AM']
  const fullDayHours = 24
  const fullDayMinutes = fullDayHours * 60

  // pan state: which hour to start displaying (e.g., 0 = 12AM, 5 = 5AM, etc.)
  // const [panHourOffset, setPanHourOffset] = useState(0)
  const viewHours = 6 // show 6 hours at a time
  // const headerLabels = allHourLabels.slice(panHourOffset, panHourOffset + viewHours + 1)
  const hours = viewHours
  const totalMinutes = fullDayMinutes

  const rows = useMemo(()=> makeSampleTimelineRows(totalMinutes), [totalMinutes])

  // simple grouping example - machines divided by kind
  const groups = [
    {title: 'GAP 1-1 Injection Molding', ids: [rows[1].id, rows[2].id]},
    {title: 'Machines not Connected', ids: [rows[3].id, rows[4].id]},
    {title: 'GAP 2A CNC', ids: [rows[0].id, rows[5].id]}
  ]

  const [columnWidthsByGroup, setColumnWidthsByGroup] = useState<Record<string, number[]>>(() => {
    const map: Record<string, number[]> = {}
    groups.forEach(g => { map[g.title] = new Array(hours).fill(1 / hours) })
    return map
  })

  // refs and measured pixel widths for each group's timeline area
  const [pixelWidthByGroup, setPixelWidthByGroup] = useState<Record<string, number>>({})

  const rowsById: Record<string, MachineRow> = {}
  rows.forEach(r => rowsById[r.id] = r)

  // For TimelineStrip segments, offset them relative to the pan position
  // const windowStartMinute = panHourOffset * 60
  // const windowEndMinute = windowStartMinute + viewHours * 60

  // Clamp pan offset: max is fullDayHours - viewHours
  const maxPanOffset = Math.max(0, fullDayHours - viewHours)

  // Individual pan state for each machine row's timeline (independent scrolling)
  const [rowPanOffsets, setRowPanOffsets] = useState<Record<string, number>>({})

  const getRowPanOffset = (machineId: string) => rowPanOffsets[machineId] ?? 0
  const setRowPanOffset = (machineId: string, offset: number) => {
    const clamped = Math.max(0, Math.min(offset, maxPanOffset))
    setRowPanOffsets(prev => ({...prev, [machineId]: clamped}))
  }

  const handleRowWheel = (machineId: string, e: React.WheelEvent) => {
    e.preventDefault()
    const currentOffset = getRowPanOffset(machineId)
    const panStep = 1 // pan by 1 hour per wheel click
    const direction = e.deltaY > 0 ? 1 : -1 // down = right, up = left
    setRowPanOffset(machineId, currentOffset + direction * panStep)
  }

  // drag state for column separators
  const dragState = useRef<{groupKey:string; index:number; startX:number; startWidths:number[]; timelineLeft?:number; timelineWidth?:number}|null>(null)

  // per-row drag-to-pan state
  const rowDragState = useRef<{machineId?:string, dragging:boolean, startX:number, startOffset:number, container?:HTMLElement}>({dragging:false,startX:0,startOffset:0})

  useEffect(()=>{
    const onMove = (e: MouseEvent) => {
      if (!dragState.current) return
      const deltaX = e.clientX - dragState.current.startX
      const timelineWidth = dragState.current.timelineWidth || 820
      let deltaFrac = deltaX / timelineWidth
      const i = dragState.current.index
      const groupKey = dragState.current.groupKey
      const start = dragState.current.startWidths.slice()
      const minFrac = 0.05

      // compute available space to the right (how much we can increase left side)
      const availableRight = start.slice(i+1).reduce((s,v)=>s + Math.max(0, v - minFrac), 0)
      // compute available space to the left (how much we can decrease leftwards to move left)
      const availableLeft = start.slice(0, i+1).reduce((s,v)=>s + Math.max(0, v - minFrac), 0)

      // clamp delta to available ranges
      if (deltaFrac > availableRight) deltaFrac = availableRight
      if (deltaFrac < -availableLeft) deltaFrac = -availableLeft

      const next = start.slice()

      if (deltaFrac >= 0) {
        // moving separator right: grow column i, shrink columns i+1..end as needed
        next[i] = next[i] + deltaFrac
        let remaining = deltaFrac
        for (let j = i+1; j < next.length && remaining > 1e-12; j++){
          const canTake = Math.max(0, next[j] - minFrac)
          const take = Math.min(canTake, remaining)
          next[j] -= take
          remaining -= take
        }
      } else {
        // moving separator left: shrink columns 0..i to give space to i+1
        const move = -deltaFrac
        next[i+1] = next[i+1] + move
        let remaining = move
        for (let j = i; j >= 0 && remaining > 1e-12; j--) {
          const canTake = Math.max(0, next[j] - minFrac)
          const take = Math.min(canTake, remaining)
          next[j] -= take
          remaining -= take
        }
      }

      // normalize total to 1 (should already sum to ~1 but normalize to avoid float drift)
      const sum = next.reduce((s,v)=>s+v,0)
      const normalized = next.map(v=> v / (sum || 1))
      setColumnWidthsByGroup(prev => ({ ...prev, [groupKey]: normalized }))
    }

    const onUp = () => { dragState.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  return (
    <div>
      <h2>Factory (Timeline) View</h2>
      <div className="card">
        {groups.map(g => (
          <div key={g.title} style={{marginBottom:18}}>
            {/* <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <div style={{fontWeight:700}}>{g.title}</div>
              <div style={{color:'#999',fontSize:12}}>{g.ids.length} stations</div>
            </div> */}

            {g.ids.map(id => {
              const r = rowsById[id]
              if (!r) return null
              const rowPanOffset = getRowPanOffset(id)
              const rowWindowStartMinute = rowPanOffset * 60
              
              // Individual time header for this row based on its pan offset
              // Use integer base hour for labels but keep fractional hour for smooth translation
              const baseHour = Math.floor(rowPanOffset)
              const fracHour = rowPanOffset - baseHour
              const rowHeaderLabels = allHourLabels.slice(baseHour, baseHour + viewHours + 1)

              return (
                <div key={r.id} style={{marginBottom:8}}>
                  {/* Individual time header for this machine's timeline */}
                  <div style={{display:'flex',alignItems:'center',marginBottom:4}}>
                    <div style={{width:296}} />
                    <div style={{flex:1, marginLeft:24, marginRight:24}}>
                      {(() => {
                        // compute pixel widths for header columns using same logic as TimelineStrip
                        const arr = columnWidthsByGroup[g.title] || new Array(hours).fill(1 / hours)
                        const pixelW = pixelWidthByGroup[g.title] || 820
                        const pxs: number[] = arr.map((v, i) => i < arr.length - 1 ? Math.round(v * pixelW) : 0)
                        if (pxs.length > 0) {
                          const sumPrev = pxs.slice(0, -1).reduce((s, n) => s + n, 0)
                          pxs[pxs.length - 1] = Math.max(0, pixelW - sumPrev)
                        }
                        return (
                          <div style={{width:pixelW, overflow:'hidden'}}>
                            <div style={{width:pixelW, display:'flex', transform:`translateX(${-(Math.round((pxs[0] || Math.round(pixelW / hours)) * fracHour))}px)`}}>
                              {pxs.map((pw, idx) => (
                                <div key={idx} style={{width: pw, textAlign: 'center', color:'#666', fontSize: 10}}>{rowHeaderLabels[idx]}</div>
                              ))}
                              <div style={{width:0, textAlign:'right', color:'#666', fontSize:10}}>{rowHeaderLabels[hours]}</div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                    <div style={{width:96}} />
                  </div>

                  <div style={{display:'flex',alignItems:'center',gap:12,background:'#0f1112',padding:'8px 10px',borderRadius:6}}>
                    <div style={{width:12,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <div style={{width:4,height:18,background:'transparent',borderLeft:'2px dotted #666'}} />
                    </div>

                    <div style={{width:260,display:'flex',alignItems:'center'}}>
                      <strong style={{fontSize:13,color:'#e6eef3'}}>{r.id}</strong>
                    </div>

                    <div style={{flex:1, position:'relative', display:'flex', alignItems:'center'}}>
                      {/* TimelineStrip with wheel scroll support and drag-to-pan */}
                      <div
                        style={{flex:1, marginLeft:24, marginRight:24, cursor:'grab', userSelect:'none'}}
                        onWheel={(e)=>handleRowWheel(id, e)}
                        onMouseDown={(e)=>{
                          const container = e.currentTarget as HTMLElement
                          rowDragState.current = {machineId: id, dragging: true, startX: e.clientX, startOffset: rowPanOffset, container}
                          document.body.style.cursor = 'grabbing'

                          const move = (ev: MouseEvent) => {
                            if(!rowDragState.current?.dragging) return
                            const clientX = ev.clientX
                            const deltaX = clientX - rowDragState.current.startX
                            const rect = container.getBoundingClientRect()
                            const chartW = rect.width
                            if(chartW <= 0) return
                            const deltaHours = -deltaX / chartW * viewHours
                            const proposed = rowDragState.current.startOffset + deltaHours
                            setRowPanOffset(id, proposed)
                          }

                          const up = () => {
                            rowDragState.current.dragging = false
                            document.body.style.cursor = ''
                            document.removeEventListener('mousemove', move)
                            document.removeEventListener('mouseup', up)
                          }

                          document.addEventListener('mousemove', move)
                          document.addEventListener('mouseup', up)
                        }}
                        // onTouchStart={(e)=>{
                        //   const t = e.touches[0]
                        //   const container = e.currentTarget as HTMLElement
                        //   rowDragState.current = {machineId: id, dragging: true, startX: t.clientX, startOffset: rowPanOffset, container}
                        //   document.body.style.cursor = 'grabbing'

                        //   const move = (ev: TouchEvent) => {
                        //     if(!rowDragState.current?.dragging) return
                        //     const touch = ev.touches ? ev.touches[0] : (ev as any)
                        //     const clientX = touch.clientX
                        //     const deltaX = clientX - rowDragState.current.startX
                        //     const rect = container.getBoundingClientRect()
                        //     const chartW = rect.width
                        //     if(chartW <= 0) return
                        //     const deltaHours = -deltaX / chartW * viewHours
                        //     const proposed = rowDragState.current.startOffset + deltaHours
                        //     setRowPanOffset(id, proposed)
                        //   }

                        //   const up = () => {
                        //     rowDragState.current.dragging = false
                        //     document.body.style.cursor = ''
                        //     document.removeEventListener('touchmove', move as any)
                        //     document.removeEventListener('touchend', up)
                        //   }

                        //   document.addEventListener('touchmove', move as any)
                        //   document.addEventListener('touchend', up)
                        // }}
                      >
                        <TimelineStrip segments={r.segments} showGuides={false} hoursCount={viewHours} columnWidths={columnWidthsByGroup[g.title]} pixelWidth={pixelWidthByGroup[g.title] || 820} windowStart={rowWindowStartMinute} windowMinutes={viewHours*60} />
                      </div>
                    </div>

                    <div style={{width:96,textAlign:'right',paddingLeft:12}}>
                      {(() => {
                        // compute percent of good+warning minutes across the full timeline for this view
                        const total = totalMinutes
                        let good = 0
                        let warning = 0
                        r.segments.forEach(s=>{
                          const len = Math.max(0, Math.min(total, Math.ceil(s.timeEnd)) - Math.max(0, Math.floor(s.timeStart)))
                          if (s.status === 'good') good += len
                          if (s.status === 'warning') warning += len
                        })
                        const pct = total ? ((good + warning) / total) * 100 : 0
                        const color = pct > 75 ? '#18b648' : pct > 40 ? '#f2c94c' : '#e03a3a'
                        return (
                          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
                            <div style={{color:'#fff',fontWeight:700}}>{pct.toFixed(1)}%</div>
                            <div style={{width:48,height:6,background:'#222',borderRadius:4,marginTop:6}}>
                              <div style={{width:`${Math.max(0,Math.min(100,pct))}%`,height:'100%',background:color,borderRadius:4}} />
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
