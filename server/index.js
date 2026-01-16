const express = require('express')
const cors = require('cors')
const path = require('path')

const app = express()
app.use(cors())
app.use(express.json())

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'machine.db')
let db
try {
  const Database = require('better-sqlite3')
  db = new Database(dbPath, { readonly: true })
  console.log('Opened DB at', dbPath)
} catch (err) {
  console.error('Could not open DB at', dbPath)
  console.error(err && err.message)
}

app.get('/api/machines', (req, res) => {
  if (!db) return res.status(500).json({ error: 'database not available' })
  try {
    const rows = db.prepare('SELECT * FROM Machines').all()
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/api/logs', (req, res) => {
  if (!db) return res.status(500).json({ error: 'database not available' })
  try {
    const machine = req.query.machine
    let rows
    if (machine) {
      rows = db.prepare('SELECT * FROM Logs WHERE machine_name = ? ORDER BY created_at DESC LIMIT 1000').all(machine)
    } else {
      rows = db.prepare('SELECT * FROM Logs ORDER BY created_at DESC LIMIT 1000').all()
    }
    res.json(rows)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

const port = process.env.PORT || 4000
app.listen(port, () => console.log('Server listening on', port))
