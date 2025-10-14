// ────────────────────────────────────────────────
// server.js | Webhook + Mercado Pago v2 + Firebase + CORS
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

    console.log(`🧾 Preferencia creada para ${name}: $${amount} MXN`);

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

    // 🧪 Webhook de prueba
    if (req.body.action === "payment.updated" && req.body.data?.id === "123456") {
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

    // 🔍 Consultar el pago real desde Mercado Pago
    const paymentData = (await new Payment(mpClient).get({ id: paymentId })).body;

    // 🔹 Solo procesar pagos con estado final
    if (!["approved", "pending", "rejected"].includes(paymentData.status)) {
      console.log(`ℹ️ Pago ${paymentData.id} con status ${paymentData.status} ignorado`);
      return res.sendStatus(200);
    }

    // 🔹 Leer external_reference de forma segura
    let userId = null;
    let creditsToAdd = 0;

    if (paymentData.external_reference) {
      try {
        const meta = JSON.parse(paymentData.external_reference);
        userId = meta.userId;
        creditsToAdd = Number(meta.creditsToAdd) || 0;
      } catch {
        userId = paymentData.external_reference;
        creditsToAdd = 0;
      }
    } else {
      console.log(`ℹ️ Pago ${paymentData.id} sin external_reference, no se actualizarán créditos todavía`);
    }

    console.log(`💰 Pago recibido | Estado: ${paymentData.status} | Usuario: ${userId} | Créditos: ${creditsToAdd}`);

    // 🔹 Guardar registro del pago en Firestore
    await db.collection("payments").doc(`payment_${paymentData.id}`).set({
      id: paymentData.id,
      status: paymentData.status,
      userId: userId || null,
      creditsToAdd,
      amount: paymentData.transaction_amount || 0,
      date: paymentData.date_created || new Date().toISOString(),
    });

    // 🔹 Incrementar creditos solo si está aprobado y hay datos
    if (paymentData.status === "approved" && userId && creditsToAdd > 0) {
      try {
        const userRef = db.collection("users").doc(userId);
        await userRef.set(
          {
            creditos: admin.firestore.FieldValue.increment(creditsToAdd),
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );

        console.log(`✅ Créditos incrementados correctamente para ${userId}: +${creditsToAdd}`);
      } catch (err) {
        console.error(`❌ Error actualizando creditos para ${userId}:`, err);
      }
    } else {
      console.log("ℹ️ No se actualizan creditos (pago no aprobado o datos faltantes)");
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
