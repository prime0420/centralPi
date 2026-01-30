import { NextRequest, NextResponse } from 'next/server'
import { getSocketIO } from '../lib/socket'
import db from '../lib/db'
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:4000'

export const dynamic = 'force-dynamic';

export interface Machine {
  id?: string
  machine_id?: string
  name?: string
  machine_name?: string
  last_updated: string;
  // [key: string]: any
}

export interface LogEntry {
  id?: string
  machine_name?: string
  event?: string
  total_count?: number
  interval_count?: number
  machine_rate?: number
  comments?: string
  mo?: string
  part_number?: string
  operator_id?: string
  shift_number?: number
  created_at?: string
  // [key: string]: any
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
  return logs.filter(log => String(log.created_at || '').startsWith(dateStr))
}

export function getLogsForMachineAndDate(logs: LogEntry[], machineId: string, date: Date): LogEntry[] {
  const dateStr = date.toISOString().split('T')[0]
  return logs.filter(log => {
    return log.machine_name === machineId && String(log.created_at || '').startsWith(dateStr)
  })
}

export function groupLogsByHour(logs: LogEntry[]): Record<string, LogEntry[]> {
  const grouped: Record<string, LogEntry[]> = {}
  logs.forEach(log => {
    const date = new Date(String(log.created_at || '').replace(' ', 'T'))
    const hour = String(date.getHours()).padStart(2, '0')
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
    .sort((a, b) => new Date(String(a.created_at || '').replace(' ', 'T')).getTime() - new Date(String(b.created_at || '').replace(' ', 'T')).getTime())
  
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

async function handleLogInsert(payload: any) {
  const { machine_name, event } = payload;

  // Validate required fields
  if (!machine_name || typeof machine_name !== 'string') {
    return NextResponse.json(
      { error: 'machine_name is required' },
      { status: 400 }
    );
  }

  if (!event || typeof event !== 'string') {
    return NextResponse.json({ error: 'event is required' }, { status: 400 });
  }

  // Verify machine exists
  const machineExists = db
    .prepare('SELECT id FROM Machines WHERE name = ?')
    .get(machine_name);

  if (!machineExists) {
    return NextResponse.json(
      { error: 'Machine not found. Register via health-check first.' },
      { status: 404 }
    );
  }

  try {
    // Insert log record
    const insert = db.prepare(`
      INSERT INTO Logs (
        machine_name, event, total_count, interval_count,
        machine_rate, comments, mo, part_number, operator_id, shift_number
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = insert.run(
      machine_name,
      event,
      payload.total_count ?? 0,
      payload.interval_count ?? 0,
      payload.machine_rate ?? 0,
      payload.comments ?? null,
      payload.mo ?? null,
      payload.part_number ?? null,
      payload.operator_id ?? null,
      payload.shift_number ?? null
    );

    const logId = result.lastInsertRowid;

    // Retrieve the inserted log
    const logRecord = db
      .prepare('SELECT * FROM Logs WHERE id = ?')
      .get(logId);

    // Emit Socket.io event so frontend updates logs in real-time
    const io = getSocketIO();
    if (io) {
      io.emit('log-created', {
        machine_name,
        log: logRecord,
      });
    }

    return NextResponse.json({
      success: true,
      logId,
      log: logRecord,
    });
  } catch (error) {
    console.error('Error inserting log:', error);
    return NextResponse.json(
      { error: 'Failed to insert log record', details: error },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    return handleLogInsert(body as LogEntry);
  } catch (err) {
    console.error('machine-log POST error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const payload: LogEntry = {
      machine_name: searchParams.get('machine_name') || undefined,
      event: searchParams.get('event') || undefined,
      total_count: searchParams.has('total_count')
        ? Number(searchParams.get('total_count'))
        : undefined,
      interval_count: searchParams.has('interval_count')
        ? Number(searchParams.get('interval_count'))
        : undefined,
      machine_rate: searchParams.has('machine_rate')
        ? Number(searchParams.get('machine_rate'))
        : undefined,
      comments: searchParams.get('comments') || undefined,
      mo: searchParams.get('mo') || undefined,
      part_number: searchParams.get('part_number') || undefined,
      operator_id: searchParams.get('operator_id') || undefined,
      shift_number: searchParams.has('shift_number')
        ? Number(searchParams.get('shift_number'))
        : undefined,
    };

    return handleLogInsert(payload);
  } catch (err) {
    console.error('machine-log GET error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const TIMEOUT_MS = 8000; // 5 seconds

async function checkTimeouts() {
  const now = Date.now();
  
  // Get all machines
    const machines = db
      .prepare('SELECT * FROM Machines')
      .all();

  const io = getSocketIO();
  let checkedCount = 0;

  // Check all machines and broadcast updates for machines that have timed out
  for (const machine of machines) {
    const machineName = machine.name;
    
    if (!machineName) {
      console.error('Machine missing name field:', machine);
      continue;
    }
    
    // Parse last_updated timestamp
    const lastUpdatedStr = machine.last_updated;
    if (!lastUpdatedStr) {
      continue;
    }
    // Parse timestamp with a safe fallback
    const parsed = new Date(String(lastUpdatedStr).replace(' ', 'T')).getTime();

    // Check if timestamp is valid
    if (isNaN(parsed)) {
      console.error(`Invalid timestamp for machine ${machineName}: ${lastUpdatedStr}`);
      continue;
    }

    const timeSinceUpdate = now - parsed;
    checkedCount++;

    // Safety check: Don't process machines that were updated very recently (within last 2 seconds)
    if (timeSinceUpdate < 2000) {
      continue; // Skip machines that were just updated (within last 2 seconds)
    }

    // If machine hasn't checked in for 3+ seconds, broadcast update
    if (timeSinceUpdate >= TIMEOUT_MS) {
      // Broadcast update via Socket.io so frontend can update the status
      if (io) {
        io.emit('machine-update', machine);
      }

      // console.log(`Machine ${machineName} timed out (last update: ${timeSinceUpdate}ms ago)`);
    }
  }

  return {
    success: true,
    checked: checkedCount,
    updated: 0, // No database updates needed, status is derived
  };
}

export async function POSTHealth() {
  try {
    return NextResponse.json(await checkTimeouts());
  } catch (error) {
    console.error('Error in machine timeout check:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GETHealth() {
  try {
    return NextResponse.json(await checkTimeouts());
  } catch (error) {
    console.error('Error in machine timeout check:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}


