// ────────────────────────────────────────────────
// server.js | Quiniela360 - Mercado Pago v2 + Firebase
// Compatible con Node.js 22 y Render
// ────────────────────────────────────────────────

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import admin from "firebase-admin";
import mercadopagoPkg from "mercadopago";
import dotenv from "dotenv";

// Cargar variables de entorno (.env)
dotenv.config();

// ──────────────── Inicializar Firebase ────────────────
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
  console.log("✅ Firebase inicializado correctamente");
}

const db = admin.firestore();

// ──────────────── Inicializar Express ────────────────
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ──────────────── Inicializar Mercado Pago ────────────────
if (!process.env.MP_ACCESS_TOKEN) {
  console.error("❌ No se encontró MP_ACCESS_TOKEN en variables de entorno");
  process.exit(1);
}

const { MercadoPagoConfig, Preference, Payment } = mercadopagoPkg;

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});
console.log("✅ Mercado Pago inicializado correctamente");

// ──────────────── Endpoint: Crear preferencia ────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;
    console.log("📤 Recibida solicitud para crear preferencia:", req.body);

    const preference = new Preference(mpClient);
    const result = await preference.create({
      body: {
        items: [
          {
            title: `Créditos Quiniela360 (+${creditsToAdd})`,
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
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
    });
  } catch (error) {
    console.error("❌ Error al crear preferencia:", error);
    res.status(500).json({ error: "No se pudo generar la preferencia de pago" });
  }
});

// ──────────────── Webhook Mercado Pago ────────────────
app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook recibido:", req.body);

    // Solo procesar pagos aprobados
    if (req.body.type === "payment" && req.body.data?.id) {
      const payment = new Payment(mpClient);
      const paymentInfo = await payment.get({ id: req.body.data.id });

      const { status, metadata, external_reference } = paymentInfo;
      console.log(`💰 Pago recibido | Estado: ${status}`);

      if (status === "approved") {
        const refData = external_reference
          ? JSON.parse(external_reference)
          : metadata;

        const { userId, creditsToAdd } = refData || {};

        if (userId && creditsToAdd) {
          const userRef = db.collection("users").doc(userId);
          const userSnap = await userRef.get();

          if (userSnap.exists) {
            await userRef.update({
              credits: admin.firestore.FieldValue.increment(creditsToAdd),
            });
            console.log(
              `✅ Créditos incrementados correctamente para ${userId}: +${creditsToAdd}`
            );
          } else {
            console.log(`⚠️ No se encontró documento de usuario con uid=${userId}`);
          }
        } else {
          console.log("⚠️ No se encontró metadata válida en el pago.");
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error procesando webhook:", error);
    res.sendStatus(500);
  }
});

// ──────────────── Endpoint raíz ────────────────
app.get("/", (req, res) => {
  res.send("🚀 Quiniela360 backend funcionando correctamente");
});

// ──────────────── Iniciar servidor ────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Servidor escuchando en puerto ${PORT}`);
});
