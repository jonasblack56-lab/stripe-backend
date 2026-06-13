require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: '*', credentials: true }));
app.post('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Backend funcionando',
    backend_url: 'https://stripe-backend-e2ig.onrender.com'
  });
});

app.get('/diagnose', (req, res) => {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  res.json({
    backend_status: 'ok',
    api_key_configured: !!apiKey,
    api_key_prefix: apiKey ? apiKey.substring(0, 10) + '...' : 'NO CONFIGURADA',
    api_key_length: apiKey ? apiKey.length : 0,
    api_key_valid_format: apiKey ? apiKey.startsWith('sk_') : false,
    webhook_secret_configured: !!process.env.STRIPE_WEBHOOK_SECRET,
  });
});

// ============================================
// 🎯 CREAR SESIÓN DE PAGO (CON APORTE VOLUNTARIO)
// ============================================
app.post('/create-checkout-session', async (req, res) => {
  console.log('📩 Nueva petición:', req.body);
  
  try {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'STRIPE_SECRET_KEY no configurada' });
    }

    if (!apiKey.startsWith('sk_')) {
      return res.status(500).json({ error: 'Formato de clave API inválido' });
    }

    const { amount, tip, total, campaignName } = req.body;
    
    if (!amount || isNaN(amount) || amount < 5) {
      return res.status(400).json({ error: 'Monto inválido. Mínimo $5.00' });
    }

    const tituloCampana = campaignName || 'Donación solidaria';
    const tipAmount = tip || 0;
    const totalAmount = amount + tipAmount;
    
    // ✅ Statement descriptor (aparece en el estado de cuenta bancario)
    const statementDescriptor = tituloCampana
      .replace(/[^\w\s]/g, '')
      .trim()
      .substring(0, 22)
      .toUpperCase();

    // ✅ CONSTRUIR ITEMS PARA STRIPE
    const lineItems = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: tituloCampana,
            description: `Tu donación de $${amount.toFixed(2)} ayudará a cumplir el sueño de Cecilia y sus hijos. ¡Gracias por tu generosidad!`,
            images: ['https://i.ibb.co/4Rrb1ZPR/IMG-5534115-2-1.jpg'],
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }
    ];

    // ✅ AGREGAR APORTE VOLUNTARIO COMO SEGUNDO ITEM
    if (tipAmount > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Aporte voluntario a GoFundMe',
            description: `Gracias por apoyar la plataforma con $${tipAmount.toFixed(2)}`,
          },
          unit_amount: Math.round(tipAmount * 100),
        },
        quantity: 1,
      });
    }

    console.log('🛒 Items creados:', lineItems.map(item => ({
      name: item.price_data.product_data.name,
      amount: item.price_data.unit_amount / 100
    })));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      
      payment_intent_data: {
        statement_descriptor: statementDescriptor,
        description: `${tituloCampana} - Total: $${totalAmount.toFixed(2)} USD`,
        metadata: {
          campaignName: tituloCampana,
          donationAmount: amount.toString(),
          tipAmount: tipAmount.toString(),
          totalAmount: totalAmount.toString(),
        }
      },
      
      success_url: `https://gohelpyou.com/graciasportudonativo?session_id={CHECKOUT_SESSION_ID}&amount=${amount}`,
      cancel_url: `https://gohelpyou.com/?canceled=true`,
      
      metadata: {
        amount: amount.toString(),
        tip: tipAmount.toString(),
        total: totalAmount.toString(),
        campaignName: tituloCampana,
      },
      
      locale: 'es-419',
      billing_address_collection: 'auto',
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic',
        },
      },
    });

    console.log('✅ Sesión creada:', {
      sessionId: session.id,
      amount: amount,
      tip: tipAmount,
      total: totalAmount
    });

    res.json({ 
      url: session.url,
      sessionId: session.id 
    });

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    res.status(500).json({ 
      error: error.message,
      type: error.type
    });
  }
});

app.get('/verify-payment', async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'Session ID requerido' });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    res.json({
      status: session.payment_status,
      amount: session.metadata.amount || (session.amount_total / 100).toString(),
      tip: session.metadata.tip || '0',
      total: session.metadata.total || (session.amount_total / 100).toString(),
      sessionId: session.id,
      paid: session.payment_status === 'paid'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('✅ PAGO EXITOSO:', session.id);
  }

  res.json({ received: true });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
  console.log(`🌐 URL: https://stripe-backend-e2ig.onrender.com`);
});
