import React from 'react'
import FactoryStatusCard from './cards/FactoryStatusCard'
import MachineCard from './cards/MachineCard'

type Machine = {id: string; percent: number; partCount: string; productionData?: number[]}

const machines: Machine[] = [
  {id:'2202605-2 → SM73', percent:59.3, partCount:'117 / 187 Pcs', productionData:[45,50,55,60,58,62,65,60,58,63,66,62,60]},
  {id:'2407164-1 → IM365', percent:0, partCount:'0 / 1 min', productionData:[0,5,3,0,2,1,0,4,2,0,3,1,0]},
  {id:'2407237-1 → SM76', percent:70.6, partCount:'112 / 722 Pcs', productionData:[65,70,72,75,73,72,74,76,74,72,71,69,68]},
  {id:'2407399-1 → SM77', percent:98.5, partCount:'1121 / 1234 Pcs', productionData:[95,96,97,98,99,98,99,100,99,98,97,96,95]},
  {id:'2202598-3 → SM70', percent:15.2, partCount:'66 / 443 Pcs', productionData:[40,42,45,48,46,44,42,40,38,36,34,35,37]},
  {id:'2407001-1 → IM200', percent:88.1, partCount:'800 / 908 Pcs', productionData:[85,86,87,88,89,88,89,90,89,88,87,86,85]}
]

export default function FactoryOverview(){
  return (
    <div>
      <h2>Factory (Live) Overview</h2>
      <div style={{display:'grid',gridTemplateColumns:'320px 1fr',gap:12,alignItems:'start'}}>
        <div>
          <FactoryStatusCard machines={machines} />
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))',gap:12}}>
          {machines.map(m=> (
            <MachineCard key={m.id} id={m.id} percent={m.percent} partCount={m.partCount} productionData={m.productionData} />
          ))}
        </div>
      </div>
    </div>
  )
}
