// ────────────────────────────────────────────────
// 🔹 webhook.js | Procesa notificaciones de Mercado Pago
// ────────────────────────────────────────────────
import express from "express";
import mercadopago from "mercadopago";
import admin from "firebase-admin";

const router = express.Router();
router.use(express.json());

// 🔹 Webhook principal de Mercado Pago
router.post("/", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Notificación recibida de Mercado Pago:", JSON.stringify(data, null, 2));

    // Validación básica
    if (!data || !data.type) {
      console.warn("⚠️ Notificación inválida:", data);
      return res.status(400).send("Invalid notification");
    }

    let userEmail;
    let monto = 0;
    let tipoEvento = "";

    switch (data.type) {
      case "payment":
        tipoEvento = "Pago único";
        if (!data.data?.id) {
          console.warn("⚠️ Pago recibido sin ID");
          return res.sendStatus(400);
        }

        console.log(`🔍 Consultando pago ID: ${data.data.id}...`);
        const payment = await mercadopago.payment.findById(data.data.id);
        const estado = payment.body.status;
        monto = payment.body.transaction_amount;
        userEmail = payment.body.payer?.email;

        console.log(`💰 Estado: ${estado} | Monto: ${monto} | Email: ${userEmail}`);
        if (estado !== "approved") {
          console.log(`⚠️ Pago no aprobado. Estado: ${estado}`);
          return res.sendStatus(200);
        }
        break;

      case "preapproval":
      case "subscription_preapproval":
        tipoEvento = "Suscripción/Preapproval";
        userEmail = data.data?.payer_email; // algunas suscripciones traen payer_email
        monto = data.data?.transaction_amount || 0;
        if (!userEmail) {
          console.warn("⚠️ Suscripción sin email asociado");
          return res.sendStatus(200);
        }
        break;

      default:
        console.log("📘 Tipo de evento no manejado:", data.type);
        return res.sendStatus(200);
    }

    // 🔹 Validación de Firestore
    if (!admin.apps.length) {
      console.error("❌ Firebase no inicializado");
      return res.sendStatus(500);
    }

    const db = admin.firestore();
    const usuariosRef = db.collection("usuarios");
    const snapshot = await usuariosRef.where("email", "==", userEmail).get();

    if (snapshot.empty) {
      console.warn(`⚠️ No se encontró usuario con email: ${userEmail}`);
      return res.sendStatus(200);
    }

    snapshot.forEach(async (doc) => {
      const usuario = doc.data();
      const creditosActuales = usuario.creditos || 0;
      const nuevosCreditos = creditosActuales + monto;

      await doc.ref.update({ creditos: nuevosCreditos });
      console.log(`✅ Créditos actualizados para ${userEmail}: ${creditosActuales} ➜ ${nuevosCreditos}`);
    });

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error procesando webhook:", error);
    res.sendStatus(500);
  }
});

export default router;
