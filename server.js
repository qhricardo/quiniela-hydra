// ────────────────────────────────────────────────
// server.js | Webhook + Mercado Pago v2 + Firebase + CORS
// ────────────────────────────────────────────────

import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import cors from "cors";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

// ──────────────── Configuraciones base ────────────────
const app = express();
app.use(bodyParser.json());

// 🔹 CORS: permitir tu frontend
app.use(cors({
  origin: "https://qhricardo.github.io", // frontend en GitHub Pages
  methods: ["GET", "POST", "OPTIONS"],
}));

// ──────────────── Firebase ────────────────
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

// ──────────────── Mercado Pago ────────────────
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});
console.log("✅ Mercado Pago inicializado correctamente");

// ──────────────── ENDPOINT: Crear preferencia ────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;
    console.log("📤 Creando preferencia:", req.body);

    const preference = await new Preference(mpClient).create({
      body: {
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
      },
    });

    res.json({
      id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
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

    // 🧪 Manejo especial para pruebas de Mercado Pago
    if (req.body.action === "payment.updated" && req.body.data.id === "123456") {
      console.log("🧪 Webhook de prueba recibido correctamente");
      return res.sendStatus(200);
    }

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

    // 🔍 Consultar pago real en Mercado Pago
    const payment = await new Payment(mpClient).get({ id: paymentId });

    // 🔹 Leer external_reference
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

    // 🔹 Guardar el pago en Firestore
    await db.collection("payments").doc(`payment_${payment.id}`).set({
      id: payment.id,
      status: payment.status,
      userId: userId || null,
      creditsToAdd,
      amount: payment.transaction_amount || 0,
      date: payment.date_created || new Date().toISOString(),
    });

    // 🔹 Si está aprobado, actualiza o crea créditos
    if (payment.status === "approved" && userId && creditsToAdd > 0) {
      const userRef = db.collection("users").doc(userId);

      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        const currentCredits = doc.exists ? (doc.data().creditos || 0) : 0;
        const newCredits = currentCredits + creditsToAdd;
        t.set(userRef, { creditos: newCredits }, { merge: true });
      });

      console.log(`✅ Créditos actualizados (o creados) para ${userId}: +${creditsToAdd}`);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

// ──────────────── Servidor ────────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
