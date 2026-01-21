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
    let query
    if (machine) {
      const safe = machine.replace(/'/g, "''")
      query = `SELECT * FROM Logs WHERE machine_name = '${safe}' ORDER BY id ASC LIMIT 1000`
    } else {
      query = `SELECT * FROM Logs ORDER BY id ASC LIMIT 1000`
    }
    const results = db.exec(query)
    const rows = resultToRows(results[0])
    // console.log("************first data - logs", rows.slice(0, 5))
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const port = process.env.PORT || 4000
app.listen(port, () => console.log('Server listening on', port))
