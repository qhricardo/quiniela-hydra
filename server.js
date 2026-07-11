// ────────────────────────────────────────────────
// server.js | Webhook + Mercado Pago v2 + Firebase + CORS
// Versión final funcional para Quiniela360 (Render)
// ────────────────────────────────────────────────

import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import cors from "cors";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";
import { createServer } from "http"; // 🚀 Importado para Socket.io
import { Server } from "socket.io";   // 🚀 Importado para Socket.io

// ──────────────── CONFIGURACIÓN BASE ────────────────
const app = express();
app.use(bodyParser.json());

// 🔹 CORS: Permitir solo tu frontend
app.use(cors({
  origin: "https://qhricardo.github.io",
  methods: ["GET", "POST", "OPTIONS"],
}));
app.options("*", cors());

// ──────────────── FIREBASE ────────────────
if (!admin.apps.length) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ No se encontró la variable FIREBASE_SERVICE_ACCOUNT");
    process.exit(1);
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();
console.log("✅ Firebase inicializado correctamente");

// ──────────────── MERCADO PAGO ────────────────
if (!process.env.MP_ACCESS_TOKEN) {
  console.error("❌ No se encontró la variable MP_ACCESS_TOKEN");
  process.exit(1);
}

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});
console.log("✅ Mercado Pago inicializado correctamente");

// ──────────────── ENDPOINT: Crear preferencia ────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;
    console.log("📤 Creando preferencia:", req.body);

    const preference = await new Preference(mpClient).create({
      body: {
        items: [
          {
            title: `Créditos Quiniela360 (${creditsToAdd})`,
            quantity: 1,
            currency_id: "MXN",
            unit_price: Number(amount),
          },
        ],
        payer: { name, email },
        external_reference: JSON.stringify({ userId, creditsToAdd }),
        back_urls: {
          success: "https://qhricardo.github.io/quiniela-hydra/success.html",
          failure: "https://qhricardo.github.io/quiniela-hydra/index.html",
          pending: "https://qhricardo.github.io/quiniela-hydra/index.html",
        },
        auto_return: "approved",
      },
    });

    console.log(`🧾 Preferencia creada para ${name}: $${amount} MXN`);

    res.json({
      id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "No se pudo generar la preferencia de pago" });
  }
});

// ──────────────── ENDPOINT: Webhook ────────────────
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    // 🧪 Webhook de prueba
    if (req.body.action === "payment.updated" && req.body.data.id === "123456") {
      console.log("🧪 Webhook de prueba recibido correctamente");
      return res.sendStatus(200);
    }

    const topic = webhook.topic || webhook.type || webhook.action;
    if (!topic || !topic.includes("payment")) {
      console.log("⚠️ Notificación ignorada (no es de pago)");
      return res.sendStatus(200);
    }

    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

    // 🔍 Consultar pago desde Mercado Pago
    const payment = await new Payment(mpClient).get({ id: paymentId });

    // 🔹 Extraer datos del pago
    let userId = null;
    let creditsToAdd = 0;

    try {
      if (payment.external_reference) {
        const meta = JSON.parse(payment.external_reference);
        userId = meta.userId;
        creditsToAdd = Number(meta.creditsToAdd) || 0;
      }
    } catch {
      console.warn("⚠️ external_reference malformado:", payment.external_reference);
    }

    console.log(`💰 Pago recibido | Estado: ${payment.status} | Usuario: ${userId} | Créditos: ${creditsToAdd}`);

    // 🔹 Guardar registro del pago
    await db.collection("payments").doc(`payment_${payment.id}`).set({
      id: payment.id,
      status: payment.status,
      userId: userId || null,
      creditsToAdd,
      amount: payment.transaction_amount || 0,
      date: payment.date_created || new Date().toISOString(),
    });

    // 🔹 Si el pago fue aprobado, actualizar créditos
    if (payment.status === "approved" && userId && creditsToAdd > 0) {
      try {
        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();

       if (userDoc.exists) {
        const currentData = userDoc.data();
        const currentCredits = Number(currentData.creditos || 0);
        const newCredits = currentCredits + creditsToAdd;
      
        await userRef.update({
          creditos: newCredits,
          updatedAt: new Date().toISOString(),
        });
      
        console.log(`✅ Créditos actualizados correctamente para ${userId}: ${currentCredits} → ${newCredits}`);
      } else {
        console.warn(`⚠️ No se encontró documento de usuario con ID = ${userId}`);
      }

      } catch (err) {
        console.error(`❌ Error actualizando créditos para ${userId}:`, err);
      }
    } else {
      console.log("ℹ️ No se actualizan créditos (pago no aprobado o datos faltantes)");
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error general en webhook:", error);
    res.sendStatus(500);
  }
});

// ──────────────── ENDPOINT: Créditos por invitación ────────────────
app.post("/credit-invite", async (req, res) => {
  try {
    const { referrerId, invitedUserId } = req.body;
    console.log("📩 /credit-invite recibido:", { referrerId, invitedUserId });

    // Validar datos
    if (!referrerId || !invitedUserId) {
      return res.status(400).json({ success: false, message: "Faltan parámetros" });
    }

    // 🔹 Documento del invitador
    const referrerRef = db.collection("users").doc(referrerId);
    const referrerSnap = await referrerRef.get();

    if (!referrerSnap.exists) {
      return res.status(404).json({ success: false, message: "Usuario que invitó no encontrado" });
    }

    // 🔹 Documento de invitaciones agrupadas por invitador
    const invitesRef = db.collection("invites").doc(referrerId);
    const invitesSnap = await invitesRef.get();

    let invitedUsers = [];
    if (invitesSnap.exists) {
      invitedUsers = invitesSnap.data().invitedUsers || [];
      const alreadyInvited = invitedUsers.some(u => u.invitedUserId === invitedUserId);
      if (alreadyInvited) {
        console.log("⚠️ Invitación duplicada, no se suman créditos.");
        return res.json({ success: false, message: "Ya se registró esta invitación" });
      }
    }

    // 🔹 Agregar nuevo invitado
    invitedUsers.push({
      invitedUserId,
      date: new Date().toISOString(),
    });

    await invitesRef.set({ invitedUsers }, { merge: true });

    // 🔹 Sumar crédito al invitador
    await referrerRef.update({
      creditos: admin.firestore.FieldValue.increment(1),
      lastInviteBonus: new Date().toISOString(),
    });

    console.log(`🎉 Crédito de invitación sumado a ${referrerId}`);
    res.json({
      success: true,
      message: "Crédito agregado exitosamente",
      referrerId,
      invitedUserId,
    });

  } catch (error) {
    console.error("❌ Error en /credit-invite:", error);
    res.status(500).json({ success: false, message: "Error interno", error: error.message });
  }
});

// ──────────────── SALA DE CHAT EN TIEMPO REAL ────────────────
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "https://qhricardo.github.io",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("👤 Usuario conectado al chat:", socket.id);

  // Escuchar cuando un usuario envía un mensaje
  socket.on("chat message", (data) => {
    // Reenviar el mensaje a todos los conectados en la sala
    io.emit("chat message", data);
  });

  socket.on("disconnect", () => {
    console.log("👤 Usuario desconectado del chat:", socket.id);
  });
});

// ──────────────── SERVIDOR ────────────────
const PORT = process.env.PORT || 10000;
// 🔹 Importante: Ahora escuchamos desde `httpServer` para que el chat y la API corran juntos.
httpServer.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
