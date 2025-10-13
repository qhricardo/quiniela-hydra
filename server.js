// ────────────────────────────────────────────────
// server.js | Quiniela360 + Mercado Pago v2 + Firebase
// ────────────────────────────────────────────────
import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import cors from "cors";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

// ──────────────── Configuración base ────────────────
const app = express();
app.use(bodyParser.json());
app.use(cors({
  origin: "https://qhricardo.github.io",
  methods: ["GET", "POST", "OPTIONS"],
}));

// ──────────────── Inicializar Firebase ────────────────
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

// ──────────────── Inicializar Mercado Pago v2 ────────────────
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});
console.log("✅ Mercado Pago inicializado correctamente");

// ──────────────── Endpoint: Crear preferencia ────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;
    console.log("📤 Enviando a Mercado Pago:", req.body);

    const preference = await new Preference(mpClient).create({
      body: {
        items: [
          {
            title: `Créditos Quiniela360 (${creditsToAdd} créditos)`,
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
        notification_url: "https://quiniela-hydra.onrender.com/webhook",
        auto_return: "approved",
      },
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
      console.log("⚠️ Notificación ignorada (no es de pago)");
      return res.sendStatus(200);
    }

    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

    const payment = await new Payment(mpClient).get({ id: paymentId });
    console.log("🔍 Detalle del pago:", payment);

    // Intentar leer metadata desde payment.metadata o external_reference
    let metadata = {};
    try {
      if (payment.metadata?.userId) {
        metadata = payment.metadata;
      } else if (payment.external_reference) {
        metadata = JSON.parse(payment.external_reference);
      }
    } catch (e) {
      console.warn("⚠️ No se pudo leer metadata del pago:", e);
    }

    console.log(
      `💰 Pago recibido | Estado: ${payment.status} | Usuario: ${metadata.userId} | Créditos: ${metadata.creditsToAdd}`
    );

    // Guardar en Firestore
    await db.collection("payments").doc(`payment_${payment.id}`).set({
      id: payment.id,
      status: payment.status,
      userId: metadata.userId || null,
      creditsToAdd: Number(metadata.creditsToAdd) || 0,
      amount: payment.transaction_amount || 0,
      date: payment.date_created || new Date().toISOString(),
    });

    // Si el pago está aprobado, actualiza créditos
    if (
      payment.status === "approved" &&
      metadata.userId &&
      metadata.creditsToAdd > 0
    ) {
      const userRef = db.collection("users").doc(metadata.userId);
      await db.runTransaction(async (t) => {
        const doc = await t.get(userRef);
        if (!doc.exists) throw new Error("Usuario no encontrado en Firestore");
        const currentCredits = doc.data().credits || 0;
        t.update(userRef, {
          credits: currentCredits + Number(metadata.creditsToAdd),
        });
      });

      console.log(`✅ Créditos actualizados para ${metadata.userId}: +${metadata.creditsToAdd}`);
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
