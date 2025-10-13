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

// ───────────── Endpoint Webhook ─────────────
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    // Validar que sea un evento de pago
    const topic = webhook.topic || webhook.type || webhook.action;
    if (!topic || !topic.includes("payment")) {
      console.log("⚠️ Notificación ignorada (no es pago)");
      return res.sendStatus(200);
    }

    // Obtener ID de pago seguro
    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

    // Consultar pago en Mercado Pago
    let payment;
    try {
      payment = await new Payment(mpClient).get({ id: paymentId });
    } catch (err) {
      console.error("❌ Error consultando pago en Mercado Pago:", err);
      return res.sendStatus(500);
    }

    const userId = payment.metadata?.userId || null;
    const creditsToAdd = Number(payment.metadata?.creditsToAdd) || 0;

    console.log(
      `💰 Pago recibido | Estado: ${payment.status} | Usuario: ${userId || "no disponible"} | Créditos: ${creditsToAdd}`
    );

    // Guardar todos los pagos en Firestore
    await db.collection("payments").doc(`payment_${payment.id}`).set({
      id: payment.id,
      status: payment.status,
      userId: userId,
      creditsToAdd: creditsToAdd,
      amount: payment.transaction_amount || 0,
      date: payment.date_created || new Date().toISOString(),
    });

    // Actualizar créditos solo si es aprobado y metadata válida
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
