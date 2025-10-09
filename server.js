import express from "express";
import cors from "cors";
import mercadopago from "mercadopago";
import admin from "firebase-admin";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// 🔹 Inicializa Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
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
// 📦 Crear preferencia
// ─────────────────────────────────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { userId, name, email, amount, creditsToAdd } = req.body;
    console.log(`🧾 Preferencia creada para ${name}: ${amount} MXN`);

    const preference = {
      items: [{
        title: `Compra de ${creditsToAdd} créditos`,
        quantity: 1,
        currency_id: "MXN",
        unit_price: amount
      }],
      back_urls: {
        success: "https://qhricardo.github.io/quiniela-hydra/index.html",
        failure: "https://qhricardo.github.io/quiniela-hydra/index.html",
        pending: "https://qhricardo.github.io/quiniela-hydra/index.html"
      },
      auto_return: "approved",
      metadata: { userId, creditsToAdd },
      notification_url: "https://quiniela-hydra.onrender.com/webhook"
    };

    const result = await mercadopago.preferences.create(preference);
    res.json({ init_point: result.body.init_point });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "Error al crear preferencia" });
  }
});

// ─────────────────────────────────────────────
// 🧩 Webhook Mercado Pago
// ─────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook recibido:", JSON.stringify(req.body, null, 2));
    const { type, data } = req.body;

    if (type !== "payment") {
      console.warn("⚠️ Notificación ignorada (no es pago):", req.body);
      return res.sendStatus(200);
    }

    const paymentId = data.id;
    const payment = await mercadopago.payment.findById(paymentId);
    const status = payment.body.status;
    const metadata = payment.body.metadata || {};
    const userId = metadata.userId;
    const creditsToAdd = metadata.creditsToAdd;

    console.log(`💰 Pago recibido | Estado: ${status} | Usuario: ${userId} | Credits to add: ${creditsToAdd}`);

    if (status === "approved" && userId && creditsToAdd) {
      const userRef = db.collection("usuarios").doc(userId);
      await userRef.update({
        creditos: admin.firestore.FieldValue.increment(creditsToAdd)
      });
      console.log(`✅ Créditos actualizados para ${userId}: +${creditsToAdd}`);
    } else {
      console.warn("⚠️ Pago no aprobado o sin metadata");
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

// 🔹 Puerto dinámico (Render usa PORT)
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`));
