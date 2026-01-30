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

// POST endpoint to insert a log (also handled via socket)
app.post('/api/logs', (req, res) => {
  if (!db) return res.status(500).json({ error: 'database not available' })
  try {
    const p = req.body || {}
    const machine_name = (p.machine_name || p.machine || '').replace(/'/g, "''")
    const event = (p.event || '').replace(/'/g, "''")
    const total_count = Number(p.total_count || 0)
    const interval_count = Number(p.interval_count || 0)
    const machine_rate = Number(p.machine_rate || 0)
    const comments = p.comments ? (String(p.comments).replace(/'/g, "''")) : null
    const mo = p.mo ? (String(p.mo).replace(/'/g, "''")) : null
    const part_number = p.part_number ? (String(p.part_number).replace(/'/g, "''")) : null
    const operator_id = p.operator_id ? (String(p.operator_id).replace(/'/g, "''")) : null
    const shift_number = p.shift_number ? Number(p.shift_number) : null

    const insertSql = `INSERT INTO Logs (machine_name, event, total_count, interval_count, machine_rate, comments, mo, part_number, operator_id, shift_number, created_at) VALUES ('${machine_name}', '${event}', ${total_count}, ${interval_count}, ${machine_rate}, ${comments ? "'"+comments+"'" : 'NULL'}, ${mo ? "'"+mo+"'" : 'NULL'}, ${part_number ? "'"+part_number+"'" : 'NULL'}, ${operator_id ? "'"+operator_id+"'" : 'NULL'}, ${shift_number !== null ? shift_number : 'NULL'}, datetime('now','localtime'))`

    db.run(insertSql)

    const last = db.exec('SELECT last_insert_rowid() AS id')
    const lastId = (last && last[0] && last[0].values && last[0].values[0]) ? last[0].values[0][0] : null
    const recRes = db.exec(`SELECT * FROM Logs WHERE id = ${lastId}`)
    const recs = resultToRows(recRes[0])
    const record = recs[0]

    // persist DB to disk
    try {
      const buffer = Buffer.from(db.export())
      fs.writeFileSync(dbPath, buffer)
    } catch (err) {
      console.error('Failed to persist DB to disk', err && err.message)
    }

    // emit via socket.io if available
    try {
      if (global.io) global.io.emit('log-created', { machine_name, log: record })
    } catch (err) {
      // ignore socket errors
    }

    res.json({ success: true, id: lastId, log: record })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const http = require('http')
const { Server: SocketIOServer } = require('socket.io')

const port = process.env.PORT || 4000
const server = http.createServer(app)
const io = new SocketIOServer(server, { cors: { origin: '*' } })

// expose globally so other modules can emit without importing io
global.io = io

io.on('connection', (socket) => {
  console.log('socket connected', socket.id)

  socket.on('log', (p) => {
    try {
      if (!db) return
      const machine_name = (p.machine_name || p.machine || '').replace(/'/g, "''")
      const event = (p.event || '').replace(/'/g, "''")
      const total_count = Number(p.total_count || 0)
      const interval_count = Number(p.interval_count || 0)
      const machine_rate = Number(p.machine_rate || 0)
      const comments = p.comments ? (String(p.comments).replace(/'/g, "''")) : null
      const mo = p.mo ? (String(p.mo).replace(/'/g, "''")) : null
      const part_number = p.part_number ? (String(p.part_number).replace(/'/g, "''")) : null
      const operator_id = p.operator_id ? (String(p.operator_id).replace(/'/g, "''")) : null
      const shift_number = p.shift_number ? Number(p.shift_number) : null

      const insertSql = `INSERT INTO Logs (machine_name, event, total_count, interval_count, machine_rate, comments, mo, part_number, operator_id, shift_number, created_at) VALUES ('${machine_name}', '${event}', ${total_count}, ${interval_count}, ${machine_rate}, ${comments ? "'"+comments+"'" : 'NULL'}, ${mo ? "'"+mo+"'" : 'NULL'}, ${part_number ? "'"+part_number+"'" : 'NULL'}, ${operator_id ? "'"+operator_id+"'" : 'NULL'}, ${shift_number !== null ? shift_number : 'NULL'}, datetime('now','localtime'))`

      db.run(insertSql)

      const last = db.exec('SELECT last_insert_rowid() AS id')
      const lastId = (last && last[0] && last[0].values && last[0].values[0]) ? last[0].values[0][0] : null
      const recRes = db.exec(`SELECT * FROM Logs WHERE id = ${lastId}`)
      const recs = resultToRows(recRes[0])
      const record = recs[0]

      // persist DB to disk
      try {
        const buffer = Buffer.from(db.export())
        fs.writeFileSync(dbPath, buffer)
      } catch (err) {
        console.error('Failed to persist DB to disk', err && err.message)
      }

      io.emit('log-created', { machine_name, log: record })
    } catch (err) {
      console.error('socket log handler error', err && err.message)
    }
  })

  socket.on('disconnect', () => {
    console.log('socket disconnected', socket.id)
  })
})

server.listen(port, () => console.log('Server listening on', port))
