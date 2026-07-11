const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Configuración de CORS para permitir conexiones desde tu dominio de GitHub Pages
app.use(cors({
    origin: "*", 
    methods: ["GET", "POST"]
}));

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Ruta de prueba para verificar que el backend esté en línea desde el navegador
app.get('/', (req, res) => {
    res.send('🚀 Servidor de Quiniela360 Multi-Salas corriendo correctamente.');
});

// LÓGICA DE CONEXIONES EN TIEMPO REAL (SOCKET.IO)
io.on('connection', (socket) => {
    console.log(`📡 Nuevo dispositivo conectado ID: ${socket.id}`);

    // Un usuario solicita ingresar a un grupo/sala específica
    socket.on('join-room', (data) => {
        const { peerId, nombre, grupo } = data;
        
        // Vincular los datos de identidad a la sesión del socket actual
        socket.grupo = grupo || "General";
        socket.peerId = peerId;
        socket.nombre = nombre;

        // Unirse formalmente a la sala exclusiva de Socket.io para ese grupo
        socket.join(socket.grupo);
        console.log(`👤 [${socket.grupo}] ${nombre} (Peer: ${peerId}) se ha unido.`);

        // Avisar ÚNICAMENTE a los demás miembros que están dentro de este mismo grupo
        socket.to(socket.grupo).emit('user-joined-room', {
            peerId: peerId,
            nombre: nombre
        });
    });

    // Enrutar los mensajes de texto del chat bajo el contexto de su sala
    socket.on('chat message', (data) => {
        if (socket.grupo) {
            // Envía el mensaje a todos en el grupo, incluido quien lo envió
            io.to(socket.grupo).emit('chat message', {
                user: data.user,
                text: data.text
            });
        }
    });

    // Intercambio de respuestas P2P WebRTC restringido al grupo del usuario
    socket.on('reply-room', (data) => {
        if (socket.grupo) {
            socket.to(socket.grupo).emit('user-replied-room', data);
        }
    });

    // Gestión automática cuando un usuario cierra la pestaña o pierde conexión
    socket.on('disconnect', () => {
        if (socket.grupo && socket.peerId) {
            console.log(`❌ [${socket.grupo}] ${socket.nombre} abandonó la sala.`);
            
            // Ordenar al resto de miembros del grupo que eliminen su cuadro de video/audio
            socket.to(socket.grupo).emit('user-left-room', socket.peerId);
        } else {
            console.log(`📡 Dispositivo ID: ${socket.id} se ha desconectado de la red.`);
        }
    });
});

// Iniciar el servidor en el puerto proporcionado por Render o por defecto el 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🔥 Servidor escuchando en el puerto http://localhost:${PORT}`);
});
