// ────────────────────────────────────────────────
// 🔹 webhook.js | Procesa notificaciones de Mercado Pago
// ────────────────────────────────────────────────
import express from "express";
import mercadopago from "mercadopago";
import admin from "firebase-admin";

const router = express.Router();
router.use(express.json());

// ────────────────────────────────────────────────
// 🔹 Webhook principal de Mercado Pago
// ────────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Notificación recibida de Mercado Pago:", JSON.stringify(data, null, 2));

    if (!data || !data.type) {
      console.warn("⚠️ Notificación inválida:", data);
      return res.status(400).send("Invalid notification");
    }

    const db = admin.firestore();

    // ─────────────────────────────────────────────
    // 🔹 Pagos directos
    // ─────────────────────────────────────────────
    if (data.type === "payment") {
      const paymentId = data.data.id;
      console.log(`🔍 Consultando pago ID: ${paymentId}...`);

      const payment = await mercadopago.payment.findById(paymentId);
      const estado = payment.body.status;
      const monto = payment.body.transaction_amount;
      const metadataUserId = payment.body.metadata?.userId;
      const payerEmail = payment.body.payer.email;

      console.log(`💰 Estado: ${estado} | Monto: ${monto} | userId: ${metadataUserId} | Email: ${payerEmail}`);

      if (estado === "approved") {
        if (metadataUserId) {
          // Si userId está definido en metadata
          const userRef = db.collection("usuarios").doc(metadataUserId);
          const userSnap = await userRef.get();

          if (userSnap.exists) {
            const creditosActuales = userSnap.data().creditos || 0;
            const nuevosCreditos = creditosActuales + monto;
            await userRef.update({ creditos: nuevosCreditos });
            console.log(`✅ Créditos actualizados para userId ${metadataUserId}: ${creditosActuales} ➜ ${nuevosCreditos}`);
          } else {
            console.warn(`⚠️ Usuario con userId ${metadataUserId} no encontrado`);
          }
        } else if (payerEmail) {
          // Si no hay userId, buscar por email
          const snapshot = await db.collection("usuarios").where("email", "==", payerEmail).get();
          if (snapshot.empty) {
            console.warn(`⚠️ No se encontró usuario con email: ${payerEmail}`);
          } else {
            snapshot.forEach(async (doc) => {
              const creditosActuales = doc.data().creditos || 0;
              const nuevosCreditos = creditosActuales + monto;
              await doc.ref.update({ creditos: nuevosCreditos });
              console.log(`✅ Créditos actualizados para ${payerEmail}: ${creditosActuales} ➜ ${nuevosCreditos}`);
            });
          }
        } else {
          console.warn("⚠️ Pago aprobado pero no se pudo identificar usuario (no userId ni email)");
        }
      } else {
        console.log(`⚠️ Pago no aprobado. Estado: ${estado}`);
      }
    }

    // ─────────────────────────────────────────────
    // 🔹 Suscripciones / Preapproval
    // ─────────────────────────────────────────────
    else if (data.type === "subscription_preapproval" || data.type === "preapproval") {
      const preapprovalId = data.data.id;
      console.log(`🔄 Suscripción o preapproval actualizado: ${preapprovalId}`);
      // Aquí podrías actualizar info de suscripciones si quieres
    }

    else {
      console.log("📘 Tipo de evento no manejado:", data.type);
    }

    // Confirmar recepción
    res.status(200).send("OK");

  } catch (error) {
    console.error("❌ Error procesando webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});

export default router;
