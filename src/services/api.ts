const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000'

export interface Machine {
  id?: string
  machine_id?: string
  name?: string
  machine_name?: string
  status?: string
  [key: string]: any
}

export interface LogEntry {
  id?: string
  machine_name: string
  event: string
  total_count: number
  interval_count: number
  machine_rate: number
  comments?: string
  mo?: string
  part_number?: string
  operator_id?: string
  shift_number?: number
  created_at: string
  [key: string]: any
}

export async function fetchMachines(): Promise<Machine[]> {
  try {
    const response = await fetch(`${API_BASE}/api/machines`)

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`)
    }

    const data: Machine[] = await response.json()
    // console.log("Machines API response:", data, data.length)

    return data
  } catch (error) {
    console.error('Failed to fetch machines:', error)
    return []
  }
}


export async function fetchLogs(machineFilter?: string): Promise<LogEntry[]> {
  try {
    const url = new URL(`${API_BASE}/api/logs`)

    if (machineFilter) {
      url.searchParams.append('machine', machineFilter)
    }

    const response = await fetch(url.toString())

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`)
    }

    const data: LogEntry[] = await response.json()

    return data;
      // console.log("****** response logs:", data)
    } catch (error) {
      console.error('Failed to fetch logs:', error)
      return []
    }
}

export function getLogsForDate(logs: LogEntry[], date: Date): LogEntry[] {
  const dateStr = date.toISOString().split('T')[0]
  return logs.filter(log => log.created_at.startsWith(dateStr))
}

export function getLogsForMachineAndDate(logs: LogEntry[], machineId: string, date: Date): LogEntry[] {
  const dateStr = date.toISOString().split('T')[0]
  return logs.filter(log => {
    return log.machine_name === machineId && log.created_at.startsWith(dateStr)
  })
}

export function groupLogsByHour(logs: LogEntry[]): Record<string, LogEntry[]> {
  const grouped: Record<string, LogEntry[]> = {}
  logs.forEach(log => {
    const date = new Date(log.created_at)
    const hour = date.getHours().toString().padStart(2, '0')
    if (!grouped[hour]) grouped[hour] = []
    grouped[hour].push(log)
  })
  return grouped
}

export function aggregateProductionData(logs: LogEntry[]): number[] {
  // Group logs into 13 periods and sum ALL production (not average)
  const data: number[] = []
  
  // Get all interval logs sorted by time
  const intervalLogs = logs
    .filter(l => l.event === 'Auto Interval Log')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  
  // If we have logs, distribute them into 13 periods
  if (intervalLogs.length > 0) {
    const logsPerPeriod = Math.ceil(intervalLogs.length / 13)
    
    for (let i = 0; i < 13; i++) {
      const start = i * logsPerPeriod
      const end = Math.min((i + 1) * logsPerPeriod, intervalLogs.length)
      const slice = intervalLogs.slice(start, end)
      const sum = slice.length > 0 
        ? slice.reduce((sum, log) => sum + (log.interval_count || 0), 0)
        : 0
      data.push(Math.round(sum))
    }
  } else {
    // Fallback if no interval logs
    data.fill(0, 0, 13)
  }
  
  return data
}

export function getEventStatus(event?: string): 'good' | 'bad' | 'warning' | 'on' | 'none' {
  if (!event) return 'none';
  const e = event.trim().toLowerCase();
  const map: Record<string, 'good' | 'bad' | 'warning' | 'on' | 'none'> = {
    'start button': 'bad',
    'auto interval log': 'good',
    'off': 'none',
  };
  if (map[e]) return map[e];
  return 'on';
}

export function getMinuteSecond(value: string): number {
  const date = new Date(value.replace(" ", "T"));
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  return minutes * 60 + seconds;
}

export function getHourMinuteSecond(value: string): number {
  const date = new Date(value.replace(" ", "T"));
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();

  return hours * 3600 + minutes * 60 + seconds;
}

export function calculateMachineHealth(logs: LogEntry[]): number {
  if (logs.length === 0) return 0
  
  const goodCount = logs.filter(l => getEventStatus(l.event) === 'good').length
  const total = logs.length
  return Math.round((goodCount / total) * 100 * 10) / 10
}

export function getAvailableDates(logs: LogEntry[]): Date[] {
  const dateSet = new Set<string>()

  for (const log of logs) {
    if (!log.created_at) continue

    // Works for:
    // "2026-01-07 21:32:24"  -> "2026-01-07"
    // "2026-01-07T21:32:24"  -> "2026-01-07"
    const dateStr = log.created_at.trim().split(/[ T]/)[0]

    // basic guard (optional)
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      dateSet.add(dateStr)
    }
  }

  // Convert to Date objects and sort descending (most recent first)
  return Array.from(dateSet)
    .map(ds => new Date(`${ds}T00:00:00`))
    .sort((a, b) => b.getTime() - a.getTime())
}

