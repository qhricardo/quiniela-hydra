// ────────────────────────────────────────────────
// 🔹 Configurar MercadoPago (SDK v2.0)
// ────────────────────────────────────────────────
import { MercadoPagoConfig, Preference, Payment } from "mercadopago";

const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN || "",
});

// Crear preferencia
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
          unit_price: parseFloat(monto),
        },
      ],
      payer: {
        name: nombre || "Usuario",
      },
      back_urls: {
        success: "https://quiniela360.com/pago-exitoso",
        failure: "https://quiniela360.com/pago-fallido",
        pending: "https://quiniela360.com/pago-pendiente",
      },
      auto_return: "approved",
      notification_url: "https://quiniela-hydra.onrender.com/webhook",
    };

    const preferenceInstance = new Preference(mpClient);
    const response = await preferenceInstance.create({ body: preference });

    console.log(`🧾 Preferencia creada para ${nombre} (${uid}) - Monto: ${monto}`);
    res.json({ init_point: response.init_point });
  } catch (error) {
    console.error("❌ Error al crear preferencia:", error);
    res.status(500).json({ error: "Error al crear preferencia de pago" });
  }
});

// Webhook MercadoPago
app.post("/webhook", async (req, res) => {
  try {
    const data = req.body;
    console.log("📩 Notificación recibida:", JSON.stringify(data, null, 2));

    if (data.type === "payment" && data.data && data.data.id) {
      const paymentInstance = new Payment(mpClient);
      const payment = await paymentInstance.get({ id: data.data.id });

      const estado = payment.status;
      const monto = payment.transaction_amount;
      const email = payment.payer.email;

      console.log(`💰 Pago recibido | Estado: ${estado} | Monto: ${monto} | Email: ${email}`);

      if (estado === "approved" && email && db) {
        const usuariosRef = db.collection("usuarios");
        const snapshot = await usuariosRef.where("email", "==", email).get();

        if (snapshot.empty) {
          console.warn("⚠️ No se encontró usuario con correo:", email);
        } else {
          for (const doc of snapshot.docs) {
            const usuarioData = doc.data();
            const creditosActuales = usuarioData.creditos || 0;
            const nuevosCreditos = creditosActuales + monto;

            await doc.ref.update({ creditos: nuevosCreditos });
            console.log(`✅ Créditos actualizados para ${email}: ${creditosActuales} ➜ ${nuevosCreditos}`);
          }
        }
      }
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error("❌ Error en webhook:", error);
    res.status(500).send("Error interno del servidor");
  }
});
