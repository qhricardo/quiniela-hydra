const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe")("sk_test_51SEAcuAxnIQ0x6oT66VzBiYVN8ipgDaqXJRgkaDy5INHRTFcnccvlsNuNdZQsaSwqXsMJvdsUNrLZhYbIhVX2JBJ00AS2tQowI"); // 🔑 clave privada (solo aquí)

admin.initializeApp();

// Crear sesión de pago
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "mxn",
        product_data: { name: "Paquete de créditos Quiniela360" },
        unit_amount: 5000, // 💵 en centavos = $50.00 MXN
      },
      quantity: 1,
    }],
    success_url: "https://tu-dominio.com/success.html",
    cancel_url: "https://tu-dominio.com/cancel.html",
  });

  return { id: session.id };
});

// Webhook para acreditar créditos
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      req.headers["stripe-signature"],
      "TU_SIGNING_SECRET" // de Stripe Dashboard
    );
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const uid = session.metadata.userId; // debes mandar userId al crear la sesión

    // 🔹 Acreditar créditos en Firestore
    const userRef = admin.firestore().doc(`users/${uid}`);
    await userRef.update({
      creditos: admin.firestore.FieldValue.increment(10)
    });
  }

  res.json({ received: true });
});
