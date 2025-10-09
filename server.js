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

    // Validaciones básicas
    if (!userId || !amount || !email) {
      return res.status(400).json({ error: "Faltan datos obligatorios: userId, amount o email" });
    }

    // Validar monto mínimo
    const price = parseFloat(amount);
    if (isNaN(price) || price < 1) {
      return res.status(400).json({ error: "El monto debe ser un número mayor a 0" });
    }

    const preferenceInstance = new Preference(mpClient);

    const preference = await preferenceInstance.create({
      body: {
        items: [
          {
            title: "Créditos Quiniela360",
            quantity: 1,
            currency_id: "MXN",
            unit_price: price,
          },
        ],
        metadata: {
          userId,
          name,
          email,
          creditsToAdd,
        },
        payer: {
          name: name || "Usuario",
          email: email || "usuario@prueba.com", // Email obligatorio para Mercado Pago
        },
        back_urls: {
          success: "https://qhricardo.github.io/quiniela-hydra/index.html",
          failure: "https://qhricardo.github.io/quiniela-hydra/index.html",
          pending: "https://qhricardo.github.io/quiniela-hydra/index.html",
        },
        auto_return: "approved",
        notification_url: "https://quiniela-hydra.onrender.com/webhook",
      },
    });

    // Guardar referencia preference ↔ usuario en Firestore
    if (db) {
      await db.collection("preferences").doc(preference.id).set({
        userId,
        creditsToAdd,
        amount: price,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    console.log(`🧾 Preferencia creada para ${name} (${email}): ${price} MXN`);
    res.json({ id: preference.id, init_point: preference.init_point });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error.response || error);
    res.status(500).json({ error: "Error creando preferencia de pago" });
  }
});

// ────────────────────────────────────────────────
// 🔹 Endpoint: webhook MercadoPago
// ────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Webhook recibido:", JSON.stringify(data, null, 2));

    // Validar que sea notificación de pago
    if (data.type !== "payment" || !data.data?.id) {
      console.warn("⚠️ Notificación no válida:", data);
      return res.sendStatus(400);
    }

    const paymentInstance = new Payment(mpClient);
    const payment = await paymentInstance.get({ id: data.data.id });

    const estado = payment.status;
    const metadata = payment.metadata || {};
    const { userId: metaUserId, creditsToAdd } = metadata;

    // 🔹 Obtener userId desde metadata o Firestore
    let userId = metaUserId;
    if (!userId && db && payment.preference_id) {
      const prefRef = db.collection("preferences").doc(payment.preference_id);
      const prefSnap = await prefRef.get();
      if (prefSnap.exists) {
        userId = prefSnap.data().userId;
      }
    }

    console.log(`💰 Pago recibido | Estado: ${estado} | Usuario: ${userId} | Credits to add: ${creditsToAdd}`);

    if (estado === "approved" && userId && db) {
      const userRef = db.collection("users").doc(userId);
      const userSnap = await userRef.get();

      if (userSnap.exists) {
        const currentCredits = userSnap.data().creditos || 0;
        const newCredits = currentCredits + (parseInt(creditsToAdd) || 0);

        await userRef.update({ creditos: newCredits });
        console.log(`✅ Créditos actualizados: ${currentCredits} ➜ ${newCredits}`);
      } else {
        console.warn(`⚠️ Usuario no encontrado: ${userId}`);
      }
    } else if (!userId) {
      console.warn("⚠️ No se encontró userId para actualizar créditos");
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
