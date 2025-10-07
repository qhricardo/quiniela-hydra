import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { MercadoPagoConfig, Preference } from "mercadopago";

dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ────────────────────────────────
// 🔹 Inicializa Firebase Admin
// ────────────────────────────────
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ────────────────────────────────
// 🔹 Configura Mercado Pago
// ────────────────────────────────
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN, // 🔸 Usa tu token de producción o test
});

// ────────────────────────────────
// 🔹 Crear preferencia de pago
// ────────────────────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { userId, amount } = req.body;

    if (!userId || !amount) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    const preference = new Preference(client);
    const result = await preference.create({
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
        back_urls: {
          success: "https://quiniela360.com/success.html",
          failure: "https://quiniela360.com/failure.html",
          pending: "https://quiniela360.com/pending.html",
        },
        auto_return: "approved",
        notification_url: "https://quiniela-hydra.onrender.com/webhook", // 🔹 Webhook
      },
    });

    res.json({ id: result.id });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "Error al crear preferencia" });
  }
});

// ────────────────────────────────
// 🔹 Webhook de Mercado Pago
// ────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const payment = req.body;
    console.log("📩 Webhook recibido:", payment);

    if (payment.type === "payment" || payment.action === "payment.created") {
      const paymentId = payment.data.id;

      // 🔹 Obtiene el pago completo desde Mercado Pago
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        },
      });
      const paymentData = await response.json();

      if (paymentData.status === "approved") {
        const userId = paymentData.metadata?.userId;
        const amount = paymentData.transaction_amount;

        if (userId) {
          const userRef = db.collection("users").doc(userId);
          const userSnap = await userRef.get();

          if (userSnap.exists) {
            const currentCredits = userSnap.data().creditos || 0;
            await userRef.update({
              creditos: currentCredits + amount,
            });
            console.log(`✅ Créditos actualizados para ${userId}: +${amount}`);
          } else {
            console.log(`⚠️ Usuario no encontrado: ${userId}`);
          }
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
// 🔹 Servidor
// ────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
