// ────────────────────────────────────────────────
// 🔹 webhook.js | Procesa notificaciones de Mercado Pago
// ────────────────────────────────────────────────
import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import fetch from "node-fetch"; // asegúrate de instalarlo: npm i node-fetch@2

const app = express();
app.use(bodyParser.json());

// 🔹 Inicializa Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert("./serviceAccountKey.json"),
  });
}
const db = admin.firestore();

// 🔹 Webhook de Mercado Pago
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    // Solo procesamos si es payment
    if (webhook.topic !== "payment" && webhook.type !== "payment") {
      console.log("⚠️ Notificación ignorada (no es pago)");
      return res.sendStatus(200);
    }

    // 🔹 Obtenemos el ID del pago
    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

    // 🔹 Llamada a la API de Mercado Pago para obtener el pago completo
    // Reemplaza `YOUR_ACCESS_TOKEN` por tu token real
    const mpResponse = await fetch(`https://api.mercadolibre.com/payments/${paymentId}`, {
      headers: { Authorization: `Bearer YOUR_ACCESS_TOKEN` },
    });
    const payment = await mpResponse.json();

    console.log(`💰 Pago recibido | Estado: ${payment.status}`);

    // 🔹 Obtenemos userId y creditsToAdd desde metadata
    const userId = payment.metadata?.userId || null;
    const creditsToAdd = Number(payment.metadata?.creditsToAdd) || 0;

    // 🔹 Creamos un documentPath seguro
    const docPath = userId ? userId : `payment_${payment.id}`;

    // 🔹 Guardamos pago en Firestore
    const paymentData = {
      id: payment.id,
      status: payment.status,
      userId: userId || null,
      creditsToAdd: creditsToAdd,
      amount: payment.transaction_amount || 0,
      date: payment.date_created,
    };

    await db.collection("payments").doc(docPath).set(paymentData);
    console.log(`✅ Pago guardado en Firestore: ${docPath}`);

    // 🔹 Solo actualizar créditos si el pago está aprobado y hay créditos
    if (payment.status === "approved" && userId && creditsToAdd > 0) {
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
    } else {
      console.log(`⚠️ Pago no aprobado o créditos no válidos, no se actualizan créditos`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

app.listen(3000, () => console.log("Webhook escuchando en puerto 3000"));

// ────────────────────────────────────────────────
// 🔹 Exportar app (no router, ahora usamos app directamente)
// ────────────────────────────────────────────────
export default app;
