import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();

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

app.get('/', (req, res) => {
    res.send('🚀 Servidor de Quiniela360 Multi-Salas corriendo en ES Modules.');
});

io.on('connection', (socket) => {
    console.log(`📡 Nuevo dispositivo conectado ID: ${socket.id}`);

    socket.on('join-room', (data) => {
        const { peerId, nombre, grupo } = data;
        
        socket.grupo = grupo || "General";
        socket.peerId = peerId;
        socket.nombre = nombre;

        socket.join(socket.grupo);
        console.log(`👤 [${socket.grupo}] ${nombre} (Peer: ${peerId}) se ha unido.`);

        socket.to(socket.grupo).emit('user-joined-room', {
            peerId: peerId,
            nombre: nombre
        });
    });

    socket.on('chat message', (data) => {
        if (socket.grupo) {
            io.to(socket.grupo).emit('chat message', {
                user: data.user,
                text: data.text
            });
        }
    });

    socket.on('reply-room', (data) => {
        if (socket.grupo) {
            socket.to(socket.grupo).emit('user-replied-room', data);
        }
    });

    socket.on('disconnect', () => {
        if (socket.grupo && socket.peerId) {
            console.log(`❌ [${socket.grupo}] ${socket.nombre} abandonó la sala.`);
            socket.to(socket.grupo).emit('user-left-room', socket.peerId);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🔥 Servidor escuchando en el puerto http://localhost:${PORT}`);
});
