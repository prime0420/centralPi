const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { Server: SocketIOServer } = require('socket.io')

let initSqlJs = require('sql.js')
initSqlJs = initSqlJs && initSqlJs.default ? initSqlJs.default : initSqlJs

const app = express()
app.use(cors())
app.use(express.json())

// --- create HTTP server + socket.io ---
const server = http.createServer(app)
const io = new SocketIOServer(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
})

// optional: debug socket connections
io.on('connection', (socket) => {
  console.log('socket connected:', socket.id)
  socket.on('disconnect', () => console.log('socket disconnected:', socket.id))
})

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'src', 'lib', 'machines.db')
console.log('dbpath', dbPath)

let db = null
console.log('initSqlJs typeof', typeof initSqlJs)

// initialize sql.js and load DB
;(async () => {
  try {
    const SQL = await initSqlJs()
    const filebuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(new Uint8Array(filebuffer))
    console.log('Opened DB at', dbPath)

    // start periodic timeout checks after DB is ready
    startTimeoutWatcher()
  } catch (err) {
    console.error('Could not open DB at', dbPath)
    console.error(err && err.message)
  }
})()

// ----------------------------
// sql.js helpers
// ----------------------------
function resultToRows(result) {
  if (!result || !result.values) return []
  const cols = result.columns
  return result.values.map((vals) => {
    const obj = {}
    vals.forEach((v, i) => {
      obj[cols[i]] = v
    })
    return obj
  })
}

// helper to run a query and return rows
function queryRows(sql) {
  const results = db.exec(sql)
  return resultToRows(results[0])
}

// escape single quotes for sql string literals
function escSqlString(value) {
  return String(value).replace(/'/g, "''")
}

// convert JS values into SQL literal safely for our simple inserts
function toSqlLiteral(value) {
  if (value === undefined || value === null) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  return `'${escSqlString(value)}'`
}

function getOneRow(sql) {
  const rows = queryRows(sql)
  return rows[0] || null
}

function runExec(sql) {
  db.exec(sql)
}

// If you want logs to persist, write DB back to file after inserts.
// This can be heavy; you can throttle it later.
function persistDbToFileSafe() {
  try {
    const data = db.export()
    fs.writeFileSync(dbPath, Buffer.from(data))
  } catch (e) {
    console.error('Failed to persist DB to file:', e.message)
  }
}

// ----------------------------
// TIMEOUT CHECK (merged logic)
// ----------------------------
const TIMEOUT_MS = 8000 // 8 seconds
const MIN_RECENT_MS = 2000 // skip machines updated in last 2 seconds

function parseLastUpdatedMs(value) {
  // your DB might store ISO string, unix ms, or unix seconds
  if (value == null) return NaN

  // number-like?
  if (typeof value === 'number') {
    // if seconds, convert
    return value < 1e12 ? value * 1000 : value
  }

  // string-like?
  const s = String(value).trim()
  if (!s) return NaN

  // numeric string
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    return n < 1e12 ? n * 1000 : n
  }

  // ISO string or other date format
  const t = Date.parse(s)
  return t
}

function checkTimeouts() {
  if (!db) throw new Error('database not available')

  const now = Date.now()
  console.log('Checking timeouts at', new Date(now).toISOString())
  const machines = queryRows('SELECT * FROM Machines')

  let checkedCount = 0
  let timedOutCount = 0

  for (const machine of machines) {
    const machineName = machine.name
    if (!machineName) {
      console.error('Machine missing name field:', machine)
      continue
    }

    const lastUpdatedMs = parseLastUpdatedMs(machine.last_updated)
    if (isNaN(lastUpdatedMs)) {
      if (machine.last_updated != null) {
        console.error(`Invalid timestamp for machine ${machineName}:`, machine.last_updated)
      }
      continue
    }

    const timeSinceUpdate = now - lastUpdatedMs
    checkedCount++

    if (timeSinceUpdate < MIN_RECENT_MS) continue

    if (timeSinceUpdate >= TIMEOUT_MS) {
      timedOutCount++
      io.emit('machine-update', machine)
    }
  }

  return {
    success: true,
    checked: checkedCount,
    timedOut: timedOutCount,
  }
}

// run checker on interval
function startTimeoutWatcher() {
  try {
    checkTimeouts()
  } catch (e) {
    console.error('timeout check failed:', e.message)
  }

  const intervalMs = 1000 // every 1s
  setInterval(() => {
    try {
      checkTimeouts()
    } catch (e) {
      console.error('timeout check failed:', e.message)
    }
  }, intervalMs)

  console.log('Timeout watcher started')
}

// ----------------------------
// your existing APIs
// ----------------------------
app.get('/api/machines', (req, res) => {
  if (!db) return res.status(500).json({ error: 'database not available' })
  try {
    const rows = queryRows('SELECT * FROM Machines')
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/logs', (req, res) => {
  if (!db) return res.status(500).json({ error: 'database not available' })
  try {
    const machine = req.query.machine
    let query
    if (machine) {
      const safe = escSqlString(machine)
      query = `SELECT * FROM Logs WHERE machine_name = '${safe}' ORDER BY id ASC`
    } else {
      query = `SELECT * FROM Logs ORDER BY id ASC`
    }
    const rows = queryRows(query)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// optional: manual timeout check
app.get('/api/check-timeouts', (req, res) => {
  if (!db) return res.status(500).json({ error: 'database not available' })
  try {
    const result = checkTimeouts()
    console.log('Manual timeout check triggered via GET /api/check-timeouts', result)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/check-timeouts', (req, res) => {
  if (!db) return res.status(500).json({ error: 'database not available' })
  try {
    res.json(checkTimeouts())
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// --------------------------------------------------
// ✅ NEW: /api/machine-log (GET + POST) like Next.js
// --------------------------------------------------
function normalizeLogPayload(payload) {
  return {
    machine_name: payload.machine_name,
    event: payload.event,
    total_count: payload.total_count != '' ? Number(payload.total_count) : 0,
    interval_count: payload.interval_count != '' ? Number(payload.interval_count) : 0,
    machine_rate: payload.machine_rate != '' ? Number(payload.machine_rate) : 0,
    comments: payload.comments ?? '',
    mo: payload.mo ?? '',
    part_number: payload.part_number ?? '',
    operator_id: payload.operator_id ?? '',
    shift_number: payload.shift_number ?? '',
  }
}

function handleLogInsertExpress(req, res, payloadRaw) {
  if (!db) return res.status(500).json({ error: 'database not available' })

  const payload = normalizeLogPayload(payloadRaw || {})
  const { machine_name, event } = payload

  // Validate required fields
  if (!machine_name || typeof machine_name !== 'string') {
    return res.status(400).json({ error: 'machine_name is required' })
  }

  if (!event || typeof event !== 'string') {
    return res.status(400).json({ error: 'event is required' })
  }

  // Verify machine exists
  const safeMachine = escSqlString(machine_name)
  const machineExists = getOneRow(`SELECT id FROM Machines WHERE name = '${safeMachine}'`)
  if (!machineExists) {
    return res.status(404).json({
      error: 'Machine not found. Register via health-check first.',
    })
  }

  try {
    // Insert log record (sql.js exec)
    const insertSql = `
      INSERT INTO Logs (
        machine_name, event, total_count, interval_count,
        machine_rate, comments, mo, part_number, operator_id, shift_number
      )
      VALUES (
        ${toSqlLiteral(machine_name)},
        ${toSqlLiteral(event)},
        ${toSqlLiteral(payload.total_count)},
        ${toSqlLiteral(payload.interval_count)},
        ${toSqlLiteral(payload.machine_rate)},
        ${toSqlLiteral(payload.comments)},
        ${toSqlLiteral(payload.mo)},
        ${toSqlLiteral(payload.part_number)},
        ${toSqlLiteral(payload.operator_id)},
        ${toSqlLiteral(payload.shift_number)}
      );
    `
    runExec(insertSql)

    // Get inserted id + record
    const idRow = getOneRow(`SELECT last_insert_rowid() AS id`)
    const logId = idRow ? idRow.id : null

    const logRecord = logId
      ? getOneRow(`SELECT * FROM Logs WHERE id = ${Number(logId)}`)
      : null

    // Emit Socket.io event so frontend updates logs in real-time
    io.emit('log-created', {
      machine_name,
      log: logRecord,
    })

    // Optional: persist DB changes to file so they survive restart
    persistDbToFileSafe()

    return res.json({
      success: true,
      logId,
      log: logRecord,
    })
  } catch (error) {
    console.error('Error inserting log:', error)
    return res.status(500).json({
      error: 'Failed to insert log record',
      details: String(error && error.message ? error.message : error),
    })
  }
}

// POST /api/machine-log
app.post('/api/machine-log', (req, res) => {
  console.log('Received machine-log POST:', req.body)
  return handleLogInsertExpress(req, res, req.body)
})

// GET /api/machine-log?machine_name=...&event=...&total_count=...
app.get('/api/machine-log', (req, res) => {
  console.log('Received machine-log GET:', req.query)
  // Next.js version inserts even on GET using querystring
  return handleLogInsertExpress(req, res, req.query)
})

// -------------------
// start server
// -------------------
const port = process.env.PORT || 4000
server.listen(port, () => console.log('Server listening on', port))
