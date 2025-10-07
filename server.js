import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";

const app = express();
app.use(bodyParser.json());

// 🔹 Inicializa Firebase desde variable de entorno
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 🔹 Webhook de Mercado Pago
app.post("/webhook-mercadopago", async (req, res) => {
  try {
    const evento = req.body;

    // Verifica si el pago fue aprobado
    if (evento.action === "payment.updated" && evento.data.status === "approved") {
      const userId = evento.data.metadata.userId;
      const userRef = db.collection("users").doc(userId);

      // Sumar 4 créditos al usuario
      await userRef.update({
        creditos: admin.firestore.FieldValue.increment(4)
      });

      console.log("✅ Créditos sumados al usuario:", userId);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("❌ Error procesando webhook:", error);
    res.sendStatus(500);
  }
});

app.listen(3000, () => console.log("Servidor escuchando en puerto 3000"));
