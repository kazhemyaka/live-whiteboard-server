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

const rooms = {}; // { roomId: { notes: {} } }

app.get("/", (req, res) => {
  res.send("Server is running");
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_room", (roomId) => {
    socket.join(roomId);

    if (!rooms[roomId]) {
      rooms[roomId] = { notes: {} };
    }

    socket.emit("notes:all", Object.values(rooms[roomId].notes));
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
    console.log("User disconnected:", socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
