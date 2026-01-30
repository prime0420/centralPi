import express from "express";
import http from "http";
import { Server } from "socket.io";

const app = express();
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*"} // lock this down in prod
});

// clients connect
io.on("connection", (socket) => {
  // client will send which machine it cares about
  socket.on("subscribe", ({ machine_id }) => {
    if (!machine_id) return;
    socket.join(`machine:${machine_id}`);
  });

  socket.on("unsubscribe", ({ machine_id }) => {
    socket.leave(`machine:${machine_id}`);
  });
});

// Python posts here (same as your /api/machine-log)
app.post("/api/machine-log", (req, res) => {
  const payload = req.body;

  // choose a consistent key name (your payload uses machine_name)
  const machineId = payload.machine_name || payload.name || payload.machine_id;

  if (machineId) {
    io.to(`machine:${machineId}`).emit("machine_log", payload);
  }

  res.json({ ok: true });
});

// (optional) health-check endpoint too
app.get("/api/health-check", (req, res) => {
  const machineId = req.query.name;
  if (machineId) io.to(`machine:${machineId}`).emit("health", { machineId, ts: Date.now() });
  res.json({ ok: true });
});

server.listen(3001, () => console.log("Realtime gateway on :3001"));
