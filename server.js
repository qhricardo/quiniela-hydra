// ────────────────────────────────────────────────
// server.js | Webhook + Mercado Pago v2 + Firebase + CORS
// Compatible con npm mercadopago oficial
// ────────────────────────────────────────────────

import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import cors from "cors";
import mercadopago from "mercadopago";

// ──────────────── CONFIGURACIONES BASE ────────────────
const app = express();
app.use(bodyParser.json());

// 🔹 Configurar CORS para tu frontend
app.use(cors({
  origin: "https://qhricardo.github.io",
  methods: ["GET", "POST", "OPTIONS"],
}));

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

// 🔹 Inicializa Mercado Pago correctamente (no usar new)
mercadopago.configurations.setAccessToken(process.env.MP_ACCESS_TOKEN);
console.log("✅ Mercado Pago inicializado correctamente");

// ──────────────── ENDPOINT: Crear preferencia ────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;

    const preference = {
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
    };

    const response = await mercadopago.preferences.create(preference);

    console.log(`🧾 Preferencia creada para ${name}: $${amount} MXN`);

    res.json({
      id: response.body.id,
      init_point: response.body.init_point,
      sandbox_init_point: response.body.sandbox_init_point,
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

    // 🔍 Consultar pago real
    const payment = await mercadopago.payment.get(paymentId);
    const paymentData = payment.body;

    let userId = null;
    let creditsToAdd = 0;

    try {
      if (paymentData.external_reference) {
        const meta = JSON.parse(paymentData.external_reference);
        userId = meta.userId || null;
        creditsToAdd = Number(meta.creditsToAdd) || 0;
      }
    } catch (err) {
      console.warn("⚠️ external_reference malformado:", paymentData.external_reference);
    }

    if (!userId && paymentData.metadata?.userId) {
      userId = paymentData.metadata.userId;
      creditsToAdd = Number(paymentData.metadata.creditsToAdd) || 0;
    }

    console.log(`💰 Pago recibido | Estado: ${paymentData.status} | Usuario: ${userId} | Créditos: ${creditsToAdd}`);

    // ────────────── Evitar duplicados ──────────────
    const paymentRef = db.collection("payments").doc(`payment_${paymentData.id}`);
    const paymentDoc = await paymentRef.get();
    if (paymentDoc.exists) {
      console.log("⚠️ Pago ya procesado:", paymentData.id);
      return res.sendStatus(200);
    }

    // ────────────── Guardar historial ──────────────
    await paymentRef.set({
      id: paymentData.id,
      status: paymentData.status,
      userId: userId || null,
      creditsToAdd,
      amount: paymentData.transaction_amount || 0,
      date: paymentData.date_created || new Date().toISOString(),
    });

    // ────────────── Actualizar créditos si aprobado ──────────────
    if (paymentData.status === "approved" && userId && creditsToAdd > 0) {
      const userRef = db.collection("users").doc(userId);

      await userRef.set(
        {
          credits: admin.firestore.FieldValue.increment(creditsToAdd),
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      console.log(`✅ Créditos incrementados correctamente para ${userId}: +${creditsToAdd}`);
    } else {
      console.log("ℹ️ No se actualizan créditos (pago no aprobado o datos faltantes)");
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error general en webhook:", error);
    res.sendStatus(500);
  }
});

// ──────────────── SERVIDOR ────────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
