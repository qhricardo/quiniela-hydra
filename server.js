import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import admin from "firebase-admin";
import mercadopago from "mercadopago";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(bodyParser.json());

// 🔹 Inicializa Firebase
import serviceAccount from "./serviceAccountKey.json" assert { type: "json" };
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// 🔹 Configurar Mercado Pago
mercadopago.configure({ access_token: process.env.MP_ACCESS_TOKEN });

// ==========================
// 🔸 CREAR PREFERENCIA
// ==========================
app.post("/crear-preferencia", async (req, res) => {
  try {
    const { nombre, userId, creditos, monto } = req.body;

    console.log(`🧾 Creando preferencia para ${nombre}: ${monto} MXN`);

    const preference = {
      items: [
        {
          title: "Créditos Quiniela360",
          quantity: 1,
          unit_price: Number(monto),
        },
      ],
      payer: { name: nombre },
      metadata: { userId, creditos },
      back_urls: {
        success: "https://quiniela360.com/success",
        failure: "https://quiniela360.com/failure",
      },
      auto_return: "approved",
      notification_url: "https://tu-dominio.onrender.com/webhook",
    };

    const result = await mercadopago.preferences.create(preference);
    res.json({ init_point: result.body.init_point });
  } catch (err) {
    console.error("❌ Error creando preferencia:", err);
    res.status(500).json({ error: "Error al crear preferencia" });
  }
});

// ==========================
// 🔸 WEBHOOK (notificación del pago)
// ==========================
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("📩 Webhook recibido:", JSON.stringify(body, null, 2));

    // Solo manejamos los pagos aprobados
    if (body.type === "payment" || body.topic === "payment") {
      const paymentId = body.data?.id || body.resource;

      // Consulta el pago en MercadoPago
      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` },
      });
      const payment = await response.json();

      if (payment.status === "approved") {
        const userId = payment.metadata?.userId;
        const creditos = Number(payment.metadata?.creditos);

        if (!userId || !creditos) {
          console.log("⚠️ No se encontró userId o créditos en metadata");
          return res.sendStatus(200);
        }

        console.log(`💰 Pago aprobado | Usuario: ${userId} | Créditos: ${creditos}`);

        const userRef = db.collection("usuarios").doc(userId);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
          const currentCredits = userDoc.data().creditos || 0;
          await userRef.update({ creditos: currentCredits + creditos });
          console.log(`✅ Créditos actualizados: ${currentCredits} ➜ ${currentCredits + creditos}`);
        } else {
          console.log(`⚠️ Usuario ${userId} no encontrado en Firestore`);
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

// ==========================
// 🔸 INICIO SERVIDOR
// ==========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
