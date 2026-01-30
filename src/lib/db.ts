// This module is server-only. When bundled for the browser we export a lightweight
// stub so frontend builds don't try to resolve native modules like
// `better-sqlite3`, `fs`, or `path`.

let db: any = null;

if (typeof window === 'undefined') {
  // Load server-only modules dynamically to avoid webpack static analysis.
  // Using eval('require') prevents bundlers from trying to resolve these
  // at build time for the client bundle.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-eval
  const requireFn: any = eval('require');

  const Database = requireFn('better-sqlite3');
  const path = requireFn('path');
  const fs = requireFn('fs');

  const dbPath = path.join(process.cwd(), 'data', 'machines.db');

  // Ensure data directory exists
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(dbPath);

  // Initialize database schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS Machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      last_updated DATETIME DEFAULT (datetime('now','localtime'))
    )
  `);

  // Create Logs table with foreign key to Machines
  db.exec(`
    CREATE TABLE IF NOT EXISTS Logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      machine_name TEXT NOT NULL,
      event TEXT NOT NULL,
      total_count INTEGER DEFAULT 0,
      interval_count INTEGER DEFAULT 0,
      machine_rate REAL DEFAULT 0,
      comments TEXT,
      mo TEXT,
      part_number TEXT,
      operator_id TEXT,
      shift_number TEXT,
      created_at DATETIME DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (machine_name) REFERENCES Machines(name) ON DELETE CASCADE
    )
  `);
} else {
  // Browser stub: provide the minimal interface the client code expects so
  // imports don't fail during bundling. Methods return safe defaults.
  db = {
    prepare: () => ({
      get: () => null,
      all: () => [],
      run: () => ({ lastInsertRowid: 0 }),
    }),
  };
}

export default db;
