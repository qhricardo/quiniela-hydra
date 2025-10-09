// ────────────────────────────────────────────────
// 🔹 Quiniela360 | Backend MercadoPago + Firebase
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
// 🔹 Inicializar Firebase Admin
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
// 🔹 Inicializar MercadoPago
// ────────────────────────────────
if (!process.env.MP_ACCESS_TOKEN) {
  console.warn("⚠️ MP_ACCESS_TOKEN no configurado");
}

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || "",
});

// ────────────────────────────────
// 🔹 Endpoint: crear preferencia de pago
// ────────────────────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { userId, amount, name, email, creditsToAdd } = req.body;

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
        metadata: { userId, name, email, creditsToAdd },
        payer: { name: name || "Usuario", email: email || "" },
        back_urls: {
          success: "https://quiniela360.com/success.html",
          failure: "https://quiniela360.com/failure.html",
          pending: "https://quiniela360.com/pending.html",
        },
        auto_return: "approved",
        notification_url: "https://quiniela-hydra.onrender.com/webhook",
      },
    });

    // 🔹 Guardar preferencia en Firestore
    if (db) {
      await db.collection("preferences").doc(preference.id).set({ userId, creditsToAdd });
    }

    console.log(`🧾 Preferencia creada para ${name || userId}: ${amount} MXN`);
    res.json({ id: preference.id, init_point: preference.init_point });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "Error creando preferencia de pago" });
  }
});

// ────────────────────────────────
// 🔹 Endpoint: webhook MercadoPago
// ────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Webhook recibido:", JSON.stringify(data, null, 2));

    // ✅ Detectar tanto 'type' como 'topic'
    const isPayment =
      (data.type && data.type === "payment") ||
      (data.topic && data.topic === "payment");

    if (!isPayment) {
      console.warn("⚠️ Notificación ignorada (no es pago):", data);
      return res.sendStatus(200);
    }

    // ✅ Obtener ID del pago (distintos formatos)
    const paymentId = data.data?.id || data.resource;
    if (!paymentId) {
      console.warn("⚠️ Notificación sin paymentId:", data);
      return res.sendStatus(200);
    }

    console.log(`🔍 Consultando pago #${paymentId}`);

    // ✅ Obtener detalles del pago desde MercadoPago
    const paymentInstance = new Payment(mpClient);
    const payment = await paymentInstance.get({ id: paymentId });

    const estado = payment.status;
    const metadata = payment.metadata || {};
    const { userId: metaUserId, creditsToAdd } = metadata;

    let userId = metaUserId;

    // ✅ Intentar recuperar el userId desde Firestore si no viene en metadata
    if (!userId && db && payment.preference_id) {
      const prefRef = db.collection("preferences").doc(payment.preference_id);
      const prefSnap = await prefRef.get();
      if (prefSnap.exists) {
        userId = prefSnap.data().userId;
      }
    }

    console.log(
      `💰 Pago recibido | Estado: ${estado} | Usuario: ${userId} | Credits: ${creditsToAdd}`
    );

    // ✅ Solo procesar pagos aprobados
    if (estado === "approved" && userId && db) {
      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();

      if (userSnap.exists) {
        const currentCredits = userSnap.data().creditos || 0;
        const newCredits = currentCredits + (parseInt(creditsToAdd) || 0);
        await userRef.update({ creditos: newCredits });

        console.log(
          `✅ Créditos actualizados en Firestore: ${currentCredits} ➜ ${newCredits}`
        );
      } else {
        console.warn(`⚠️ Usuario no encontrado en Firestore: ${userId}`);
      }
    } else if (estado !== "approved") {
      console.warn(`⚠️ Pago con estado '${estado}' — no se acreditan créditos`);
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
  res.send("✅ Servidor Quiniela360 activo con MercadoPago + Firebase");
});

// ────────────────────────────────
// 🔹 Iniciar servidor
// ────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
