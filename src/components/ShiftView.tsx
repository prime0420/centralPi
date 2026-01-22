import React, {useMemo, useState, useEffect} from 'react'
import TimelineStrip, { StatusSegment } from './graphs/TimelineStrip'
import LineChart from './graphs/LineChart'
import DateSelector from './DateSelector'
import { useSelectedDate } from '../context/DateContext'
import { useSelectedMachine } from '../context/MachineContext'
import { fetchLogs, getEventStatus, groupLogsByHour, getHourMinuteSecond } from '../services/api'

// Format time as HH:MM
function formatTime(date: Date) {
  // let mon = date.getMonth() + 1
  // let d = date.getDate()
  let h = date.getHours()
  const m = date.getMinutes().toString().padStart(2, '0')
  const period = h >= 12 ? 'PM' : 'AM'

  h = h % 12 || 12

  return { time: `${h}:${m}`, period }
}

export default function ShiftView(){
  const { selectedDate } = useSelectedDate()
  const { selectedMachine } = useSelectedMachine()
  const dateStr = selectedDate.toISOString().split('T')[0]
  // zoomPercent: 0 -> show 180 minutes (3h), 100 -> show 30 minutes
  const [zoomPercent, setZoomPercent] = useState(0)
  // offset in minutes from the base window start (panning)
  const [windowOffset, setWindowOffset] = useState(0)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const timeRowsContainerRef = React.useRef<HTMLDivElement | null>(null)
  const hasAutoScrolledRef = React.useRef(false)
  const [predictedPerHour, setPredictedPerHour] = useState<number>(0);

  // Fetch logs when machine or date changes
  useEffect(() => {
    const loadLogs = async () => {
      setLoading(true)
      try {
        if (selectedMachine) {
          const allLogs = await fetchLogs(selectedMachine)
          const filteredLogs = allLogs.filter(log => log.created_at.startsWith(dateStr))
          setLogs(filteredLogs)
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error)
      } finally {
        setLoading(false)
      }
    }
    loadLogs()

    // Refresh logs every minute (60000 ms)
    const interval = setInterval(() => {
      loadLogs()
    }, 60000)

    return () => clearInterval(interval)
  }, [selectedMachine, dateStr])

  // console.log("current_logs", logs)

  // Convert logs to rows by hour
  const {rows, minuteCounts, firstProductionHour, totalProduced, totalPredicted} = useMemo(() => {
    const logsByHour = groupLogsByHour(logs)
    const labels = ['12AM','1AM','2AM','3AM','4AM','5AM','6AM','7AM','8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM']
    const rows: any[] = []
    const minuteArray: number[] = new Array(24 * 60).fill(0)
    let firstProdHour = -1

    // collect predicted rates from comments per hour and global
    const predictedFromComments: (number | undefined)[] = new Array(24).fill(undefined)
    let globalPredicted: number | undefined = undefined
    for (const l of logs) {
      if (l.comments && typeof l.comments === 'string') {
        const m = /Standard Parts Rate:\s*([\d,]+)\s*parts/i.exec(l.comments)
        if (m && m[1]) {
          const val = Number(m[1].replace(/,/g, ''))
          try {
            const hr = new Date(l.created_at.replace(' ', 'T')).getHours()
            predictedFromComments[hr] = val
          } catch (err) {
            // ignore
          }
          if (!globalPredicted) globalPredicted = val
        }
      }
      if (!globalPredicted && l.event && typeof l.event === 'string' && l.event.trim().toLowerCase() === 'start shift' && l.comments) {
        const m2 = /Standard Parts Rate:\s*([\d,]+)\s*parts/i.exec(l.comments)
        if (m2 && m2[1]) globalPredicted = Number(m2[1].replace(/,/g, ''))
      }
    }

    // temporary array for predicted per hour (may be undefined for hours with no interval logs)
    const predictedArr: (number | undefined)[] = new Array(24).fill(undefined)
    let producedTotal = 0

    for(let h = 0; h < labels.length; h++){
      const hourKey = h.toString().padStart(2, '0')
      const hourLogs = logsByHour[hourKey] || []
      // Track first hour with ANY logs (not just production)
      if (hourLogs.length > 0 && firstProdHour === -1) {
        firstProdHour = h
      }

      // Calculate produced parts (sum ALL production, not average)
      const intervalLogs = hourLogs.filter(l => (l.event || '').toLowerCase() === 'auto interval log')
      const produced = intervalLogs.length > 0 
        ? Math.round(intervalLogs.reduce((sum, l) => sum + (l.interval_count || 0), 0))
        : 0
      producedTotal += produced

      // Determine predicted for this hour only if there are interval logs
      if (intervalLogs.length > 0) {
        predictedArr[h] = predictedFromComments[h]
      } else predictedArr[h] = 0

      // Convert hourLogs to status segments (use absolute seconds)
      const segs: StatusSegment[] = []
      if (hourLogs.length > 0) {
        // sort hourLogs by created_at ascending
        const sorted = [...hourLogs].sort((a,b)=>new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        const hourEndSec = (h + 1) * 3600
        for (let i = 0; i < sorted.length; i++) {
          const cur = sorted[i]
          const next = sorted[i+1]
          const startSec = getHourMinuteSecond(cur.created_at)
          const endSec = next ? Math.min(hourEndSec, getHourMinuteSecond(next.created_at)) : Math.min(hourEndSec, startSec + Math.max(1, Math.round((cur.duration || 60))))
          let status = getEventStatus(cur.event)
          const predVal = predictedArr[h]
          if (predVal && cur.machine_rate) {
            const percent =  cur.machine_rate / predVal
            if (percent >= 0.7) status = 'good'
            else if (percent >= 0.4) status = 'warning'
            else status = 'bad'
          }
          segs.push({
            timeStart: startSec,
            timeEnd: endSec,
            status,
            hasDot: typeof cur.event === 'string' && cur.event.trim().toLowerCase() === 'auto interval log'
          })
        }
      }

      rows.push({
        label: labels[h],
        segments: segs,
        rightCount: `${produced}/${predictedArr[h] ?? 0}`,
        produced,
        predictedPerHour: predictedArr[h]
      })

      // Fill minute array
      const baseMinute = h * 60
      for (let m = 0; m < 60; m++) {
        minuteArray[baseMinute + m] = produced
      }
    }

    // carry-forward predicted rates: if hour has no predicted, use previous hour's value
    for (let h = 0; h < predictedArr.length; h++) {
      if (predictedArr[h] === undefined) {
        predictedArr[h] = h > 0 ? predictedArr[h-1] : undefined
      }
    }

    // apply carried predictions back to rows and compute total predicted
    let totalPred = 0
    for (let h = 0; h < rows.length; h++) {
      const p = predictedArr[h] ?? 0
      rows[h].predictedPerHour = p
      rows[h].rightCount = `${rows[h].produced}/${p}`
      totalPred += p
    }

    return { rows, minuteCounts: minuteArray, firstProductionHour: firstProdHour, totalProduced: producedTotal, totalPredicted: totalPred }
  }, [logs])

  // Auto-scroll to first production hour when data loads
  useEffect(() => {
    if (timeRowsContainerRef.current && firstProductionHour >= 0) {
      // Each hour row is approximately 40px tall (display flex with gap)
      const scrollPosition = firstProductionHour * 40
      timeRowsContainerRef.current.scrollTop = Math.max(0, scrollPosition - 60) // Scroll to show the hour near top with some context
    }
  }, [firstProductionHour])

  const { time, period } = formatTime(currentTime)

  // Calculate shift quantity (use totals computed from rows)
  const shiftQuantity = React.useMemo(() => {
    const produced = (typeof (totalProduced) === 'number') ? totalProduced : 0
    const predicted = (typeof (totalPredicted) === 'number') ? totalPredicted : 0
    const percent = predicted > 0 ? Math.round((produced / predicted) * 1000) / 10 : 0
    return { produced, predicted, percent }
  }, [/* totalProduced and totalPredicted come from the rows useMemo */ totalProduced, totalPredicted])

  // Update clock every second
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     setCurrentTime(new Date())
  //   }, 1000)
  //   return () => clearInterval(interval)
  // }, [])

  // window: shows a portion of the 24-hour day (12AM to 11PM)
  // at zoom 0, show 180 minutes (3 hours); at zoom 100, show 30 minutes (30 mins)
  const baseStartHourIndex = 0 // 12AM (start of day)
  const minWindow = 30
  const maxWindow = 180
  const getWindowMinutes = (percent:number)=> Math.max(minWindow, Math.round(maxWindow - (percent/100)*(maxWindow - minWindow)))
  const windowMinutes = getWindowMinutes(zoomPercent)

  // ensure offset stays within allowed range when data or window size changes
  useEffect(()=>{
    const maxOffset = Math.max(0, minuteCounts.length - (baseStartHourIndex*60 + windowMinutes))
    // clamp windowOffset to 0..maxOffset
    setWindowOffset(o => Math.min(Math.max(0, o), maxOffset))
  }, [minuteCounts.length, windowMinutes])

  // Auto-scroll line graph to first production hour (only once when data loads)
  useEffect(() => {
    if (firstProductionHour >= 0 && !hasAutoScrolledRef.current) {
      // Convert hour to minutes offset
      const productionStartMinutes = firstProductionHour * 60
      // Position so the production start is visible (roughly in the center of the window)
      const proposedOffset = Math.max(0, productionStartMinutes - Math.round(windowMinutes / 2))
      const maxOffset = Math.max(0, minuteCounts.length - (baseStartHourIndex*60 + windowMinutes))
      const clamped = Math.min(proposedOffset, maxOffset)
      setWindowOffset(clamped)
      hasAutoScrolledRef.current = true
    }
  }, [firstProductionHour]) // Only depend on firstProductionHour, not windowMinutes

  // Reset auto-scroll flag when logs change (new data load)
  useEffect(() => {
    hasAutoScrolledRef.current = false
  }, [logs])

  const windowStart = baseStartHourIndex*60 + windowOffset
  const windowCounts = minuteCounts.slice(windowStart, Math.min(minuteCounts.length, windowStart + windowMinutes))

  // pan step (in minutes) when clicking left/right
  // const panStep = Math.max(1, Math.round(windowMinutes / 3))

  const handleZoomChange = (newPercent:number) => {
    // keep roughly the same center when zooming
    const oldWindow = windowMinutes
    const oldCenter = windowOffset + Math.round(oldWindow/2)
    const newWindow = getWindowMinutes(newPercent)
    const proposedOffset = Math.max(0, oldCenter - Math.round(newWindow/2))
    const maxOffset = Math.max(0, minuteCounts.length - (baseStartHourIndex*60 + newWindow))
    setZoomPercent(newPercent)
    setWindowOffset(Math.min(proposedOffset, maxOffset))
  }

  const maxOffset = Math.max(0, minuteCounts.length - (baseStartHourIndex*60 + windowMinutes))
  // drag-to-pan state
  const chartContainerRef = React.useRef<HTMLDivElement | null>(null)
  const dragState = React.useRef<{dragging:boolean,startX:number,startOffset:number}>({dragging:false,startX:0,startOffset:0})

  useEffect(()=>{
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if(!dragState.current.dragging) return
      let clientX = 0
      if(e instanceof TouchEvent){
        clientX = e.touches[0]?.clientX ?? (e as any).clientX
      } else {
        clientX = (e as MouseEvent).clientX
      }
      const deltaX = clientX - dragState.current.startX
      const container = chartContainerRef.current
      if(!container) return
      const rect = container.getBoundingClientRect()
      const chartW = rect.width
      if(chartW <= 0) return
      const deltaMinutes = Math.round(-deltaX / chartW * windowMinutes)
      const proposed = dragState.current.startOffset + deltaMinutes
      const clamped = Math.min(Math.max(0, proposed), maxOffset)
      setWindowOffset(clamped)
    }

    const handleUp = ()=>{
      dragState.current.dragging = false
      // remove listeners
      document.removeEventListener('mousemove', handleMove as any)
      document.removeEventListener('touchmove', handleMove as any)
      document.removeEventListener('mouseup', handleUp)
      document.removeEventListener('touchend', handleUp)
    }

    // attach when dragging starts (we add listeners dynamically below)
    return ()=>{
      // cleanup in case
      document.removeEventListener('mousemove', handleMove as any)
      document.removeEventListener('touchmove', handleMove as any)
      document.removeEventListener('mouseup', handleUp)
      document.removeEventListener('touchend', handleUp)
    }
  }, [windowMinutes, maxOffset])
  return (
    <div>
      <DateSelector />
      <h2>The Machine (Shift) View - {selectedMachine ? selectedMachine : 'All Machines'} - {selectedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</h2>
      {loading && <p>Loading data from database...</p>}
      {logs.length === 0 && !loading && <p>No data available for this selection</p>}
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:16}}>
          {/* Right panel: Header with station info and time */}
          <div style={{flex:1, display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',width:'100%',marginBottom:16}}>
              <div style={{marginBottom:0}}>
                <div style={{fontSize:12, color:'#9ca3af', marginBottom:6}}>SHIFT QUANTITY</div>
                <div style={{display:'flex',alignItems:'baseline',gap:12}}>
                  <div style={{fontSize:32, fontWeight:'bold', color:'#ffffff'}}>{shiftQuantity.produced.toLocaleString()}</div>
                  <div style={{fontSize:11, color:'#ffffff', marginTop: 6}}>/ {shiftQuantity.predicted.toLocaleString()} pcs</div>
                  <div style={{marginLeft:12, color:'#18b648', fontWeight:700, fontSize:20}}>{shiftQuantity.percent}%</div>
                </div>
              </div>
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
                {/* Digital Clock */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    fontFamily: 'monospace',
                    color: '#fff',
                    padding: '8px 16px',
                  }}
                >
                  {/* Main Time */}
                  <div
                    style={{
                      fontSize: 48,
                      fontWeight: 'bold',
                      lineHeight: 1,
                    }}
                  >
                    {time}
                  </div>

                  {/* AM / PM */}
                  <div
                    style={{
                      fontSize: 16,
                      fontWeight: 'normal',
                      marginLeft: 6,
                      marginTop: 4,
                      color: '#9ca3af',
                    }}
                  >
                    {period}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{marginTop:12}}>
          {/* Line chart showing per-minute counts for the selected window */}
            {/* <div style={{display:'flex',alignItems:'stretch',gap:8,marginBottom:12}}>
              <div style={{flex:'0 0 auto', width:760, position:'relative'}}>
                <div
                  ref={chartContainerRef}
                  onMouseDown={(e)=>{
                    dragState.current.dragging = true
                    dragState.current.startX = e.clientX
                    dragState.current.startOffset = windowOffset
                    const move = (ev: any)=>{
                      const evt = ev as MouseEvent
                      let clientX = evt.clientX
                      const deltaX = clientX - dragState.current.startX
                      const container = chartContainerRef.current
                      if(!container) return
                      const rect = container.getBoundingClientRect()
                      const chartW = rect.width
                      if(chartW <= 0) return
                      const deltaMinutes = Math.round(-deltaX / chartW * windowMinutes)
                      const proposed = dragState.current.startOffset + deltaMinutes
                      const clamped = Math.min(Math.max(0, proposed), maxOffset)
                      setWindowOffset(clamped)
                    }
                    const up = ()=>{
                      dragState.current.dragging = false
                      document.removeEventListener('mousemove', move)
                      document.removeEventListener('touchmove', move)
                      document.removeEventListener('mouseup', up)
                      document.removeEventListener('touchend', up)
                    }
                    document.addEventListener('mousemove', move)
                    document.addEventListener('touchmove', move)
                    document.addEventListener('mouseup', up)
                    document.addEventListener('touchend', up)
                  }}
                  onTouchStart={(e)=>{
                    const t = e.touches[0]
                    dragState.current.dragging = true
                    dragState.current.startX = t.clientX
                    dragState.current.startOffset = windowOffset
                    const move = (ev: any)=>{
                      const touch = ev.touches ? ev.touches[0] : ev
                      const clientX = touch.clientX
                      const deltaX = clientX - dragState.current.startX
                      const container = chartContainerRef.current
                      if(!container) return
                      const rect = container.getBoundingClientRect()
                      const chartW = rect.width
                      if(chartW <= 0) return
                      const deltaMinutes = Math.round(-deltaX / chartW * windowMinutes)
                      const proposed = dragState.current.startOffset + deltaMinutes
                      const clamped = Math.min(Math.max(0, proposed), maxOffset)
                      setWindowOffset(clamped)
                    }
                    const up = ()=>{
                      dragState.current.dragging = false
                      document.removeEventListener('mousemove', move)
                      document.removeEventListener('touchmove', move)
                      document.removeEventListener('mouseup', up)
                      document.removeEventListener('touchend', up)
                    }
                    document.addEventListener('mousemove', move)
                    document.addEventListener('touchmove', move)
                    document.addEventListener('mouseup', up)
                    document.addEventListener('touchend', up)
                  }}
                  style={{width:760, cursor:'grab'}}
                >
                  <LineChart
                    counts={windowCounts}
                    startMinute={windowStart}
                    width={760}
                    height={160}
                  />

                </div>
              </div>
              <div style={{width:56,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6}}>
                <button onClick={()=>handleZoomChange(Math.min(100, zoomPercent+10))} style={{fontSize:24, color:'white', cursor:'pointer', backgroundColor:'transparent', border:'none'}}>+</button>
                <div style={{height:60,display:'flex',alignItems:'center',justifyContent:'center'}}>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={zoomPercent}
                    onChange={(e)=>handleZoomChange(Number(e.target.value))}
                    style={{transform:'rotate(-90deg)', width:60, height:2, background:'transparent', cursor:'pointer'}}
                  />
                </div>
                <button onClick={()=>handleZoomChange(Math.max(0, zoomPercent-10))} style={{fontSize:24, color:'white', cursor:'pointer', backgroundColor:'transparent', border:'none'}}>-</button>
              </div>
            </div> */}

          {/* Scrollable time rows container */}
          <div
            ref={timeRowsContainerRef}
            style={{
              maxHeight: '400px',
              overflowY: 'auto',
              overflowX: 'hidden',
              border: '1px solid #333',
              borderRadius: '4px',
              padding: '8px 0'
            }}
          >
            {rows.map((r,idx)=> (
              <div key={idx} className="hour-row" style={{display:'flex',alignItems:'center',gap:8,marginBottom:8,paddingLeft:8,paddingRight:8}}>
                <div style={{width:64,textAlign:'right',paddingRight:8,color:'#cbd5da',fontFamily:'monospace'}}><strong>{r.label}</strong></div>
                <div style={{flex:1}}>
                  <TimelineStrip segments={r.segments} showGuides={true} hoursCount={1} windowStart={idx * 3600} />
                </div>
                <div style={{width:96,textAlign:'right',paddingLeft:12,color:'#9fe49b'}}><strong>{r.rightCount}</strong></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
