// ────────────────────────────────────────────────
// server1.js | Servidor Exclusivo para Chat en Vivo
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
  res.send("🚀 Servidor de Chat Quiniela360 Activo y Corriendo");
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
  console.log("👤 Usuario conectado al chat:", socket.id);

  // Escuchar cuando un usuario envía un mensaje
  socket.on("chat message", (data) => {
    // Reenviar el mensaje a todos los usuarios conectados en la sala
    io.emit("chat message", data);
  });

  socket.on("disconnect", () => {
    console.log("👤 Usuario desconectado del chat:", socket.id);
  });
});

// ──────────────── CONFIGURACIÓN DE PUERTO ────────────────
// Usamos el puerto 10001 por defecto para no chocar con el puerto 10000 de server.js
const PORT = process.env.PORT || 10001;

httpServer.listen(PORT, () => {
  console.log(`💬 Servidor de Chat activo en el puerto ${PORT}`);
});
