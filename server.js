// server.js
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import admin from "firebase-admin";
import mercadopago from "@mercadopago/sdk-node"; // versión nueva SDK

import serviceAccount from "./serviceAccountKey.json" assert { type: "json" }; // asegúrate de subir este archivo a Render

const app = express();
const PORT = process.env.PORT || 10000;

// ─── Middleware ─────────────────────────────
app.use(bodyParser.json());

// Permitir solicitudes desde tu frontend
app.use(cors({
  origin: "https://qhricardo.github.io", // tu dominio frontend
  methods: ["GET", "POST", "OPTIONS"],
}));

// ─── Firebase Admin ────────────────────────
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();
console.log("✅ Firebase inicializado correctamente");

// ─── MercadoPago ──────────────────────────
mercadopago.configurations.setAccessToken(process.env.MP_ACCESS_TOKEN); // tu token de producción o sandbox

// ─── Rutas ────────────────────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;

    if (!amount || !userId) {
      return res.status(400).json({ error: "Faltan datos requeridos" });
    }

    // Ejemplo: crear preferencia
    const preference = await mercadopago.preferences.create({
      items: [
        {
          title: `Créditos ${creditsToAdd}`,
          quantity: 1,
          unit_price: amount,
        },
      ],
      payer: {
        name,
        email,
      },
      back_urls: {
        success: "https://qhricardo.github.io/success",
        failure: "https://qhricardo.github.io/failure",
        pending: "https://qhricardo.github.io/pending",
      },
      auto_return: "approved",
    });

    res.json(preference.body);
  } catch (error) {
    console.error("🚨 Error al crear preferencia:", error);
    res.status(500).json({ error: error.message });
  }
});

// ─── Webhook de pagos ─────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const event = req.body;

    console.log("📩 Webhook recibido:", event);

    if (event.type === "payment") {
      const paymentId = event.data.id;

      // Validar que el documento existe antes de usarlo
      if (!paymentId || typeof paymentId !== "string") {
        console.warn("⚠️ PaymentId inválido:", paymentId);
        return res.status(400).send("Invalid payment id");
      }

      const userRef = db.collection("users").doc(paymentId); // ejemplo, adapta según tu lógica
      await userRef.set({ status: "paid" }, { merge: true });

      console.log("💰 Pago registrado en Firestore:", paymentId);
    } else {
      console.log("⚠️ Notificación ignorada (no es pago):", event);
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.status(500).send(error.message);
  }
});

// ─── Iniciar servidor ─────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Servidor activo en puerto ${PORT}`);
});
