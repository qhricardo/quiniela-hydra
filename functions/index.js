const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Stripe = require("stripe");

admin.initializeApp();

// ⚠️ Configurar secret con: 
// firebase functions:config:set stripe.secret="sk_test_xxx" stripe.webhook_secret="whsec_xxx"
const stripe = Stripe(functions.config().stripe.secret);

// 🔹 Crear sesión de checkout
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
  if (!context.auth?.uid) {
    throw new functions.https.HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const uid = context.auth.uid;
  const paquete = data.paquete;

  const precios = {
    "50": { amount: 5000, credits: 50 },
    "100": { amount: 10000, credits: 120 },
    "200": { amount: 20000, credits: 260 }
  };

  if (!precios[paquete]) {
    throw new functions.https.HttpsError("invalid-argument", "Paquete inválido.");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "mxn",
        product_data: { name: `${precios[paquete].credits} Créditos Quiniela360` },
        unit_amount: precios[paquete].amount
      },
      quantity: 1
    }],
    success_url: "https://tu-dominio.com/success.html?session_id={CHECKOUT_SESSION_ID}",
    cancel_url: "https://tu-dominio.com/cancel.html",
    metadata: { userId: uid, paquete }
  });

  return { id: session.id };
});

// 🔹 Webhook para acreditar créditos
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, functions.config().stripe.webhook_secret);
  } catch (err) {
    console.error("❌ Error de firma:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const uid = session.metadata?.userId;
    const paquete = session.metadata?.paquete;

    const mapping = { "50": 50, "100": 120, "200": 260 };
    const creditsToAdd = mapping[paquete] || 0;

    if (uid && creditsToAdd > 0) {
      const userRef = admin.firestore().doc(`users/${uid}`);
      await userRef.update({
        creditos: admin.firestore.FieldValue.increment(creditsToAdd)
      });

      await admin.firestore().collection("transacciones").add({
        uid,
        paquete,
        creditsToAdd,
        sessionId: session.id,
        amount_paid: session.amount_total,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  res.json({ received: true });
});
