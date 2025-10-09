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

    // Solo procesamos notificaciones de pagos
    if (data.type === "payment") {
      const paymentId = data.data?.id;
      if (!paymentId) {
        console.warn("⚠️ No se recibió ID del pago");
        return res.status(400).send("Payment ID missing");
      }

      console.log(`🔍 Consultando pago ID: ${paymentId}...`);
      const payment = await mercadopago.payment.findById(paymentId);
      const estado = payment.body.status;
      const metadata = payment.body.metadata || {};
      const userId = metadata.userId;
      const creditsToAdd = Number(metadata.creditsToAdd) || 0;
      const email = payment.body.payer?.email || metadata.email;

      console.log(`💰 Estado del pago: ${estado} | userId: ${userId} | Email: ${email} | Créditos a sumar: ${creditsToAdd}`);

      if (estado === "approved") {
        if (creditsToAdd <= 0) {
          console.warn("⚠️ No hay créditos definidos en metadata, se ignora.");
          return res.status(400).send("No credits to add");
        }

        const db = admin.firestore();

        if (userId) {
          // Actualiza por userId
          const userRef = db.collection("usuarios").doc(userId);
          const userSnap = await userRef.get();
          if (userSnap.exists) {
            await userRef.update({
              creditos: admin.firestore.FieldValue.increment(creditsToAdd)
            });
            console.log(`✅ Créditos actualizados para userId ${userId}: +${creditsToAdd}`);
          } else {
            console.warn(`⚠️ No se encontró usuario con ID: ${userId}`);
          }
        } else if (email) {
          // Actualiza por email
          const usuariosRef = db.collection("usuarios");
          const snapshot = await usuariosRef.where("email", "==", email).get();
          if (snapshot.empty) {
            console.warn(`⚠️ No se encontró usuario con email: ${email}`);
          } else {
            snapshot.forEach(async (doc) => {
              await doc.ref.update({
                creditos: admin.firestore.FieldValue.increment(creditsToAdd)
              });
              console.log(`✅ Créditos actualizados para ${email}: +${creditsToAdd}`);
            });
          }
        } else {
          console.warn("⚠️ No se encontró userId ni email para actualizar créditos");
        }
      } else {
        console.log(`⚠️ Pago no aprobado. Estado: ${estado}`);
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error procesando webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});

// ────────────────────────────────────────────────
// Exportar router
// ────────────────────────────────────────────────
export default router;
