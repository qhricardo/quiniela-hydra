// ────────────────────────────────────────────────
// 🔹 Quiniela360 | Backend MercadoPago + Firebase
// ────────────────────────────────────────────────
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import mercadopago from "mercadopago";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// ────────────────────────────────
// 🔹 Inicializar Firebase
// ────────────────────────────────
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}
const db = admin.firestore();
console.log("✅ Firebase inicializado correctamente");

// ────────────────────────────────
// 🔹 Configurar Mercado Pago
// ────────────────────────────────
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN,
});
console.log("✅ Mercado Pago configurado");

// ────────────────────────────────
// 🔹 Crear preferencia
// ────────────────────────────────
app.post("/create-preference", async (req, res) => {
  try {
    const { userId, name, email, amount, creditsToAdd } = req.body;
    if (!userId || !amount) return res.status(400).json({ error: "Faltan datos" });

    const preference = {
      items: [
        {
          title: `Créditos Quiniela360`,
          quantity: 1,
          currency_id: "MXN",
          unit_price: parseFloat(amount),
        },
      ],
      metadata: { userId, creditsToAdd },
      payer: { name: name || "Usuario", email: email || "" },
      back_urls: {
        success: "https://quiniela360.com/webhook.html",
        failure: "https://quiniela360.com/webhook.html",
        pending: "https://quiniela360.com/webhook.html",
      },
      auto_return: "approved",
      notification_url: "https://quiniela-hydra.onrender.com/webhook",
    };

    const result = await mercadopago.preferences.create(preference);

    // Guardar preferencia ↔ usuario
    await db.collection("preferences").doc(result.body.id).set({
      userId,
      creditsToAdd,
      createdAt: new Date(),
    });

    console.log(`🧾 Preferencia creada para ${name}: ${amount} MXN`);
    res.json({ init_point: result.body.init_point });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "Error al crear preferencia" });
  }
});

// ────────────────────────────────
// 🔹 Webhook MercadoPago
// ────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook recibido:", JSON.stringify(req.body, null, 2));

    const { type, data, resource, topic } = req.body;

    // Ignorar merchant_order u otros eventos no relevantes
    if (topic === "merchant_order" || type === "merchant_order") {
      console.warn("⚠️ Notificación ignorada (merchant_order):", req.body);
      return res.sendStatus(200);
    }

    let paymentId = data?.id || resource;
    if (!paymentId) {
      console.warn("⚠️ Webhook sin ID de pago válido");
      return res.sendStatus(200);
    }

    // 🔹 Consultar pago directamente para obtener metadata
    const payment = await mercadopago.payment.findById(paymentId);
    const info = payment.body;
    const status = info.status;
    const preferenceId = info.preference_id;
    let userId = info.metadata?.userId;
    let creditsToAdd = info.metadata?.creditsToAdd;

    // Si no viene en metadata, buscarlo en Firestore
    if ((!userId || !creditsToAdd) && preferenceId) {
      const prefDoc = await db.collection("preferences").doc(preferenceId).get();
      if (prefDoc.exists) {
        userId = prefDoc.data().userId;
        creditsToAdd = prefDoc.data().creditsToAdd;
      }
    }

    console.log(`💰 Pago recibido | Estado: ${status} | Usuario: ${userId} | Créditos: ${creditsToAdd}`);

    // 🔹 Si está aprobado, sumar créditos
    if (status === "approved" && userId && creditsToAdd) {
      const userRef = db.collection("usuarios").doc(userId);
      await userRef.update({
        creditos: admin.firestore.FieldValue.increment(creditsToAdd),
      });
      console.log(`✅ Créditos actualizados correctamente (+${creditsToAdd})`);
    } else {
      console.warn("⚠️ Pago no aprobado o sin metadata suficiente");
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
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor activo en puerto ${PORT}`));
