import React from 'react'
import CircularHealth from './CircularHealth'

type Machine = {id:string; percent:number; partCount:string}

export default function FactoryStatusCard({machines}:{machines:Machine[]}){
  const total = machines.length
  const avg = total ? machines.reduce((s,m)=>s+m.percent,0)/total : 0

  // classify machines by percent into statuses
  const goodCount = machines.filter(m=>m.percent > 75).length
  const warningCount = machines.filter(m=>m.percent > 40 && m.percent <= 75).length
  const badCount = machines.filter(m=>m.percent > 0 && m.percent <= 40).length
  const noneCount = machines.filter(m=>m.percent === 0).length

  const operating = goodCount + warningCount
  const stopped = badCount + noneCount

  return (
    <div className="card" style={{display:'flex',gap:12,alignItems:'center', background:'#191b1d'}}>
      <div style={{display:'flex',flexDirection:'column',gap:12,}}>
        <div style={{background:'#222',padding:'6px 10px',borderRadius:6,width:110,textAlign:'center'}}>
          <div style={{fontSize:12,color:'#bbb'}}>Stations</div>
          <div style={{fontSize:20,fontWeight:700}}>{total}</div>
        </div>

        {/* <div style={{display:'flex',gap:8,alignItems:'center'}}> */}
          <div style={{background:'#222',padding:'6px 10px',borderRadius:6,minWidth:80,textAlign:'center'}}>
            <div style={{fontSize:12,color:'#bbb'}}>Operating</div>
            <div style={{display:'flex',justifyContent:'center',gap:6,alignItems:'center',fontWeight:700}}>
              <div style={{color:'#18b648'}}>{goodCount}</div>
              <div style={{color:'#9aa6b2'}}>+</div>
              <div style={{color:'#f2c94c'}}>{warningCount}</div>
            </div>
          </div>

          <div style={{background:'#222',padding:'6px 10px',borderRadius:6,minWidth:80,textAlign:'center'}}>
            <div style={{fontSize:12,color:'#bbb'}}>Stopped</div>
            <div style={{display:'flex',justifyContent:'center',gap:6,alignItems:'center',fontWeight:700}}>
              <div style={{color:'#e03a3a'}}>{badCount}</div>
              <div style={{color:'#9aa6b2'}}>+</div>
              <div style={{color:'#666'}}>{noneCount}</div>
            </div>
          </div>
        {/* </div> */}
      </div>

      {/* <div style={{flex:1,display:'flex',justifyContent:'center'}}>
        <CircularHealth percent={avg} />
      </div> */}
    </div>
  )
}
