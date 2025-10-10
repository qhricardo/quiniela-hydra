// ────────────────────────────────────────────────
// 🔹 server.js | Mercado Pago + Firebase + Webhook
// ────────────────────────────────────────────────
import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import mercadopago from "mercadopago";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// 🔹 Inicializa Firebase Admin usando variable de entorno
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// 🔹 Inicializa Mercado Pago (SDK Node.js)
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});

// ─────────────── Crear preferencia ───────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { userId, creditsToAdd, amount } = req.body;

    if (!userId || !creditsToAdd || !amount) {
      return res.status(400).json({ error: "Faltan datos obligatorios" });
    }

    const preferenceData = {
      items: [
        {
          title: `Créditos Quiniela360`,
          quantity: 1,
          currency_id: "MXN",
          unit_price: amount,
        },
      ],
      metadata: {
        userId,
        creditsToAdd,
      },
      back_urls: {
        success: "https://qhricardo.github.io/quiniela-hydra/",
        failure: "https://qhricardo.github.io/quiniela-hydra/",
        pending: "https://qhricardo.github.io/quiniela-hydra/",
      },
      auto_return: "approved",
    };

    const preference = await mercadopago.preferences.create(preferenceData);

    console.log(`🧾 Preferencia creada para ${userId}: ${preference.body.id}`);
    res.json({ preferenceId: preference.body.id, init_point: preference.body.init_point });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "Error creando preferencia" });
  }
});

// ─────────────── Webhook de Mercado Pago ───────────────
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    // Solo procesar pagos
    if (
      webhook.topic !== "payment" &&
      webhook.type !== "payment" &&
      webhook.action !== "payment.created" &&
      webhook.action !== "payment.updated"
    ) {
      console.log("⚠️ Notificación ignorada (no es pago)");
      return res.sendStatus(200);
    }

    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

    // 🔹 Obtener pago completo desde la API
    const mpPaymentResp = await fetch(`https://api.mercadolibre.com/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });
    const payment = await mpPaymentResp.json();

    console.log(`💰 Pago recibido | Estado: ${payment.status}`);

    // 🔹 Preparar datos para Firestore
    const userId = payment.metadata?.userId || null;
    const creditsToAdd = Number(payment.metadata?.creditsToAdd) || 0;

    // 🔹 Generar docPath seguro
    const docPath = userId
      ? `payment_${payment.id}`
      : payment.id
      ? `payment_${payment.id}`
      : `payment_unknown_${Date.now()}`;

    const paymentData = {
      id: payment.id || null,
      status: payment.status || "unknown",
      userId: userId || null,
      creditsToAdd,
      amount: payment.transaction_amount || 0,
      date: payment.date_created || new Date().toISOString(),
    };

    await db.collection("payments").doc(docPath).set(paymentData);
    console.log(`✅ Pago guardado en Firestore: ${docPath}`);

    // 🔹 Solo actualizar créditos si está aprobado y hay metadata válida
    if (payment.status === "approved" && userId && creditsToAdd > 0) {
      const userRef = db.collection("users").doc(userId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        if (!doc.exists) throw new Error("Usuario no encontrado en Firestore");
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

export default app;
