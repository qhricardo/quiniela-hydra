// ────────────────────────────────────────────────
// server.js | Backend Quiniela360
// Mercado Pago SDK v3 + Firebase Admin + CORS
// ────────────────────────────────────────────────

import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import cors from "cors";
import { MercadoPago } from "mercadopago";

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

const mpClient = new MercadoPago(process.env.MP_ACCESS_TOKEN, { locale: "es-MX" });
console.log("✅ Mercado Pago inicializado correctamente");

// ──────────────── ENDPOINT: Crear preferencia ────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;
    console.log("📤 Enviando a Mercado Pago:", req.body);

    const preference = await mpClient.preferences.create({
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
    });

    console.log(`🧾 Preferencia creada para ${name}: $${amount} MXN`);

    res.json({
      id: preference.body.id,
      init_point: preference.body.init_point,
      sandbox_init_point: preference.body.sandbox_init_point,
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

    // 🔍 Consultar el pago real desde Mercado Pago
    const paymentResponse = await mpClient.payment.get(paymentId);
    const payment = paymentResponse.body;

    // 🔹 Leer datos del pago
    let userId, creditsToAdd;
    if (payment.external_reference) {
      try {
        const meta = JSON.parse(payment.external_reference);
        userId = meta.userId;
        creditsToAdd = Number(meta.creditsToAdd) || 0;
      } catch {
        userId = payment.external_reference;
        creditsToAdd = 0;
      }
    }

    console.log(`💰 Pago recibido | Estado: ${payment.status} | Usuario: ${userId} | Créditos: ${creditsToAdd}`);

    // 🔹 Guardar registro del pago en Firestore
    await db.collection("payments").doc(`payment_${payment.id}`).set({
      id: payment.id,
      status: payment.status,
      userId: userId || null,
      creditsToAdd,
      amount: payment.transaction_amount || 0,
      date: payment.date_created || new Date().toISOString(),
    });

    // 🔹 Actualizar créditos si el pago fue aprobado
    if (payment.status === "approved" && userId && creditsToAdd > 0) {
      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        console.warn(`⚠️ No se encontró documento de usuario con uid=${userId}`);
      } else {
        await userRef.set(
          {
            creditos: admin.firestore.FieldValue.increment(creditsToAdd),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        console.log(`✅ Créditos incrementados correctamente para ${userId}: +${creditsToAdd}`);
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

// ──────────────── SERVIDOR ────────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
