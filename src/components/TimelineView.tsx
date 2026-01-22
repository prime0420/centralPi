import React, {useMemo, useState, useRef, useEffect} from 'react'
import TimelineStrip, { StatusSegment } from './graphs/TimelineStrip'
import DateSelector from './DateSelector'
import { useSelectedDate } from '../context/DateContext'
import { useSelectedMachine } from '../context/MachineContext'
import { fetchMachines, fetchLogs, getLogsForDate, getEventStatus, getHourMinuteSecond } from '../services/api'

type MachineRow = {id: string; segments: StatusSegment[]; status: string}

export default function TimelineView({ onMachineSelect }: { onMachineSelect?: () => void }){
  const { selectedDate } = useSelectedDate()
  const { setSelectedMachine } = useSelectedMachine()
  const dateStr = selectedDate.toISOString().split('T')[0]
  const [machinesData, setMachinesData] = useState<any[]>([])
  const [logsData, setLogsData] = useState<any[]>([])
  const [partsRate, setPartsRate] = useState<any>()
  const [loading, setLoading] = useState(true)

  // Fetch machines and logs from database
  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [machines, logs] = await Promise.all([
          fetchMachines(),
          fetchLogs()
        ])
        setMachinesData(machines)
        setLogsData(logs)
      } catch (error) {
        console.error('Failed to fetch data:', error)
      } finally {
        setLoading(false)
      }
    }
    loadData()

    // Refresh data every minute (60000 ms)
    const interval = setInterval(() => {
      loadData()
    }, 60000)

    return () => clearInterval(interval)
  }, [])

  // console.log("TimelineView logsData:", logsData)

  // Convert database logs to timeline rows
  const rows = useMemo(() => {
    const dateLogs = logsData.filter(log => log.created_at.startsWith(dateStr))
    // console.log("TimelineView dateLogs for", dateStr, ":", dateLogs)
    const logsByMachine: Record<string, any[]> = {}
    dateLogs.forEach(log => {
      const machineId = log.machine_name
      if (!logsByMachine[machineId]) logsByMachine[machineId] = []
      logsByMachine[machineId].push(log)
    })

    for (let i = 0; i < logsData.length; i++) {
      const log = logsData[i];
      // Extract Standard Parts Rate number if present on this log
      let parsedRate: number | undefined = undefined;
      if (typeof log.comments === 'string' && log.event.trim().toLowerCase() === 'start shift') {
        const rateMatch = /Standard Parts Rate:\s*([\d,]+)\s*parts/i.exec(log.comments);
        if (rateMatch && rateMatch[1]) {
          parsedRate = Number(rateMatch[1].replace(/,/g, ''));
        }
      }
      if (parsedRate !== undefined) {
        setPartsRate(parsedRate);
      }
    }
    // console.log("Parsed Parts Rate:", partsRate);
    // console.log("machineData:", machinesData)

    // Build rows for ALL machines from API, with or without logs
    return machinesData.map(apiMachine => {
      const machineId = apiMachine.name || apiMachine.machine_name || ''
      const machineLogs = logsByMachine[machineId] || []
      const segs: StatusSegment[] = []
      
      // Create segments based on logs
      // const fullDaySeconds = 24 * 3600 // 86400 seconds in full day
      
      if (machineLogs.length > 0) {
        // console.log("Machine:", machineId, "logs:", machineLogs.length, machineLogs)
        const segmentCount = machineLogs.length
        // const minutesPerSegment = Math.floor(fullDayMinutes / segmentCount)
        // console.log("segmentCount", segmentCount)

        for (let i = 0; i < segmentCount; i++) {
          let status = getEventStatus(machineLogs[i].event)
          if (machineLogs[i].event == "Auto Interval Log") {
            const percent = machineLogs[i].machine_rate / partsRate
            if (percent >= 0.7) status = 'good'
            else if (percent >= 0.4) status = 'warning'
            else status = 'bad' 
          }
          const logStart = machineLogs[i] ? getHourMinuteSecond(machineLogs[i].created_at) : 0
          const logEnd = machineLogs[i + 1] ? getHourMinuteSecond(machineLogs[i + 1].created_at) : (logStart + 1)

          segs.push({
            timeStart: logStart,
            timeEnd: logEnd,
            status,
            hasDot: typeof machineLogs[i].event === 'string' && machineLogs[i].event.trim().toLowerCase() === 'auto interval log'
          })

          // console.log("segs", segs)
        }
      }
      
      // console.log("Machine:", machineId, "segs:", segs)
      // console.log("Machine_rows:", rows)

      // Calculate health
      const goodCount = machineLogs.filter(l => getEventStatus(l.event) === 'good').length
      const health = machineLogs.length > 0 ? Math.round((goodCount / machineLogs.length) * 100) : 0
      
      return {
        id: machineId,
        segments: segs,
        status: health > 70 ? 'Good' : health > 40 ? 'Warning' : 'bad'
      }
    })
  }, [logsData, dateStr, machinesData])

  // console.log("TimelineView rows:", rows)

  // full 24-hour day: 12AM (0:00) to 12AM next day (24:00)
  const allHourLabels = ['12:00AM','1:00AM','2:00AM','3:00AM','4:00AM','5:00AM','6:00AM','7:00AM','8:00AM','9:00AM','10:00AM','11:00AM','12:00PM','1:00PM','2:00PM','3:00PM','4:00PM','5:00PM','6:00PM','7:00PM','8:00PM','9:00PM','10:00PM','11:00PM','12:00AM']
  const fullDayHours = 24
  // const fullDayMinutes = fullDayHours * 60

  const viewHours = 6 // show 6 hours at a time
  // const headerLabels = allHourLabels.slice(panHourOffset, panHourOffset + viewHours + 1)
  const hours = viewHours
  // const totalMinutes = fullDayMinutes

  // refs and measured pixel widths for each machine's timeline area
  const [pixelWidthByMachine, setPixelWidthByMachine] = useState<Record<string, number>>({})

  const rowsById: Record<string, MachineRow> = {}
  rows.forEach(r => rowsById[r.id] = r)

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

  // per-row drag-to-pan state
  const rowDragState = useRef<{machineId?:string, dragging:boolean, startX:number, startOffset:number, container?:HTMLElement}>({dragging:false,startX:0,startOffset:0})

  return (
    <div>
      <DateSelector />
      <h2>Factory (Timeline) View - {selectedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</h2>
      {loading && <p>Loading data from database...</p>}
      <div className="card">
        {rows.map((r) => {
          const rowPanOffset = getRowPanOffset(r.id)
          const rowWindowStartSeconds = Math.round(rowPanOffset * 3600)
          // console.log("rowPanOffset for", r.id, ":", rowPanOffset, "hours, windowStartSeconds:", rowWindowStartSeconds)
          const baseHour = Math.floor(rowPanOffset)
          const fracHour = rowPanOffset - baseHour
          const rowHeaderLabels = allHourLabels.slice(baseHour, baseHour + viewHours + 1)

          return (
            <div key={r.id} style={{marginBottom:8, background:'#0c0d0e',padding:8,borderRadius:6}}>
              <div style={{display:'flex',alignItems:'center',marginBottom:4}}>
                <div style={{width:296}} />
                <div style={{flex:1, marginLeft:28, marginRight:0}}>
                  {(() => {
                    const pixelW = pixelWidthByMachine[r.id] || 820
                    const pxs: number[] = new Array(hours).fill(pixelW / hours)
                    return (
                      <div style={{width:pixelW, overflow:'hidden'}}>
                        <div style={{width:pixelW, display:'flex', transform:`translateX(${-(Math.round((pxs[0] || Math.round(pixelW / hours)) * fracHour))}px)`}}>
                          {pxs.map((pw, idx) => (
                            <div key={idx} style={{width: pw, textAlign: 'left', color:'#666', fontSize: 10}}>{rowHeaderLabels[idx]}</div>
                          ))}
                          <div style={{width:0, textAlign:'right', color:'#666', fontSize:10}}>{rowHeaderLabels[hours]}</div>
                        </div>
                      </div>
                    )
                  })()}
                </div>
                <div style={{width:96}} />
              </div>

              <div style={{display:'flex',alignItems:'center',gap:12,background:'#000000',padding:'8px 10px',borderRadius:6,cursor:'pointer'}}>
                <div style={{width:12,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <div style={{width:4,height:18,background:'transparent',borderLeft:'2px dotted #666'}} />
                </div>

                <div style={{width:260,display:'flex',alignItems:'center'}}  onClick={() => { setSelectedMachine(r.id); onMachineSelect?.() }}>
                  <strong style={{fontSize:13,color:'#e6eef3'}}>{r.id}</strong>
                </div>

                <div style={{flex:1, position:'relative', display:'flex', alignItems:'center'}}>
                    <div
                      style={{flex:1, marginLeft:24, marginRight:24, cursor:'grab', userSelect:'none'}}
                      onClick={(e) => e.stopPropagation()}
                      onWheel={(e)=>handleRowWheel(r.id, e)}
                      onMouseDown={(e)=>{
                        e.stopPropagation()
                        const container = e.currentTarget as HTMLElement
                        rowDragState.current = {machineId: r.id, dragging: true, startX: e.clientX, startOffset: rowPanOffset, container}
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
                          setRowPanOffset(r.id, proposed)
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
                    >
                      <TimelineStrip segments={r.segments} showGuides={false} hoursCount={viewHours} pixelWidth={820} windowStart={rowWindowStartSeconds} />
                    </div>
                </div>

                
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
