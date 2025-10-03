const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe")(functions.config().stripe.secret); // Configurar en Firebase: stripe.secret

admin.initializeApp();

// Endpoint para crear pago
exports.api = functions.https.onRequest(async (req, res) => {
    if (req.method === "POST") {
        const { cantidad } = req.body; // cantidad de créditos
        const uid = req.body.uid; // uid del usuario (opcional si lo mandas desde frontend)

        const paymentIntent = await stripe.paymentIntents.create({
            amount: cantidad * 5000, // $50 MXN = 5000 centavos
            currency: "mxn",
            payment_method_types: ["card"],
        });

        res.json({ client_secret: paymentIntent.client_secret });
    } else {
        res.status(400).send("Método no permitido");
    }
});

// Webhook para escuchar pagos completados
exports.webhook = functions.https.onRequest(async (req, res) => {
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.rawBody,
            sig,
            functions.config().stripe.webhook_secret
        );
    } catch (err) {
        console.error("Error en webhook: ", err.message);
        return res.status(400).send(`Webhook error: ${err.message}`);
    }

    if (event.type === "payment_intent.succeeded") {
        const paymentIntent = event.data.object;
        const uid = paymentIntent.metadata.uid;

        // Sumar créditos al usuario
        const userRef = admin.firestore().collection("users").doc(uid);
        await userRef.update({
            creditos: admin.firestore.FieldValue.increment(1) // 1 crédito por ejemplo
        });
    }

    res.json({ received: true });
});
