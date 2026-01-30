import { useEffect, useState, useRef } from 'react'
import { fetchLogs, getLogsForDate, LogEntry } from '../services/api'

export default function useRealtimeLogs(opts: { machine?: string, date?: Date, intervalMs?: number }) {
  const { machine, date = new Date(), intervalMs = 2000 } = opts
  const [logs, setLogs] = useState<LogEntry[]>([])
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    const fetchAndFilter = async () => {
      try {
        const all = await fetchLogs(machine)
        const filtered = getLogsForDate(all, date)
        if (mounted.current) setLogs(filtered)
      } catch (err) {
        // swallow; caller can show empty state
        console.error('Realtime fetch error', err)
      }
    }

    // initial fetch
    fetchAndFilter()

    const id = setInterval(fetchAndFilter, intervalMs)
    return () => { mounted.current = false; clearInterval(id) }
  }, [machine, date?.toISOString(), intervalMs])

  return logs
}
