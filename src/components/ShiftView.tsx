import React, {useMemo, useState, useEffect} from 'react'
import TimelineStrip, { StatusSegment } from './graphs/TimelineStrip'
import LineChart from './graphs/LineChart'

type HourRow = {label:string; segments:StatusSegment[]; rightCount:string}

// generate global per-minute sample data from 5AM..1PM (9 hours)
function generateGlobalMinutes(){
  const totalHours = 9 // 5AM..1PM
  const totalMinutes = totalHours * 60
  const minuteStatus: Array<'good'|'warning'|'bad'|'none'> = new Array(totalMinutes).fill('good')
  const minuteCounts: number[] = new Array(totalMinutes).fill(0)

  // random block generator to create segments across the whole span
  let cursor = 0
  const statusChoices: Array<'good'|'warning'|'bad'|'none'> = ['good','warning','bad','none']
  while(cursor < totalMinutes){
    const len = Math.max(1, Math.floor(3 + Math.random()*20))
    const status = statusChoices[Math.floor(Math.random()*statusChoices.length)]
    for(let m=cursor;m<Math.min(totalMinutes,cursor+len);m++){
      minuteStatus[m] = status
      // simple count model: good => higher, warning => medium, bad/none => low/0
      minuteCounts[m] = status === 'good' ? Math.floor(20 + Math.random()*50) : status === 'warning' ? Math.floor(5 + Math.random()*20) : 0
    }
    cursor += len
  }

  return {minuteStatus, minuteCounts}
}

function makeSampleRows(){
  const labels = ['5AM','6AM','7AM','8AM','9AM','10AM','11AM','12PM','1PM']
  const {minuteStatus, minuteCounts} = generateGlobalMinutes()
  const rows:HourRow[] = []

  for(let h=0; h<labels.length; h++){
    const start = h*60
    const end = start+60
    // coalesce into segments for this hour
    const segs:StatusSegment[] = []
    let m = start
    while(m < end){
      const st = minuteStatus[m]
      let run = m+1
      while(run < end && minuteStatus[run] === st) run++
      segs.push({timeStart: m - start, timeEnd: run - start, status: st})
      m = run
    }

    // counts
    const goodMinutes = minuteStatus.slice(start,end).filter(x=>x==='good').length
    const warningMinutes = minuteStatus.slice(start,end).filter(x=>x==='warning').length
    let predicted = 1029
    if (labels[h] === '5AM') predicted = 483
    if (labels[h] === '1PM') predicted = 485
    const produced = Math.round(((goodMinutes + warningMinutes)/60)*predicted)
    const rightCount = `${produced}/${predicted}`

    rows.push({label:labels[h], segments:segs, rightCount})
  }

  return {rows, minuteCounts}
}

export default function ShiftView(){
  // zoomPercent: 0 -> show 180 minutes (3h), 100 -> show 30 minutes
  const [zoomPercent, setZoomPercent] = useState(0)
  // offset in minutes from the base window start (panning)
  const [windowOffset, setWindowOffset] = useState(0)
  const {rows, minuteCounts} = useMemo(()=> makeSampleRows(), [])

  // window: when zoomPercent=0 show 3 hours from 8:00 to 11:00 (8AM is index 3 from 5AM)
  const baseStartHourIndex = 0 // 5AM + 3 = 8AM
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

  const windowStart = baseStartHourIndex*60 + windowOffset
  const windowCounts = minuteCounts.slice(windowStart, Math.min(minuteCounts.length, windowStart + windowMinutes))

  // pan step (in minutes) when clicking left/right
  const panStep = Math.max(1, Math.round(windowMinutes / 3))

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
      <h2>The Machine (Shift) View</h2>
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:12}} className="muted">Station</div>
            <strong>2407400-1 - MS100</strong>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {/* <div style={{fontSize:12}} className="muted">Pcs/min</div> */}
            {/* <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <button onClick={()=>setZoom(z=>Math.max(0,z-1))} style={{width:28}}>−</button>
              <div style={{width:36,textAlign:'center'}}>{zoom}</div>
              <button onClick={()=>setZoom(z=>Math.min(zoomMap.length-1,z+1))} style={{width:28}}>+</button>
            </div> */}
          </div>
        </div>

        <div style={{marginTop:12}}>
          {/* Line chart showing per-minute counts for the selected window */}
            <div style={{display:'flex',alignItems:'stretch',gap:8,marginBottom:12}}>
              <div style={{flex:'0 0 auto', width:760, position:'relative'}}>


                <div
                  ref={chartContainerRef}
                  onMouseDown={(e)=>{
                    dragState.current.dragging = true
                    dragState.current.startX = e.clientX
                    dragState.current.startOffset = windowOffset
                    // attach document listeners for smooth dragging
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
                    // attach same listeners as mouse
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
                  {/* <LineChart counts={windowCounts} startMinute={windowStart} width={760} height={130} /> */}
                  <LineChart
                    counts={windowCounts}
                    startMinute={windowStart}
                    width={760}
                    height={160}
                  />

                </div>
              </div>
              <div style={{width:56,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:6}}>
                {/* zoom in */}
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
            </div>

          {rows.map((r,idx)=> (
            <div key={idx} className="hour-row" style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
              <div style={{width:56,textAlign:'right',paddingRight:8,color:'#cbd5da'}}><strong>{r.label}</strong></div>
              <div style={{flex:1}}>
                <TimelineStrip segments={r.segments} showGuides={true} />
              </div>
              <div style={{width:96,textAlign:'right',paddingLeft:12,color:'#9fe49b'}}><strong>{r.rightCount}</strong></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
