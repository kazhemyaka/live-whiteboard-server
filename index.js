const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();

const PORT = process.env.PORT || 3001;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const rooms = {}; // { roomId: { notes: {}, users: {} } }

function emitRoomUsers(roomId) {
  if (!rooms[roomId]) return;
  io.to(roomId).emit("users:all", Object.values(rooms[roomId].users));
}

app.get("/", (req, res) => {
  res.send("Server is running");
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_room", (payload) => {
    const roomId = typeof payload === "string" ? payload : payload?.roomId;
    const user = typeof payload === "object" ? payload?.user : null;

    if (!roomId) return;

    socket.join(roomId);
    socket.data.roomId = roomId;

    if (!rooms[roomId]) {
      rooms[roomId] = { notes: {}, users: {} };
    }

    rooms[roomId].users[socket.id] = {
      id: socket.id,
      name: user?.name || `User-${socket.id.slice(0, 5)}`,
      joinedAt: Date.now(),
    };

    socket.emit("notes:all", Object.values(rooms[roomId].notes));
    emitRoomUsers(roomId);
  });

  socket.on("users:list", (roomId, callback) => {
    if (!roomId || !rooms[roomId]) {
      callback([]);
      return;
    }

    callback(Object.values(rooms[roomId].users));
  });

  socket.on("room:exists", (roomId, callback) => {
    const exists = Boolean(rooms[roomId]);
    callback(exists);
  });

  socket.on("note:create", ({ roomId, note }) => {
    rooms[roomId].notes[note.id] = note;

    io.to(roomId).emit("note:created", note);
  });

  socket.on("note:update", ({ roomId, note }) => {
    const existing = rooms[roomId]?.notes[note.id];

    if (!existing) return;

    if (note.version < existing.version) {
      socket.emit("note:conflict", note.id);
      return;
    }

    const updated = {
      ...note,
      version: existing.version + 1,
      updatedAt: Date.now(),
    };
    rooms[roomId].notes[note.id] = updated;

    io.to(roomId).emit("note:updated", updated);
  });

  socket.on("note:delete", ({ roomId, id }) => {
    if (!rooms[roomId]) return;

    delete rooms[roomId].notes[id];

    io.to(roomId).emit("note:deleted", id);
  });

  socket.on("disconnect", () => {
    const roomId = socket.data.roomId;

    if (roomId && rooms[roomId]?.users?.[socket.id]) {
      delete rooms[roomId].users[socket.id];
      emitRoomUsers(roomId);
    }

    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
