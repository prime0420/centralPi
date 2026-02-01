import React, { useMemo, useState, useEffect } from 'react'
import type { Socket } from 'socket.io-client';
import FactoryStatusCard from './cards/FactoryStatusCard'
import MachineCard from './cards/MachineCard'
import DateSelector from './DateSelector'
import { useSelectedDate } from '../context/DateContext'
import { useSelectedMachine } from '../context/MachineContext'
import { fetchMachines, fetchLogs, getLogsForDate, aggregateProductionData, calculateMachineHealth, getEventStatus, Machine as ApiMachine, LogEntry } from '../services/api'
// import socket from '../lib/clientSocket'

type Machine = {id: string; percent: number; partCount: string; productionData?: number[], power: 'On' | 'Off'}

function getMachinePower(machine: ApiMachine): 'On' | 'Off' {
  const lastUpdated = new Date(machine.last_updated).getTime();
  const now = Date.now();
  const timeSinceUpdate = now - lastUpdated;
  return timeSinceUpdate < 8000 ? 'On' : 'Off';
}

export default function FactoryOverview({ onMachineSelect }: { onMachineSelect?: () => void }){
  const { selectedDate } = useSelectedDate()
  const { setSelectedMachine } = useSelectedMachine()
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      try {
        const [machinesData, logsData] = await Promise.all([
          fetchMachines(),
          fetchLogs()
        ])

        // Get logs for selected date
        // console.log("Selected date in FactoryOverview:", selectedDate)
        const dateLogs = getLogsForDate(logsData, selectedDate)
        // console.log(`Logs for ${selectedDate.toDateString()}:`, dateLogs,)        
        // Group logs by machine
        const logsByMachine: Record<string, LogEntry[]> = {}
        dateLogs.forEach(log => {
          const machineId = String(log.machine_name || '')
          if (!machineId) return // skip logs without machine name
          if (!logsByMachine[machineId]) logsByMachine[machineId] = []
          logsByMachine[machineId].push(log)
        })

        // Build machine list - include ALL machines from API, with or without logs
        const machineList: Machine[] = machinesData.map(apiMachine => {
          const machineId = apiMachine.name || apiMachine.machine_name || ''
          const logs = logsByMachine[machineId] || []
          const power = getMachinePower(apiMachine)

          // Calculate health percentage based on event status
          const percent = calculateMachineHealth(logs)
          
          // Calculate total production from interval logs
          const intervalLogs = logs.filter(l => l.event === 'Auto Interval Log')
          const totalProduced = intervalLogs.reduce((sum, l) => sum + (l.total_count || 0), 0)
          const estimated = Math.max(totalProduced, logs.length > 0 ? Math.round(totalProduced * 1.2) : 100)

          return {
            id: machineId,
            percent: percent || 0,
            partCount: `${totalProduced} / ${estimated} Pcs`,
            productionData: aggregateProductionData(logs),
            power: power
          }
        })

        setMachines(machineList)
      } catch (error) {
        console.error('Failed to load data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()

    // subscribe to real-time log events to refresh overview
    const onLogCreated = () => {
      // simply refresh machines and logs for the selected date
      loadData()
    }

    // socket.on('log-created', onLogCreated)

    // Refresh data every minute (60000 ms)
    const interval = setInterval(() => {
      loadData()
    }, 60000)

    return () => {
      clearInterval(interval)
      // socket.off('log-created', onLogCreated)
    }
  }, [selectedDate])

  const dateDisplay = selectedDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })

  const handleMachineClick = (machineId: string) => {
    setSelectedMachine(machineId)
    onMachineSelect?.()
  }

  return (
    <div>
      <DateSelector />
      <h2>Factory Overview - {dateDisplay}</h2>
      {/* {loading && <p>Loading...</p>} */}
      <div style={{display:'grid',gridTemplateColumns:'170px 1fr',gap:12,alignItems:'start'}}>
        <div>
          <FactoryStatusCard machines={machines} />
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, 320px)',gap:12}}>
          {machines.map((m) => {
            return (
              <div
                key={m.id}
                onClick={() => handleMachineClick(m.id)}
                style={{ cursor: 'pointer' }}
              >
                <MachineCard id={m.id} percent={m.percent} partCount={m.partCount} productionData={m.productionData} />
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
