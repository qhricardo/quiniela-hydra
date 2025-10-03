const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe")(functions.config().stripe.secret); // usar config de Firebase

admin.initializeApp();

// Función invocable para crear sesión de pago
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
  }
  const paquete = data.paquete;
  const precios = {
    "50": { amount: 5000, credits: 50 },
    "100": { amount: 10000, credits: 120 },
    "200": { amount: 20000, credits: 260 }
  };
  if (!precios[paquete]) {
    throw new functions.https.HttpsError("invalid-argument", "Paquete no válido");
  }

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [
      {
        price_data: {
          currency: "mxn",
          product_data: {
            name: `${precios[paquete].credits} Créditos Quiniela360`
          },
          unit_amount: precios[paquete].amount
        },
        quantity: 1
      }
    ],
    success_url: "https://tu-dominio.com/success.html?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://tu-dominio.com/cancel.html",
    metadata: {
      userId: uid,
      paquete: paquete
    }
  });

  return { id: session.id };
});

// Webhook para procesar pagos confirmados
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, functions.config().stripe.webhook_secret);
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const uid = session.metadata.userId;
    const paquete = session.metadata.paquete;
    const precios = {
      "50": 50,
      "100": 120,
      "200": 260
    };
    const creditsToAdd = precios[paquete] || 0;

    const userRef = admin.firestore().doc(`users/${uid}`);
    await userRef.update({
      creditos: admin.firestore.FieldValue.increment(creditsToAdd)
    });
  }

  res.json({ received: true });
});
