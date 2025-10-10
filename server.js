// ────────────────────────────────────────────────
// 🔹 server.js | Webhook de Mercado Pago + Firebase
// ────────────────────────────────────────────────

import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import fetch from "node-fetch";
import 'dotenv/config';

const app = express();
app.use(bodyParser.json());

// 🔹 Inicializa Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert("./serviceAccountKey.json"),
  });
}
const db = admin.firestore();
console.log("✅ Firebase inicializado correctamente");

// 🔹 Token de Mercado Pago desde .env
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
if (!MP_ACCESS_TOKEN) {
  console.error("❌ ERROR: MP_ACCESS_TOKEN no definido en .env");
  process.exit(1);
}

// ────────────── Webhook ──────────────
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    // Procesar solo si es payment
    const topic = webhook.topic || webhook.type || webhook.action;
    if (!topic || !topic.includes("payment")) {
      console.log("⚠️ Notificación ignorada (no es pago)");
      return res.sendStatus(200);
    }

    // Obtener ID del pago
    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

    // 🔹 Llamada a la API de Mercado Pago
    const mpResponse = await fetch(`https://api.mercadolibre.com/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
    });
    const payment = await mpResponse.json();

    console.log(`💰 Pago recibido | Estado: ${payment.status}`);

    // Solo procesar pagos aprobados
    if (payment.status !== "approved") {
      console.log(`⚠️ Pago no aprobado, se ignora`);
      return res.sendStatus(200);
    }

    // 🔹 Metadata para actualizar créditos
    const userId = payment.metadata?.userId;
    const creditsToAdd = Number(payment.metadata?.creditsToAdd) || 0;

    if (!userId || creditsToAdd <= 0) {
      console.error("❌ userId o creditsToAdd inválidos en metadata");
      return res.sendStatus(400);
    }

    // 🔹 Actualizar Firebase con transacción
    const userRef = db.collection("users").doc(userId);
    await db.runTransaction(async (t) => {
      const doc = await t.get(userRef);
      if (!doc.exists) throw new Error("Usuario no encontrado en Firestore");
      const currentCredits = doc.data().credits || 0;
      t.update(userRef, { credits: currentCredits + creditsToAdd });
    });

    console.log(`✅ Créditos actualizados para ${userId}: +${creditsToAdd}`);
    res.sendStatus(200);

  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

// ────────────── Servidor ──────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
