import React from 'react'

export default function HealthBar({percent}:{percent:number}){
  const color = percent > 75 ? '#18b648' : percent > 40 ? '#f2c94c' : '#e03a3a'
  return (
    <div style={{display:'flex',alignItems:'center',gap:8}}>
      <div style={{width:120,height:16,background:'#222',borderRadius:8,overflow:'hidden'}}>
        <div style={{width:`${Math.max(0,Math.min(100,percent))}%`,height:'100%',background:color}} />
      </div>
      <div style={{minWidth:36,textAlign:'right'}}>{percent.toFixed(0)}%</div>
    </div>
  )
}
