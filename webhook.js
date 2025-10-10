// ────────────────────────────────────────────────
// 🔹 webhook.js | Procesa notificaciones de Mercado Pago
// ────────────────────────────────────────────────
import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import fetch from "node-fetch"; // Node 18+ ya tiene fetch, pero lo incluimos por compatibilidad
import MercadoPago from "@mercadopago/sdk-node";

const app = express();
app.use(bodyParser.json());

// 🔹 Inicializa Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert("./serviceAccountKey.json"), // Asegúrate que el JSON exista
  });
}
const db = admin.firestore();

// 🔹 Inicializa Mercado Pago
const mercadopago = new MercadoPago({
  accessToken: process.env.MP_ACCESS_TOKEN, // Pon tu token en variables de entorno
});

// ──────────────────────────
// POST /webhook
// ──────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    // ─ Ignorar topics que no sean payment
    const topic = webhook.topic || webhook.type || webhook.action;
    if (!topic || !topic.includes("payment")) {
      console.log("⚠️ Notificación ignorada (no es pago)");
      return res.sendStatus(200);
    }

    // ─ Obtener ID de pago
    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

    // ─ Obtener info del pago desde Mercado Pago
    const payment = await mercadopago.payment.get(paymentId).then(r => r.response);

    console.log(`💰 Pago recibido | Estado: ${payment.status}`);

    // ─ ID seguro para Firestore
    const docPath = payment.id ? `payment_${payment.id}` : `payment_unknown_${Date.now()}`;

    // ─ Guardar pago en Firestore (aunque sea rejected/pending)
    await db.collection("payments").doc(docPath).set({
      id: payment.id,
      status: payment.status,
      userId: payment.metadata?.userId || null,
      creditsToAdd: Number(payment.metadata?.creditsToAdd) || 0,
      amount: payment.transaction_amount || 0,
      date: payment.date_created || new Date().toISOString(),
    });

    // ─ Actualizar créditos solo si aprobado y metadata válida
    if (
      payment.status === "approved" &&
      payment.metadata?.userId &&
      payment.metadata?.creditsToAdd > 0
    ) {
      const userRef = db.collection("users").doc(payment.metadata.userId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        if (!doc.exists) throw new Error("Usuario no encontrado en Firestore");
        const currentCredits = doc.data().credits || 0;
        t.update(userRef, { credits: currentCredits + Number(payment.metadata.creditsToAdd) });
      });

      console.log(`✅ Créditos actualizados para ${payment.metadata.userId}: +${payment.metadata.creditsToAdd}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

// ──────────────────────────
// Servidor
// ──────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Webhook escuchando en puerto ${PORT}`));

export default app;
