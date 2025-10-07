import express from "express";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import fs from "fs";

const app = express();
app.use(bodyParser.json());

// 🔹 Inicializa Firebase Admin
const serviceAccount = JSON.parse(fs.readFileSync("./serviceAccountKey.json", "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 🔹 Endpoint Webhook Mercado Pago
app.post("/webhook-mercadopago", async (req, res) => {
  try {
    const evento = req.body;

    // Asegura que sea pago aprobado
    if (evento.action === "payment.updated" && evento.data?.status === "approved") {
      const userId = evento.data.metadata.userId;

      const userRef = db.collection("users").doc(userId);
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

// 🔹 Puerto
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor escuchando en puerto ${PORT}`));
