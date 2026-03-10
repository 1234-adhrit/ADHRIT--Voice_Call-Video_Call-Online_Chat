const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e7
});

const rooms = new Map();
const ROOM_LIMIT = 2;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

function getRoomSummary(room) {
  return Array.from(room.participants.values()).map((p) => ({
    name: p.name,
    callType: p.callType
  }));
}

function leaveRoom(socket) {
  const roomId = socket.data.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  room.participants.delete(socket.id);
  socket.to(roomId).emit("peer-left", {
    id: socket.id,
    name: socket.data.name || "Unknown"
  });

  if (room.participants.size === 0) {
    rooms.delete(roomId);
  }
}

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, name, callType }) => {
    if (!roomId || !name) {
      socket.emit("join-error", { message: "Name and room code are required." });
      return;
    }

    let room = rooms.get(roomId);
    if (!room) {
      room = { participants: new Map() };
      rooms.set(roomId, room);
    }

    if (room.participants.size >= ROOM_LIMIT) {
      socket.emit("room-full");
      return;
    }

    room.participants.set(socket.id, {
      name,
      callType: callType || "video"
    });

    socket.data.roomId = roomId;
    socket.data.name = name;
    socket.data.callType = callType || "video";
    socket.join(roomId);

    socket.emit("room-joined", {
      roomId,
      participants: getRoomSummary(room)
    });

    socket.to(roomId).emit("peer-joined", {
      id: socket.id,
      name,
      callType: callType || "video"
    });
  });

  socket.on("signal-offer", ({ roomId, offer }) => {
    if (!roomId || !offer) return;
    socket.to(roomId).emit("signal-offer", { offer });
  });

  socket.on("signal-answer", ({ roomId, answer }) => {
    if (!roomId || !answer) return;
    socket.to(roomId).emit("signal-answer", { answer });
  });

  socket.on("signal-ice", ({ roomId, candidate }) => {
    if (!roomId || !candidate) return;
    socket.to(roomId).emit("signal-ice", { candidate });
  });

  socket.on("chat-message", ({ roomId, message, name, ts }) => {
    if (!roomId || !message) return;
    socket.to(roomId).emit("chat-message", {
      message,
      name: name || "Guest",
      ts: ts || Date.now()
    });
  });

  socket.on("chat-image", ({ roomId, dataUrl, name, ts, size }) => {
    if (!roomId || !dataUrl) return;
    if (size && size > MAX_IMAGE_BYTES) {
      socket.emit("chat-error", {
        message: "Image is too large. Max size is 2MB."
      });
      return;
    }
    socket.to(roomId).emit("chat-image", {
      dataUrl,
      name: name || "Guest",
      ts: ts || Date.now()
    });
  });

  socket.on("leave-room", () => {
    leaveRoom(socket);
  });

  socket.on("disconnect", () => {
    leaveRoom(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
