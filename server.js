require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 🌐 CONFIGURACIÓN DE CORS
// ============================================
app.use(cors({
    origin: '*',
  origin: [
    'https://gohelpyou.com',
    'http://localhost:3000',
    'http://localhost:5500',
    'https://stripe-backend-e2ig.onrender.com'
  ],
  credentials: true
}));

// Para webhooks (necesita raw body)
app.post('/webhook', express.raw({ type: 'application/json' }));

// Para otras rutas
app.use(express.json());

// ============================================
// 🏠 RUTA DE PRUEBA
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Backend de Stripe funcionando correctamente',
    endpoints: {
      'POST /create-checkout-session': 'Crear sesión de pago',
      'GET /verify-payment?session_id=xxx': 'Verificar pago',
      'POST /webhook': 'Webhook de Stripe'
    }
  });
});

// ============================================
// 🎯 CREAR SESIÓN DE PAGO
// ============================================
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
  try {
    const { amount, tip, total, campaignName } = req.body;

    // Validaciones
    if (!amount || amount < 5) {
      return res.status(400).json({ 
        error: 'La donación mínima es de $5.00' 
      });
    }

    // Construir items para Stripe
    const lineItems = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: campaignName || 'Donación',
            description: 'Tu generosidad hace la diferencia',
          },
          unit_amount: Math.round(amount * 100), // Convertir a centavos
        },
        quantity: 1,
      }
    ];

    // Agregar propina si existe
    if (tip && tip > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Aporte voluntario a GoFundMe',
            description: 'Gracias por apoyar la plataforma',
          },
          unit_amount: Math.round(tip * 100),
        },
        quantity: 1,
      });
    }

    // ✅ CREAR SESIÓN CON URLs CORRECTAS
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      
      // ✅ URL DE ÉXITO - Redirige a página de agradecimiento
      success_url: `https://gohelpyou.com/gracias?session_id={CHECKOUT_SESSION_ID}&amount=${amount}`,
      
      // ✅ URL DE CANCELACIÓN - Redirige al widget con mensaje
      cancel_url: `https://gohelpyou.com/?canceled=true`,
      
      // Metadata para guardar información adicional
      metadata: {
        amount: amount.toString(),
        tip: (tip || 0).toString(),
        total: (total || amount).toString(),
        campaignName: campaignName || 'Donación',
        createdAt: new Date().toISOString()
      },
      
      // Configuración adicional
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
      locale: 'es-419', // Español latinoamericano
    });

    console.log('✅ Sesión creada:', {
      sessionId: session.id,
      amount: amount,
      tip: tip,
      total: total
    });

    res.json({ 
      url: session.url,
      sessionId: session.id 
    });

  } catch (error) {
    console.error('❌ Error creando sesión:', error);
    res.status(500).json({ 
      error: error.message || 'Error al crear la sesión de pago' 
    });
  }
});

app.get('/', (req, res) => {
    res.json({ status: 'Backend funcionando ✅' });
// ============================================
// 🔍 VERIFICAR ESTADO DEL PAGO
// ============================================
app.get('/verify-payment', async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'Session ID requerido' });
  }

  try {
    // Consultar el estado de la sesión en Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    console.log('🔍 Verificando pago:', {
      sessionId: session.id,
      status: session.payment_status,
      amount: session.amount_total
    });

    res.json({
      status: session.payment_status, // 'paid', 'unpaid', 'no_payment_required'
      amount: session.metadata.amount || (session.amount_total / 100).toString(),
      tip: session.metadata.tip || '0',
      total: session.metadata.total || (session.amount_total / 100).toString(),
      sessionId: session.id,
      customerEmail: session.customer_details?.email || null,
      paid: session.payment_status === 'paid'
    });

  } catch (error) {
    console.error('❌ Error verificando pago:', error);
    res.status(500).json({ 
      error: error.message || 'Error al verificar el pago' 
    });
  }
});

const PORT = process.env.PORT || 3000;
// ============================================
// 🔔 WEBHOOK - Escuchar eventos de Stripe
// ============================================
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verificar firma del webhook
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('❌ Error en webhook:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Manejar diferentes tipos de eventos
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      
      console.log('✅ PAGO EXITOSO:', {
        sessionId: session.id,
        amount: session.amount_total / 100,
        currency: session.currency,
        customerEmail: session.customer_details?.email,
        metadata: session.metadata
      });

      // AQUÍ puedes:
      // - Guardar en base de datos
      // - Enviar email de confirmación
      // - Actualizar contadores de la campaña
      // - Notificar al administrador
      
      break;

    case 'checkout.session.expired':
      console.log('⚠️ Sesión expirada:', event.data.object.id);
      break;

    case 'payment_intent.payment_failed':
      console.log('❌ Pago fallido:', event.data.object.id);
      break;

    default:
      console.log(`ℹ️ Evento no manejado: ${event.type}`);
  }

  res.json({ received: true });
});

// ============================================
// 🚀 INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  🚀 Servidor Stripe corriendo            ║
  ║  📍 Puerto: ${PORT}                         ║
  ║  🌐 URL: https://stripe-backend-e2ig.onrender.com
  ╚══════════════════════════════════════════╝
  `);
