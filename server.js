import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import mercadopago from "mercadopago";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// 🔹 Inicializa Firebase Admin
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();

// 🔹 Configura Mercado Pago
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});

// ─────────────────────────────────────────────
// 🔸 Crear preferencia de pago
// ─────────────────────────────────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;

    if (!userId || !creditsToAdd) {
      return res.status(400).json({ error: "Faltan datos obligatorios" });
    }

    const preference = await mercadopago.preferences.create({
      items: [
        {
          title: "Compra de créditos Quiniela360",
          quantity: 1,
          currency_id: "MXN",
          unit_price: amount,
        },
      ],
      payer: { name, email },
      metadata: { userId, creditsToAdd },
      back_urls: {
        success: "https://quiniela360.com/exito",
        failure: "https://quiniela360.com/error",
        pending: "https://quiniela360.com/pending",
      },
      auto_return: "approved",
    });

    console.log(`🧾 Preferencia creada para ${name || userId}: ${amount} MXN`);
    console.log("📦 Metadata enviada:", { userId, creditsToAdd });

    res.json({
      id: preference.body.id,
      init_point: preference.body.init_point,
    });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "Error creando preferencia de pago" });
  }
});

// ─────────────────────────────────────────────
// 🔸 Webhook de Mercado Pago
// ─────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook recibido:", JSON.stringify(req.body, null, 2));

    const { action, data, type } = req.body;
    if (type !== "payment" && !data?.id) {
      console.log("⚠️ Notificación ignorada (no es pago válido)");
      return res.sendStatus(200);
    }

    const paymentId = data.id || req.body.resource;
    const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
    });

    const payment = await response.json();
    const paymentStatus = payment.status;
    const metadata = payment.metadata || {};

    console.log("💰 Pago recibido | Estado:", paymentStatus);
    console.log("🔍 Metadata recibida:", metadata);

    // Solo procesar si fue aprobado
    if (paymentStatus === "approved" && metadata.userId) {
      const userId = metadata.userId;
      const creditsToAdd = Number(metadata.creditsToAdd) || 0;

      const userRef = db.collection("users").doc(userId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) {
        console.log(`⚠️ Usuario ${userId} no encontrado en Firestore`);
        return res.sendStatus(200);
      }

      const currentCredits = userDoc.data().credits || 0;
      const newCredits = currentCredits + creditsToAdd;

      await userRef.update({ credits: newCredits });

      console.log(`✅ Créditos actualizados: ${currentCredits} → ${newCredits} para usuario ${userId}`);
    } else {
      console.log("⚠️ No se actualizan créditos (estado no aprobado o falta metadata)");
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.status(500).json({ error: "Error procesando webhook" });
  }
});

// ─────────────────────────────────────────────
// 🔸 Servidor activo
// ─────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en puerto ${PORT}`);
});
