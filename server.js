// ────────────────────────────────────────────────
// server.js | Webhook Mercado Pago + Firebase
// ────────────────────────────────────────────────
import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import fetch from "node-fetch"; // Asegúrate de tener node-fetch instalado

// ──────────────── Configuraciones ────────────────
const app = express();
app.use(bodyParser.json());

// 🔹 Inicializa Firebase con variable de entorno
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

// 🔹 Configuración de Mercado Pago
if (!process.env.MP_ACCESS_TOKEN) {
  console.error("❌ No se encontró la variable MP_ACCESS_TOKEN");
  process.exit(1);
}
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;

// ──────────────── Webhook ────────────────
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    // Procesar solo pagos (tipo payment)
    if (
      webhook.topic !== "payment" &&
      webhook.type !== "payment" &&
      webhook.action !== "payment.created" &&
      webhook.action !== "payment.updated"
    ) {
      console.log("⚠️ Notificación ignorada (no es pago)");
      return res.sendStatus(200);
    }

    // Obtener ID del pago
    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

    // Consultar pago completo en Mercado Pago
    const mpResponse = await fetch(
      `https://api.mercadolibre.com/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      }
    );
    const payment = await mpResponse.json();
    console.log(
      `💰 Pago recibido | Estado: ${payment.status} | Usuario: ${payment.metadata?.userId} | Credits: ${payment.metadata?.creditsToAdd}`
    );

    // Solo procesar pagos aprobados
    if (payment.status !== "approved") {
      console.log(`⚠️ Pago no aprobado, se ignora`);
      return res.sendStatus(200);
    }

    // Obtener userId y creditsToAdd desde metadata
    const userId = payment.metadata?.userId;
    const creditsToAdd = Number(payment.metadata?.creditsToAdd) || 0;

    if (!userId || creditsToAdd <= 0) {
      console.error("❌ userId o creditsToAdd inválidos en metadata");
      return res.sendStatus(400);
    }

    // Actualizar créditos en Firestore
    const userRef = db.collection("users").doc(userId);
    await db.runTransaction(async (t) => {
      const doc = await t.get(userRef);
      if (!doc.exists) {
        throw new Error("Usuario no encontrado en Firestore");
      }
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

// ──────────────── Iniciar servidor ────────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
