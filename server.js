import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import mercadopago from "mercadopago";
import dotenv from "dotenv";

dotenv.config(); // Cargar variables de entorno

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔹 Configurar MercadoPago con el token de producción
mercadopago.configure({
  access_token: process.env.MP_ACCESS_TOKEN
});

// 🔹 Ruta para crear la preferencia de pago
app.post("/crear-preferencia", async (req, res) => {
  try {
    const { usuario, monto, descripcion } = req.body;

    const preference = {
      items: [
        {
          title: descripcion || "Bono Quiniela360",
          quantity: 1,
          currency_id: "MXN",
          unit_price: parseFloat(monto)
        },
      ],
      payer: {
        name: usuario || "Usuario no identificado"
      },
      back_urls: {
        success: "https://quiniela360.com/pago-exitoso",
        failure: "https://quiniela360.com/pago-fallido",
        pending: "https://quiniela360.com/pago-pendiente"
      },
      auto_return: "approved",
      notification_url: "https://quiniela-hydra.onrender.com/webhook" // 🔔 Aquí llega la notificación
    };

    const response = await mercadopago.preferences.create(preference);
    res.json({ init_point: response.body.init_point });

  } catch (error) {
    console.error("Error al crear preferencia:", error);
    res.status(500).json({ error: "Error al crear la preferencia de pago" });
  }
});

// 🔹 Webhook para recibir notificaciones de pago
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Notificación recibida:", JSON.stringify(data, null, 2));

    if (data.type === "payment") {
      const payment = await mercadopago.payment.findById(data.data.id);
      const estado = payment.body.status;
      const id_pago = payment.body.id;
      const email = payment.body.payer.email;

      console.log(`💰 Pago recibido: ${id_pago} | Estado: ${estado} | Usuario: ${email}`);

      // Aquí puedes actualizar tu base de datos
      // Ejemplo:
      // await db.collection("bonos").doc(email).update({ estado: estado });

    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("Error en webhook:", error);
    res.status(500).send("Error interno");
  }
});

// 🔹 Ruta de prueba
app.get("/", (req, res) => {
  res.send("Servidor activo y escuchando notificaciones de MercadoPago");
});

// 🔹 Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Servidor corriendo en puerto ${PORT}`));
