// ────────────────────────────────
// webhook.js | Mercado Pago v2 + Firebase
// ────────────────────────────────
import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import { MercadoPagoConfig, Payment } from "mercadopago";

const app = express();
app.use(bodyParser.json());

// ───────────── Inicializa Firebase ─────────────
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
console.log("✅ Firebase inicializado");

// ───────────── Inicializa Mercado Pago ─────────────
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});
console.log("✅ Mercado Pago inicializado");

// ──────────────── Endpoint: Webhook de pagos ────────────────
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    // Solo continuar si es un evento de pago
    const topic = webhook.topic || webhook.type || webhook.action;
    if (!topic || !topic.includes("payment")) {
      console.log("⚠️ Notificación ignorada (no es de pago)");
      return res.sendStatus(200);
    }

    // Obtener ID del pago
    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

    // Obtener info del pago desde Mercado Pago
    const payment = await new Payment(mpClient).get({ id: paymentId });

    // Leer metadata desde external_reference
    let userId, creditsToAdd;
    if (payment.external_reference) {
      try {
        const metadata = JSON.parse(payment.external_reference);
        userId = metadata.userId;
        creditsToAdd = Number(metadata.creditsToAdd) || 0;
      } catch {
        userId = payment.external_reference; // si solo pusiste el userId
        creditsToAdd = 0;
      }
    }

    console.log(
      `💰 Pago recibido | Estado: ${payment.status} | Usuario: ${userId} | Créditos: ${creditsToAdd}`
    );

    // Guardar siempre en Firestore
    await db.collection("payments").doc(`payment_${payment.id}`).set({
      id: payment.id,
      status: payment.status,
      userId: userId || null,
      creditsToAdd: creditsToAdd,
      amount: payment.transaction_amount || 0,
      date: payment.date_created || new Date().toISOString(),
    });

    // Solo procesar pagos aprobados
    if (payment.status === "approved" && userId && creditsToAdd > 0) {
      const userRef = db.collection("users").doc(userId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        if (!doc.exists) throw new Error("Usuario no encontrado en Firestore");
        const currentCredits = doc.data().credits || 0;
        t.update(userRef, { credits: currentCredits + creditsToAdd });
      });

      console.log(`✅ Créditos actualizados para ${userId}: +${creditsToAdd}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

// ───────────── Servidor ─────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Webhook escuchando en puerto ${PORT}`));

export default app;
