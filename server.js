import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import mercadopago from "mercadopago";

const app = express();
app.use(bodyParser.json());

// Inicializa Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert("./serviceAccountKey.json"),
});
const db = admin.firestore();

// Configura tu access token de Mercado Pago
mercadopago.configurations.setAccessToken(process.env.MP_ACCESS_TOKEN);

app.post("/webhook", async (req, res) => {
  try {
    const topic = req.body.topic || req.body.type;
    let paymentId = null;

    if (topic === "payment") {
      paymentId = req.body.data?.id || req.body.resource;
    } else if (topic === "merchant_order") {
      console.log("⚠️ Notificación ignorada (no es pago)", req.body);
      return res.sendStatus(200);
    } else {
      console.log("⚠️ Notificación desconocida", req.body);
      return res.sendStatus(200);
    }

    if (!paymentId) {
      console.error("❌ No se encontró paymentId en el webhook");
      return res.sendStatus(400);
    }

    // 🔹 Obtener info del pago
    const paymentResponse = await mercadopago.payment.findById(paymentId);
    const payment = paymentResponse.response;

    if (payment.status !== "approved") {
      console.log(`💰 Pago recibido | Estado: ${payment.status} | Ignorado`);
      return res.sendStatus(200);
    }

    // 🔹 Obtener metadata de la preferencia
    let userId = payment.metadata?.userId;
    let creditsToAdd = payment.metadata?.creditsToAdd;

    // 🔹 Si no está en metadata, buscar en la colección preferences
    if (!userId && payment.preference_id) {
      const prefDoc = await db.collection("preferences").doc(payment.preference_id).get();
      if (prefDoc.exists) {
        const data = prefDoc.data();
        userId = data.userId;
        creditsToAdd = data.creditsToAdd;
      }
    }

    if (!userId) {
      console.error("❌ userId no encontrado, no se puede actualizar créditos");
      return res.sendStatus(400);
    }

    // 🔹 Actualizar créditos en users
    const userRef = db.collection("users").doc(userId);
    await db.runTransaction(async (t) => {
      const userDoc = await t.get(userRef);
      const currentCredits = userDoc.exists ? userDoc.data().credits || 0 : 0;
      t.set(userRef, { credits: currentCredits + creditsToAdd }, { merge: true });
    });

    console.log(`✅ Créditos actualizados para usuario ${userId}: +${creditsToAdd}`);
    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    return res.sendStatus(500);
  }
});

app.listen(3000, () => console.log("Webhook corriendo en puerto 3000"));
