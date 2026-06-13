const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors({
    origin: '*',
}));

app.use(express.json());

app.post('/create-checkout-session', async (req, res) => {
    try {
        const { amount, tip, total, campaignName } = req.body;

        if (!amount || amount < 5) {
            return res.status(400).json({ error: 'Monto inválido' });
        }

        const amountInCents = Math.round(total * 100);

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: campaignName || 'Donación',
                            description: `Donación $${amount} + Aporte $${tip}`,
                        },
                        unit_amount: amountInCents,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: 'https://www.gohelpyou.com/gracias',
            cancel_url: 'https://www.gohelpyou.com/pagocancelado',
            metadata: {
                donation_amount: amount.toString(),
                tip_amount: tip.toString(),
                total_amount: total.toString(),
            },
        });

        res.json({ url: session.url, sessionId: session.id });

    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.get('/', (req, res) => {
    res.json({ status: 'Backend funcionando ✅' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
});
