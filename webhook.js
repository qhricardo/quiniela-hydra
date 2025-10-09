// ────────────────────────────────────────────────
// 🔹 webhook.js | Procesa notificaciones de Mercado Pago
// ────────────────────────────────────────────────
import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";

// 🔹 Inicializa Firebase Admin (asegúrate de tener tu serviceAccountKey.json)
admin.initializeApp({
  credential: admin.credential.cert('./serviceAccountKey.json')
});

const db = admin.firestore();
const app = express();
app.use(bodyParser.json());

// 🔹 Webhook de Mercado Pago
app.post("/webhook", async (req, res) => {
  try {
    const payment = req.body;

    console.log("🔔 Webhook recibido:", payment);

    // Solo procesar pagos aprobados
    if (payment.status !== "approved") {
      console.log("❌ Pago no aprobado. Ignorando.");
      return res.status(200).send("Pago no aprobado, no se actualiza.");
    }

    // Obtener metadata enviada al crear la preferencia
    const metadata = payment.metadata || {};
    const userId = metadata.userId;
    const creditsToAdd = Number(metadata.creditsToAdd) || 0;

    if (!userId || creditsToAdd <= 0) {
      console.error("❌ Datos de usuario o créditos inválidos:", metadata);
      return res.status(400).send("Datos inválidos");
    }

    // 🔹 Referencia al usuario en Firestore
    const userRef = db.collection("users").doc(userId);

    // Actualizar créditos
    await userRef.update({
      creditos: admin.firestore.FieldValue.increment(creditsToAdd)
    });

    console.log(`✅ Créditos actualizados: ${creditsToAdd} para usuario ${userId}`);
    res.status(200).send("Créditos actualizados correctamente");
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.status(500).send("Error interno");
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor webhook escuchando en puerto ${PORT}`));
