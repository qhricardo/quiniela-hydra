// ────────────────────────────────────────────────
// server.js | Webhook + Mercado Pago v2 + Firebase
// ────────────────────────────────────────────────
import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import cors from "cors";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

// ──────────────── Configuración ────────────────
const app = express();
app.use(bodyParser.json());

// 🔹 Configurar CORS
app.use(cors({
  origin: "https://qhricardo.github.io",
  methods: ["GET", "POST", "OPTIONS"],
}));

// 🔹 Inicializar Firebase
if (!admin.apps.length) {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.error("❌ No se encontró la variable FIREBASE_SERVICE_ACCOUNT");
    process.exit(1);
  }
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}
const db = admin.firestore();
console.log("✅ Firebase inicializado correctamente");

// 🔹 Inicializar Mercado Pago v2
const mpClient = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
console.log("✅ Mercado Pago inicializado correctamente");

// ──────────────── Endpoint: Crear preferencia ────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;

    const preference = await new Preference(mpClient).create({
      body: {
        items: [
          { title: `Créditos Quiniela360 (${creditsToAdd} créditos)`, quantity: 1, currency_id: "MXN", unit_price: Number(amount) }
        ],
        payer: { name, email },
        external_reference: userId, // <--- identificador del usuario
        back_urls: {
          success: "https://qhricardo.github.io/quiniela-hydra/success.html",
          failure: "https://qhricardo.github.io/quiniela-hydra/index.html",
          pending: "https://qhricardo.github.io/quiniela-hydra/index.html",
        },
        auto_return: "approved",
      }
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

// ──────────────── Endpoint: Webhook de pagos ────────────────
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    const topic = webhook.topic || webhook.type || webhook.action;
    if (!topic || !topic.includes("payment")) {
      console.log("⚠️ Notificación ignorada (no es pago)");
      return res.sendStatus(200);
    }

    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

    // Consultar el pago en Mercado Pago
    const payment = await new Payment(mpClient).get({ id: paymentId });
    console.log(`💰 Pago recibido | Estado: ${payment.status}`);

    // 🔹 Obtener userId desde external_reference
    const userId = payment.external_reference;
    const creditsToAdd = 3; // número de créditos a sumar

    // Guardar siempre en Firestore
    await db.collection("payments").doc(`payment_${payment.id}`).set({
      id: payment.id,
      status: payment.status,
      userId: userId || null,
      creditsToAdd,
      amount: payment.transaction_amount || 0,
      date: payment.date_created || new Date().toISOString(),
    });

    // Solo procesar pagos aprobados
    if (payment.status === "approved" && userId) {
      const userRef = db.collection("users").doc(userId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        if (!doc.exists) throw new Error("Usuario no encontrado en Firestore");
        const currentCredits = doc.data().credits || 0;
        t.update(userRef, { credits: currentCredits + creditsToAdd });
      });
      console.log(`✅ Créditos actualizados para ${userId}: +${creditsToAdd}`);
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
