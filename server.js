import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import MercadoPagoConfig, { Preference } from "mercadopago";
import dotenv from "dotenv";
import fetch from "node-fetch";

// 🔹 Cargar variables de entorno (.env en local o Environment Variables en Render)
dotenv.config();

const app = express();
app.use(bodyParser.json());

// 🔹 Inicializar Firebase Admin con clave desde variable de entorno
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("❌ No se encontró la variable FIREBASE_SERVICE_ACCOUNT.");
  process.exit(1);
}

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

// 🔹 Configurar Mercado Pago
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN, // ⚠️ Usa variable de entorno
});


// ========================================================================
// 📦 CREAR PREFERENCIA DE PAGO
// ========================================================================
app.post("/create_preference", async (req, res) => {
  try {
    const { userId, creditsToAdd, name, amount } = req.body;

    if (!userId || !creditsToAdd || !amount) {
      return res.status(400).json({ error: "Datos insuficientes." });
    }

    const preference = await mercadopago.preferences.create({
      items: [
        {
          title: `Recarga de créditos (${creditsToAdd})`,
          quantity: 1,
          currency_id: "MXN",
          unit_price: Number(amount),
        },
      ],
      metadata: {
        userId,
        creditsToAdd,
        name: name || "Usuario desconocido",
      },
      notification_url: `${process.env.BASE_URL}/webhook`,
    });

    console.log(`🧾 Preferencia creada para ${name || userId}: ${amount} MXN`);

    // 🔹 No se guarda en preferences, ya no es necesario
    res.json({ id: preference.id, init_point: preference.init_point });
  } catch (error) {
    console.error("❌ Error creando preferencia:", error);
    res.status(500).json({ error: "Error creando preferencia de pago" });
  }
});

// ========================================================================
// 📩 WEBHOOK DE MERCADO PAGO
// ========================================================================
app.post("/webhook", async (req, res) => {
  try {
    const body = req.body;
    console.log("📩 Webhook recibido:", JSON.stringify(body, null, 2));

    if (!body || !body.topic) {
      console.warn("⚠️ Webhook sin 'topic'.");
      return res.sendStatus(400);
    }

    // 🔸 Solo procesar pagos
    if (body.topic === "payment" || body.type === "payment") {
      const paymentId = body.data?.id || body.resource?.split("/").pop();
      if (!paymentId) {
        console.warn("⚠️ No se encontró ID de pago en el webhook.");
        return res.sendStatus(400);
      }

      // 🔹 Consultar pago en MercadoPago
      const paymentRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${paymentId}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
          },
        }
      );
      const payment = await paymentRes.json();

      const status = payment.status;
      const metadata = payment.metadata || {};
      const userId = metadata.userId;
      const creditsToAdd = metadata.creditsToAdd;

      console.log(
        `💰 Pago recibido | Estado: ${status} | Usuario: ${userId} | Credits: ${creditsToAdd}`
      );

      if (status !== "approved") {
        console.log("⚠️ Pago no aprobado. Se ignora.");
        return res.sendStatus(200);
      }

      // ✅ Si el pago fue aprobado, actualizar créditos del usuario
      if (userId && creditsToAdd) {
        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
          const currentCredits = userDoc.data().credits || 0;
          const newCredits = currentCredits + Number(creditsToAdd);
          await userRef.update({ credits: newCredits });
          console.log(`✅ Créditos actualizados: ${currentCredits} → ${newCredits}`);
        } else {
          console.warn(`⚠️ Usuario no encontrado: ${userId}`);
        }
      } else {
        console.error("❌ Error: userId o creditsToAdd no definidos en metadata.");
      }

      return res.sendStatus(200);
    } else {
      console.log(`⚠️ Notificación ignorada (no es pago):`, body);
      return res.sendStatus(200);
    }
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    return res.sendStatus(500);
  }
});

// ========================================================================
// 🚀 INICIO DEL SERVIDOR
// ========================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor escuchando en puerto ${PORT}`));
