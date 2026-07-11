// ────────────────────────────────────────────────
// server1.js | Servidor Exclusivo para Chat y Voz en Vivo
// Versión para Quiniela360 (Render) - Puerto Separado
// ────────────────────────────────────────────────

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";

const app = express();

// 🔹 Configurar CORS para permitir que tu sitio en GitHub Pages se conecte
app.use(cors({
  origin: "https://qhricardo.github.io",
  methods: ["GET", "POST"],
}));

// Endpoint básico para verificar que el servidor del chat está vivo
app.get("/", (req, res) => {
  res.send("🚀 Servidor de Chat y Voz Quiniela360 Activo y Corriendo");
});

const httpServer = createServer(app);

// Inicializar Socket.io con las reglas de CORS
const io = new Server(httpServer, {
  cors: {
    origin: "https://qhricardo.github.io",
    methods: ["GET", "POST"]
  }
});

// Lógica de comunicación en tiempo real
io.on("connection", (socket) => {
  console.log("👤 Usuario conectado al chat/voz:", socket.id);

  // 💬 Mensajes de texto
  socket.on("chat message", (data) => {
    io.emit("chat message", data);
  });

  // 🎙️ 1. Un usuario nuevo entra a la sala de voz
  socket.on("join-voice", (data) => {
    // Le avisa a los usuarios existentes (excepto a sí mismo)
    socket.broadcast.emit("user-joined-voice", data);
  });

  // 🎙️ 2. Un usuario existente le responde al nuevo para sincronizarse
  socket.on("reply-voice", (data) => {
    socket.broadcast.emit("user-replied-voice", data);
  });

  socket.on("disconnect", () => {
    console.log("👤 Usuario desconectado del chat/voz:", socket.id);
  });
});

// ──────────────── CONFIGURACIÓN DE PUERTO ────────────────
const PORT = process.env.PORT || 10001;

httpServer.listen(PORT, () => {
  console.log(`💬 Servidor de Chat y Voz activo en el puerto ${PORT}`);
});
