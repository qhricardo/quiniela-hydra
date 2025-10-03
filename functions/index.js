const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe")("TU_SECRET_KEY");

admin.initializeApp();

exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
  const uid = context.auth.uid;
  if (!uid) throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");

  const paquete = data.paquete; // por ejemplo "50" o "100"
  const precios = { "50": 5000, "100": 10000 }; // centavos MXN

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    mode: "payment",
    line_items: [{
      price_data: {
        currency: "mxn",
        product_data: { name: `${paquete} Créditos` },
        unit_amount: precios[paquete],
      },
      quantity: 1,
    }],
    success_url: "https://TU_DOMINIO/success.html",
    cancel_url: "https://TU_DOMINIO/cancel.html",
    metadata: { userId: uid, paquete: paquete }
  });

  return { id: session.id };
});

exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, "TU_WEBHOOK_SECRET");
  } catch (err) {
    console.error("Webhook error: ", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const uid = session.metadata.userId;
    const paquete = session.metadata.paquete;

    // calcular créditos a otorgar según paquete
    const creditsToAdd = parseInt(paquete);

    const userRef = admin.firestore().doc(`users/${uid}`);
    await userRef.update({
      creditos: admin.firestore.FieldValue.increment(creditsToAdd)
    });
  }

  res.json({ received: true });
});
