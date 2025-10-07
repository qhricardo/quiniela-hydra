// webhook.js
import express from "express";

const router = express.Router();

// Middleware para leer JSON
router.use(express.json());

// ─────────────────────────────────────────────
//  Ruta principal del webhook de Mercado Pago
// ─────────────────────────────────────────────
router.post("/", async (req, res) => {
  try {
    const notification = req.body;
    console.log("📩 Notificación recibida de Mercado Pago:", JSON.stringify(notification, null, 2));

    // ─── Validación básica ─────────────────────
    if (!notification || !notification.type) {
      console.warn("⚠️ Notificación inválida:", notification);
      return res.status(400).send("Invalid notification");
    }

    // ─── Tipos comunes de notificación ─────────
    switch (notification.type) {
      case "payment":
        console.log("💰 Notificación de pago:", notification.data.id);
        // Aquí podrías consultar el pago en la API de Mercado Pago
        // y actualizar tu base de datos (por ejemplo, agregar créditos al usuario)
        break;

      case "subscription_preapproval":
      case "preapproval":
        console.log("🔄 Suscripción o preapproval actualizado:", notification.data.id);
        break;

      case "merchant_order":
        console.log("🧾 Orden de comerciante actualizada:", notification.data.id);
        break;

      default:
        console.log("📘 Tipo de evento no manejado:", notification.type);
        break;
    }

    // ─── Siempre responde con 200 OK ───────────
    res.status(200).send("OK");

  } catch (error) {
    console.error("❌ Error en el webhook:", error);
    res.status(500).send("Internal Server Error");
  }
});

// ─────────────────────────────────────────────
// Exportar el router para integrarlo en server.js
// ─────────────────────────────────────────────
export default router;
