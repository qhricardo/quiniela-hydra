// ────────────────────────────────────────────────
// server.js | Webhook + Mercado Pago v2 + Firebase + CORS
// ────────────────────────────────────────────────
import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import cors from "cors";
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

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

// 🔹 Inicializa Mercado Pago v2
const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});
console.log("✅ Mercado Pago inicializado correctamente");


app.use(cors());
app.use(bodyParser.json());

// ──────────────── Endpoints ────────────────

// Crear preferencia
app.post("/create-preference", async (req, res) => {
  try {
    const { amount, userId, name, email, creditsToAdd } = req.body;
    console.log("📤 Enviando a Mercado Pago:", req.body);

    const preference = await new Preference(mpClient).create({
      body: {
        items: [{ title: `Créditos Quiniela360 (${creditsToAdd} créditos)`, quantity: 1, currency_id: "MXN", unit_price: Number(amount) }],
        payer: { name, email },
        metadata: { userId, creditsToAdd },
        back_urls: { success: "https://qhricardo.github.io/quiniela-hydra/success.html", failure: "https://qhricardo.github.io/quiniela-hydra/index.html", pending: "https://qhricardo.github.io/quiniela-hydra/index.html" },
        auto_return: "approved",
      },
    });

    return res.json({
      id: preference.id,
      init_point: preference.init_point,
      sandbox_init_point: preference.sandbox_init_point,
    });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "No se pudo generar la preferencia de pago" });
  }
});

// Webhook de pagos
app.post("/webhook", async (req, res) => {
  try {
    const webhook = req.body;
    console.log("📩 Webhook recibido:", webhook);

    const paymentId = webhook.data?.id || webhook.resource;
    if (!paymentId) {
      console.error("❌ No se encontró ID de pago");
      return res.sendStatus(400);
    }

  // Obtener el pago completo
    const { body: payment } = await new Payment(mpClient).get({ id: paymentId });
    console.log("🔹 Pago recibido:", payment);
    
    // Consulta el pago con SDK v2
    const payment = await new Payment(mpClient).get({ id: paymentId });
    console.log(
      `💰 Pago recibido | Estado: ${payment.status} | Usuario: ${payment.metadata?.userId} | Credits: ${payment.metadata?.creditsToAdd}`
    );

    // Solo procesar pagos aprobados
    if (payment.status !== "approved") {
      console.log("⚠️ Pago no aprobado, se ignora");
      return res.sendStatus(200);
    }

    const userId = payment.metadata?.userId;
    const creditsToAdd = Number(payment.metadata?.creditsToAdd) || 0;

    if (!userId || creditsToAdd <= 0) {
      console.error("❌ userId o creditsToAdd inválidos en metadata");
      return res.sendStatus(400);
    }

    // Actualizar créditos en Firestore
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

// ──────────────── Servidor ────────────────
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
