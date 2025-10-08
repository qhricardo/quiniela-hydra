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

    // Validación básica
    if (!data || !data.type) {
      console.warn("⚠️ Notificación inválida:", data);
      return res.status(400).send("Invalid notification");
    }

    // ─────────────────────────────────────────────
    // 🔹 Solo procesamos notificaciones de pagos
    // ─────────────────────────────────────────────
    if (data.type === "payment") {
      const paymentId = data.data.id;
      console.log(`🔍 Consultando pago ID: ${paymentId}...`);

      const payment = await mercadopago.payment.findById(paymentId);
      const estado = payment.body.status;
      const monto = payment.body.transaction_amount;
      const email = payment.body.payer.email;

      console.log(`💰 Estado del pago: ${estado} | Monto: ${monto} | Email: ${email}`);

      // Solo si el pago fue aprobado
      if (estado === "approved" && email) {
        const db = admin.firestore();
        const usuariosRef = db.collection("usuarios");
        const snapshot = await usuariosRef.where("email", "==", email).get();

        if (snapshot.empty) {
          console.warn("⚠️ No se encontró usuario con el correo:", email);
        } else {
          snapshot.forEach(async (doc) => {
            const usuario = doc.data();
            const creditosActuales = usuario.creditos || 0;
            const nuevosCreditos = creditosActuales + monto;

            await doc.ref.update({ creditos: nuevosCreditos });

            console.log(`✅ Créditos actualizados para ${email}: ${creditosActuales} ➜ ${nuevosCreditos}`);
          });
        }
      } else {
        console.log(`⚠️ Pago no aprobado o sin correo. Estado: ${estado}`);
      }
    }

    // Confirmar recepción a Mercado Pago
    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error procesando webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});

// ────────────────────────────────────────────────
// Exportar el router para server.js
// ────────────────────────────────────────────────
export default router;
