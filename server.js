// ────────────────────────────────────────────────
// 🔹 server.js | Quiniela360 - Integración MercadoPago + Créditos Firebase
// ────────────────────────────────────────────────
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import mercadopago from "mercadopago";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

// ────────────────────────────────────────────────
// 🔹 Inicializar Express
// ────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(bodyParser.json());

// ────────────────────────────────────────────────
// 🔹 Inicializar Firebase Admin (usa tu serviceAccountKey.json)
// ────────────────────────────────────────────────
try {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  console.log("✅ Firebase inicializado correctamente");
} catch (error) {
  console.error("❌ Error inicializando Firebase:", error.message);
}

// Referencia a Firestore
const db = admin.firestore();

// ────────────────────────────────────────────────
// 🔹 Configurar MercadoPago con credenciales de producción
// ────────────────────────────────────────────────
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

// ────────────────────────────────────────────────
// 🔹 Crear preferencia de pago (usuario solicita agregar créditos)
// ────────────────────────────────────────────────
app.post("/crear-preferencia", async (req, res) => {
  try {
    const { uid, nombre, monto } = req.body;

    if (!uid || !monto) {
      return res.status(400).json({ error: "Faltan datos: uid o monto" });
    }

    const preference = {
      items: [
        {
          title: "Recarga de créditos Quiniela360",
          quantity: 1,
          currency_id: "MXN",
          unit_price: parseFloat(monto)
        }
      ],
      payer: {
        name: nombre || "Usuario"
      },
      back_urls: {
        success: "https://quiniela360.com/pago-exitoso",
        failure: "https://quiniela360.com/pago-fallido",
        pending: "https://quiniela360.com/pago-pendiente"
      },
      auto_return: "approved",
      notification_url: "https://quiniela-hydra.onrender.com/webhook"
    };

    const response = await mercadopago.preferences.create(preference);
    console.log(`🧾 Preferencia creada para ${nombre} (${uid}) - Monto: ${monto}`);

    res.json({ init_point: response.body.init_point });
  } catch (error) {
    console.error("❌ Error al crear preferencia:", error);
    res.status(500).json({ error: "Error al crear la preferencia de pago" });
  }
});

// ────────────────────────────────────────────────
// 🔹 Webhook (MercadoPago notifica pagos)
// ────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Notificación recibida:", JSON.stringify(data, null, 2));

    if (data.type === "payment") {
      const payment = await mercadopago.payment.findById(data.data.id);
      const estado = payment.body.status;
      const monto = payment.body.transaction_amount;
      const email = payment.body.payer.email;

      console.log(`💰 Pago recibido | Estado: ${estado} | Monto: ${monto} | Email: ${email}`);

      // Solo procesar pagos aprobados
      if (estado === "approved") {
        // Buscar usuario en Firestore por correo
        const usuariosRef = db.collection("usuarios");
        const snapshot = await usuariosRef.where("email", "==", email).get();

        if (snapshot.empty) {
          console.warn("⚠️ No se encontró usuario con el correo:", email);
        } else {
          snapshot.forEach(async (doc) => {
            const usuarioData = doc.data();
            const creditosActuales = usuarioData.creditos || 0;
            const nuevosCreditos = creditosActuales + monto;

            await doc.ref.update({ creditos: nuevosCreditos });

            console.log(`✅ Créditos actualizados para ${email}: ${creditosActuales} ➜ ${nuevosCreditos}`);
          });
        }
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.status(500).send("Error interno del servidor");
  }
});

// ────────────────────────────────────────────────
// 🔹 Ruta de prueba básica
// ────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.send("Servidor Quiniela360 activo con MercadoPago + Firebase ✅");
});

// ────────────────────────────────────────────────
// 🔹 Iniciar servidor
// ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor corriendo en puerto ${PORT}`));
