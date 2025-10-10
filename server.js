// ───────────────────────────────────────────────────────────────
//  Quiniela360 - Servidor Node.js (Render compatible)
// ───────────────────────────────────────────────────────────────

import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import fs from "fs";
import fetch from "node-fetch";

// ─── Inicializar Express ───────────────────────────────────────
const app = express();
app.use(bodyParser.json());

// ─── Cargar credenciales de Firebase ───────────────────────────
const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// ─── Configuración de MercadoPago ──────────────────────────────
const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN; // Usa variable de entorno en Render
const MP_API_URL = "https://api.mercadopago.com/v1/payments/";

// ───────────────────────────────────────────────────────────────
// 🔹 Endpoint raíz
// ───────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("✅ Servidor de Quiniela360 activo y corriendo.");
});

// ───────────────────────────────────────────────────────────────
// 🔹 Webhook de MercadoPago
// ───────────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    console.log("📩 Webhook recibido:", JSON.stringify(req.body, null, 2));
    const body = req.body;

    // ─── Validar tipo de notificación ───────────────────────────
    if (!body || (!body.topic && !body.type)) {
      console.log("⚠️ Webhook sin información útil");
      return res.sendStatus(400);
    }

    // ─── Manejar pagos ─────────────────────────────────────────
    if (body.topic === "payment" || body.type === "payment") {
      const paymentId = body.resource?.toString().replace(/\D/g, "") || body.data?.id;
      if (!paymentId) {
        console.log("⚠️ Webhook de pago sin ID válido.");
        return res.sendStatus(400);
      }

      console.log(`🔍 Consultando pago #${paymentId}`);

      // ─── Obtener información del pago desde la API de MP ──────
      const response = await fetch(`${MP_API_URL}${paymentId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` }
      });
      const paymentData = await response.json();

      if (!paymentData || paymentData.error) {
        console.log("⚠️ No se pudo obtener la información del pago:", paymentData.error);
        return res.sendStatus(400);
      }

      const estado = paymentData.status;
      const metadata = paymentData.metadata || {};
      const userId = metadata.userId || metadata.firebaseUid || null;
      const credits = metadata.credits || 0;

      console.log(`💰 Pago recibido | Estado: ${estado} | Usuario: ${userId} | Credits: ${credits}`);

      // ─── Validar usuario ─────────────────────────────────────
      if (!userId) {
        console.error("❌ Error: No se pudo obtener el userId desde metadata.");
        return res.sendStatus(400);
      }

      // ─── Solo actualizar si el pago fue aprobado ─────────────
      if (estado === "approved") {
        const userRef = db.collection("users").doc(userId);
        const userSnap = await userRef.get();

        if (userSnap.exists) {
          const currentCredits = userSnap.data().credits || 0;
          const newCredits = currentCredits + credits;

          await userRef.update({ credits: newCredits });
          console.log(`✅ Créditos actualizados para ${userId}: ${currentCredits} ➜ ${newCredits}`);
        } else {
          console.log(`⚠️ Usuario ${userId} no encontrado en Firestore.`);
        }
      } else {
        console.log(`⚠️ Pago con estado '${estado}' — no se acreditó.`);
      }

      return res.sendStatus(200);
    }

    // ─── Ignorar otros temas ──────────────────────────────────
    console.log("⚠️ Notificación ignorada (no es pago):", body);
    res.sendStatus(200);

  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.sendStatus(500);
  }
});

// ───────────────────────────────────────────────────────────────
// 🔹 Endpoint de verificación de salud
// ───────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.status(200).send("Servidor funcionando correctamente ✅");
});

// ───────────────────────────────────────────────────────────────
// 🔹 Iniciar servidor
// ───────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
});
