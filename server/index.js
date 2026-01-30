const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
let initSqlJs = require('sql.js')
initSqlJs = initSqlJs && initSqlJs.default ? initSqlJs.default : initSqlJs

const app = express()
app.use(cors())
app.use(express.json())

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'src', 'lib', 'machines.db')
console.log("dbpath", dbPath)
let db = null
console.log('initSqlJs typeof', typeof initSqlJs);
// initialize sql.js and load DB
(async () => {
  try {
    const SQL = await initSqlJs()
    const filebuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(new Uint8Array(filebuffer))
    console.log('Opened DB at', dbPath)
    // Start polling a realtime source (Python server) and persist new logs to DB
    try {
      const REALTIME_SOURCE = process.env.REALTIME_SOURCE_URL || 'http://localhost:8000/api/current-log'
      const REALTIME_INTERVAL = parseInt(process.env.REALTIME_INTERVAL_MS || '10000', 10)

      async function fetchAndSaveRealtime() {
        try {
          const resp = await fetch(REALTIME_SOURCE)
          if (!resp.ok) return
          const payload = await resp.json()
          const entries = Array.isArray(payload) ? payload : [payload]

          for (const entry of entries) {
            const machine_name = String(entry.machine_name || entry.machine || entry.name || '')
            const event = String(entry.event || '')
            const total_count = Number(entry.total_count || 0)
            const interval_count = Number(entry.interval_count || 0)
            const machine_rate = Number(entry.machine_rate || 0)
            const comments = String(entry.comments || '')
            const mo = String(entry.mo || '')
            const part_number = String(entry.part_number || '')
            const operator_id = String(entry.operator_id || '')
            const shift_number = Number(entry.shift_number || 0)
            const created_at = entry.created_at || new Date().toISOString().replace('T', ' ').split('.')[0]

            const safeMachine = machine_name.replace(/'/g, "''")
            const safeCreated = String(created_at).replace(/'/g, "''")

            // Check for an existing identical timestamped entry to avoid duplicates
            const checkQ = `SELECT COUNT(*) as cnt FROM Logs WHERE machine_name='${safeMachine}' AND created_at='${safeCreated}'`
            const res = db.exec(checkQ)
            let exists = false
            if (res && res[0] && res[0].values && res[0].values[0]) {
              const cnt = Number(res[0].values[0][0])
              exists = cnt > 0
            }

            if (!exists) {
              const insertQ = `INSERT INTO Logs (machine_name,event,total_count,interval_count,machine_rate,comments,mo,part_number,operator_id,shift_number,created_at) VALUES ('${safeMachine}','${String(event).replace(/'/g, "''")}',${total_count},${interval_count},${machine_rate},'${String(comments).replace(/'/g, "''")}','${String(mo).replace(/'/g, "''")}','${String(part_number).replace(/'/g, "''")}','${String(operator_id).replace(/'/g, "''")}',${shift_number},'${safeCreated}')`
              try {
                db.run(insertQ)
                const data = db.export()
                fs.writeFileSync(dbPath, Buffer.from(data))
                console.log('Saved realtime log for', machine_name, created_at)
              } catch (e) {
                console.error('Failed to insert realtime log:', e && e.message)
              }
            }
          }
        } catch (e) {
          // keep polling even if errors occur
          console.error('Realtime fetch error', e && e.message)
        }
      }

      // initial fetch + periodic
      fetchAndSaveRealtime()
      setInterval(fetchAndSaveRealtime, REALTIME_INTERVAL)
    } catch (e) {
      console.error('Failed to start realtime polling:', e && e.message)
    }
  } catch (err) {
    console.error('Could not open DB at', dbPath)
    console.error(err && err.message)
  }
})()

function resultToRows(result) {
  if (!result || !result.values) return []
  const cols = result.columns
  return result.values.map(vals => {
    const obj = {}
    vals.forEach((v, i) => { obj[cols[i]] = v })
    return obj
  })
}

app.get('/api/machines', (req, res) => {
  if (!db) return res.status(500).json({ error: 'database not available' })
  try {
    const results = db.exec('SELECT * FROM Machines')
    const rows = resultToRows(results[0])
    // console.log("************first data - machines", rows)
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/logs', (req, res) => {
  if (!db) return res.status(500).json({ error: 'database not available' })
  try {
    const machine = req.query.machine
    const date = req.query.date
    let query
    if (machine) {
      const safe = String(machine).replace(/'/g, "''")
      query = `SELECT * FROM Logs WHERE machine_name = '${safe}'`
    } else {
      query = `SELECT * FROM Logs`
    }

    if (date) {
      const safeDate = String(date).replace(/'/g, "''")
      query += ` AND created_at LIKE '${safeDate}%'
      ORDER BY id ASC LIMIT 1000`
    } else {
      query += ` ORDER BY id ASC LIMIT 1000`
    }

    const results = db.exec(query)
    const rows = resultToRows(results[0])
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const port = process.env.PORT || 5000
const server = app.listen(port, () => console.log('Server listening on', port))
