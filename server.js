// ────────────────────────────────────────────────
// server.js | Webhook + Mercado Pago v2 + Firebase + CORS + Retry
// Optimizado para Quiniela360
// ────────────────────────────────────────────────

import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import cors from "cors";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

// ──────────────── CONFIGURACIONES BASE ────────────────
const app = express();
app.use(bodyParser.json());

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
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});
console.log("✅ Mercado Pago inicializado correctamente");

// ──────────────── Función de retry genérica ────────────────
async function retry(fn, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      console.warn(`⚠️ Intento ${i + 1} fallido:`, err);
      if (i < retries - 1) await new Promise(res => setTimeout(res, delay));
      else throw err;
    }
  }
}

// ──────────────── ENDPOINT: Crear preferencia ────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;
    console.log("📤 Creando preferencia:", req.body);

    const preference = await new Preference(mpClient).create({
      body: {
        items: [
          { title: `Créditos Quiniela360 (${creditsToAdd})`, quantity: 1, currency_id: "MXN", unit_price: Number(amount) },
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

    console.log(`🧾 Preferencia creada para ${name}: $${amount} MXN`);
    res.json({ id: preference.id, init_point: preference.init_point, sandbox_init_point: preference.sandbox_init_point });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "No se pudo generar la preferencia de pago" });
  }
});

// ──────────────── ENDPOINT: Webhook con retry ────────────────
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    const topic = webhook.topic || webhook.type || webhook.action;
    if (!topic || !topic.includes("payment")) return res.sendStatus(200);

    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) return res.sendStatus(400);

    const payment = await retry(() => new Payment(mpClient).get({ id: paymentId }), 3, 1000);

    let userId = null, creditsToAdd = 0;
    try {
      if (payment.external_reference) {
        const meta = JSON.parse(payment.external_reference);
        userId = meta.userId;
        creditsToAdd = Number(meta.creditsToAdd) || 0;
      }
    } catch { userId = null; creditsToAdd = 0; }

    console.log(`💰 Pago recibido | Estado: ${payment.status} | Usuario: ${userId} | Créditos: ${creditsToAdd}`);

    await retry(() => db.collection("payments").doc(`payment_${payment.id}`).set({
      id: payment.id,
      status: payment.status,
      userId: userId || null,
      creditsToAdd,
      amount: payment.transaction_amount || 0,
      date: payment.date_created || new Date().toISOString(),
    }), 3, 500);

    if (payment.status === "approved" && userId && creditsToAdd > 0) {
      const userRef = db.collection("users").doc(userId);

      // Crear documento si no existe
      const userDoc = await retry(() => userRef.get(), 3, 500);
      if (!userDoc.exists) {
        console.log(`⚠️ Documento no existe, creando usuario ${userId}`);
        await retry(() => userRef.set({ creditos: 0, createdAt: new Date().toISOString() }, { merge: true }), 3, 500);
      }

      // Incrementar créditos con retry
      await retry(() => userRef.set({
        creditos: admin.firestore.FieldValue.increment(creditsToAdd),
        updatedAt: new Date().toISOString(),
      }, { merge: true }), 3, 500);

      console.log(`✅ Créditos incrementados correctamente para ${userId}: +${creditsToAdd}`);
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
