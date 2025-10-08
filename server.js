// ────────────────────────────────────────────────
// 🔹 Quiniela360 | Backend Producción MercadoPago + Firebase
// ────────────────────────────────────────────────

import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ────────────────────────────────
// 🔹 Inicializar Firebase
// ────────────────────────────────
let db;
try {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT no configurada");
  }

  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  db = admin.firestore();
  console.log("✅ Firebase inicializado correctamente");
} catch (error) {
  console.error("❌ Error inicializando Firebase:", error.message);
}

// ────────────────────────────────
// 🔹 Inicializar MercadoPago PRODUCCIÓN
// ────────────────────────────────
if (!process.env.MP_ACCESS_TOKEN) {
  console.warn("⚠️ MP_ACCESS_TOKEN no configurado");
}

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

// ────────────────────────────────
// 🔹 Crear preferencia de pago REAL
// ────────────────────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { userId, amount, name } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: "Faltan datos: userId o amount" });
    }

    const preferenceInstance = new Preference(mpClient);
    const preference = await preferenceInstance.create({
      body: {
        items: [
          {
            title: "Créditos Quiniela360",
            quantity: 1,
            currency_id: "MXN",
            unit_price: parseFloat(amount),
          },
        ],
        metadata: { userId },
        payer: { name: name || "Usuario" },
        back_urls: {
          success: "https://quiniela360.com/success.html",
          failure: "https://quiniela360.com/failure.html",
          pending: "https://quiniela360.com/pending.html",
        },
        auto_return: "approved",
        notification_url: "https://quiniela-hydra.onrender.com/webhook",
      },
    });

    console.log(`🧾 Preferencia creada para ${name || userId}: ${amount} MXN`);
    res.json({ id: preference.id, init_point: preference.init_point }); // <-- Pago real
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "Error creando preferencia de pago" });
  }
});

// ────────────────────────────────
// 🔹 Webhook PRODUCCIÓN
// ────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Webhook recibido:", JSON.stringify(data, null, 2));

    if (data.type === "payment" && data.data?.id) {
      const paymentInstance = new Payment(mpClient);
      const payment = await paymentInstance.get({ id: data.data.id });

      const estado = payment.status;
      const monto = payment.transaction_amount;
      const userId = payment.metadata?.userId;

      console.log(`💰 Pago recibido | Estado: ${estado} | Monto: ${monto} | Usuario: ${userId}`);

      if (estado === "approved" && userId && db) {
        const userRef = db.collection("users").doc(userId);
        const userSnap = await userRef.get();

        if (userSnap.exists) {
          const currentCredits = userSnap.data().creditos || 0;
          const newCredits = currentCredits + monto;

          await userRef.update({ creditos: newCredits });
          console.log(`✅ Créditos actualizados: ${currentCredits} ➜ ${newCredits}`);
        } else {
          console.warn(`⚠️ Usuario no encontrado: ${userId}`);
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

// ────────────────────────────────
// 🔹 Ruta de prueba
// ────────────────────────────────
app.get("/", (req, res) => {
  res.send("✅ Quiniela360 | Backend en modo PRODUCCIÓN con MercadoPago");
});

// ────────────────────────────────
// 🔹 Iniciar servidor
// ────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
