// ────────────────────────────────────────────────
// server.js | Webhook Mercado Pago + Firebase + CORS + Crear Preferencia
// ────────────────────────────────────────────────
import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import cors from "cors";
import mercadopago from "mercadopago";

// ──────────────── Configuraciones ────────────────
const app = express();
app.use(bodyParser.json());

// 🔹 Configurar CORS para tu frontend
app.use(cors({
  origin: "https://qhricardo.github.io",
  methods: ["GET", "POST", "OPTIONS"],
}));

// 🔹 Inicializa Firebase con variable de entorno
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

// 🔹 Configuración de Mercado Pago
if (!process.env.MP_ACCESS_TOKEN) {
  console.error("❌ No se encontró la variable MP_ACCESS_TOKEN");
  process.exit(1);
}

mercadopago.configurations.setAccessToken(process.env.MP_ACCESS_TOKEN);

// ──────────────── Endpoint: Crear preferencia ────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;

    if (!amount || !userId || !creditsToAdd) {
      return res.status(400).json({ error: "Datos incompletos" });
    }

    const preference = {
      items: [
        {
          title: "Créditos Quiniela360",
          quantity: 1,
          currency_id: "MXN",
          unit_price: amount,
        },
      ],
      metadata: {
        userId,
        creditsToAdd,
      },
      payer: {
        name,
        email,
      },
      back_urls: {
        success: "https://qhricardo.github.io/success.html",
        failure: "https://qhricardo.github.io/failure.html",
        pending: "https://qhricardo.github.io/pending.html",
      },
      auto_return: "approved",
    };

    const response = await mercadopago.preferences.create(preference);
    res.json(response);
  } catch (error) {
    console.error("🚨 Error al crear preferencia:", error);
    res.status(500).json({ error: "No se pudo crear la preferencia" });
  }
});

// ──────────────── Webhook ────────────────
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    if (
      webhook.topic !== "payment" &&
      webhook.type !== "payment" &&
      webhook.action !== "payment.created" &&
      webhook.action !== "payment.updated"
    ) {
      console.log("⚠️ Notificación ignorada (no es pago)");
      return res.sendStatus(200);
    }

    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

    // Consultar pago completo en Mercado Pago usando SDK
    const { body: payment } = await mercadopago.payment.findById(paymentId);

    console.log(
      `💰 Pago recibido | Estado: ${payment.status} | Usuario: ${payment.metadata?.userId} | Credits: ${payment.metadata?.creditsToAdd}`
    );

    if (payment.status !== "approved") {
      console.log(`⚠️ Pago no aprobado, se ignora`);
      return res.sendStatus(200);
    }

    const userId = payment.metadata?.userId;
    const creditsToAdd = Number(payment.metadata?.creditsToAdd) || 0;

    if (!userId || creditsToAdd <= 0) {
      console.error("❌ userId o creditsToAdd inválidos en metadata");
      return res.sendStatus(400);
    }

    const userRef = db.collection("users").doc(userId);
    await db.runTransaction(async (t) => {
      const doc = await t.get(userRef);
      if (!doc.exists) throw new Error("Usuario no encontrado en Firestore");
      const currentCredits = doc.data().credits || 0;
      t.update(userRef, { credits: currentCredits + creditsToAdd });
    });

    console.log(`✅ Créditos actualizados para ${userId}: +${creditsToAdd}`);
    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

// ──────────────── Iniciar servidor ────────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
