require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// 🌐 CORS CONFIGURACIÓN
// ============================================
app.use(cors({
  origin: '*',
  credentials: true
}));

app.post('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// ============================================
// 🏠 RUTA DE PRUEBA
// ============================================
app.get('/', (req, res) => {
  res.json({ 
    status: 'ok',
    message: 'Backend funcionando',
    backend_url: 'https://stripe-backend-e2ig.onrender.com',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 🧪 ENDPOINT DE DIAGNÓSTICO
// ============================================
app.get('/diagnose', (req, res) => {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  
  res.json({
    backend_status: 'ok',
    api_key_configured: !!apiKey,
    api_key_prefix: apiKey ? apiKey.substring(0, 10) + '...' : 'NO CONFIGURADA',
    api_key_length: apiKey ? apiKey.length : 0,
    api_key_valid_format: apiKey ? apiKey.startsWith('sk_') : false,
    webhook_secret_configured: !!process.env.STRIPE_WEBHOOK_SECRET,
    node_version: process.version,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// 🎯 CREAR SESIÓN DE PAGO (CORREGIDO - SIN custom_text)
// ============================================
app.post('/create-checkout-session', async (req, res) => {
  console.log('📩 Nueva petición:', req.body);
  
  try {
    // Validar clave API
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      return res.status(500).json({ 
        error: 'STRIPE_SECRET_KEY no configurada en Render' 
      });
    }

    if (!apiKey.startsWith('sk_')) {
      return res.status(500).json({ 
        error: 'Formato de clave API inválido' 
      });
    }

    // Validar datos
    const { amount, tip, total, campaignName } = req.body;
    
    if (!amount || isNaN(amount) || amount < 5) {
      return res.status(400).json({ 
        error: 'Monto inválido. Mínimo $5.00' 
      });
    }

    // ✅ TÍTULO DE LA CAMPAÑA
    const tituloCampana = campaignName || 'Donación solidaria';
    
    // ✅ CALCULAR TOTAL
    const tipAmount = tip || 0;
    const totalAmount = amount + tipAmount;
    
    // ✅ CREAR STATEMENT DESCRIPTOR PERSONALIZADO
    // Reemplaza "LOZADANETWORK LLC" en el checkout de Stripe
    // Máximo 22 caracteres, solo letras, números y espacios
    const statementDescriptor = tituloCampana
      .replace(/[^\w\s]/g, '')  // Eliminar caracteres especiales
      .trim()
      .substring(0, 18);  // Máximo 18 caracteres
    
    // ✅ DESCRIPCIÓN DETALLADA
    const descripcionCampana = `Tu donación de $${amount.toFixed(2)} ayudará a cumplir el sueño de Cecilia y sus hijos. ¡Gracias por tu generosidad!`;

    // ✅ CONSTRUIR ITEMS PARA STRIPE
    const lineItems = [
      // ITEM 1: Donación principal con título de la campaña
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: tituloCampana,
            description: descripcionCampana,
            images: ['https://i.ibb.co/4Rrb1ZPR/IMG-5534115-2-1.jpg'],
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }
    ];

    // ITEM 2: Aporte voluntario (si existe)
    if (tipAmount > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Aporte voluntario a GoFundMe',
            description: `Gracias por apoyar la plataforma con $${tipAmount.toFixed(2)}.`,
          },
          unit_amount: Math.round(tipAmount * 100),
        },
        quantity: 1,
      });
    }

    console.log('🛒 Creando sesión con items:', {
      titulo: tituloCampana,
      amount: amount,
      tip: tipAmount,
      total: totalAmount
    });

    // ✅ CREAR SESIÓN DE STRIPE (SIN custom_text)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      
      // ✅ ESTO ES LO IMPORTANTE: Reemplaza "LOZADANETWORK LLC"
      payment_intent_data: {
        // Statement descriptor (aparece en el estado de cuenta de la tarjeta)
        statement_descriptor: statementDescriptor.toUpperCase(),
        
        // Sufijo adicional
        statement_descriptor_suffix: 'DONACION',
        
        // Descripción completa del pago
        description: `${tituloCampana} - Total: $${totalAmount.toFixed(2)} USD`,
        
        // Metadata para tu referencia
        metadata: {
          campaignName: tituloCampana,
          donationAmount: amount.toString(),
          tipAmount: tipAmount.toString(),
          totalAmount: totalAmount.toString(),
        }
      },
      
      // URLs de redirección
      success_url: `https://gohelpyou.com/graciasportudonativo?session_id={CHECKOUT_SESSION_ID}&amount=${amount}`,
      cancel_url: `https://gohelpyou.com/?canceled=true`,
      
      // Metadata de la sesión
      metadata: {
        amount: amount.toString(),
        tip: tipAmount.toString(),
        total: totalAmount.toString(),
        campaignName: tituloCampana,
      },
      
      // Configuración adicional
      locale: 'es-419',
      billing_address_collection: 'auto',
      
      // Opciones de método de pago
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
      total: totalAmount,
      campaignName: tituloCampana,
      statementDescriptor: statementDescriptor
    });

    res.json({ 
      url: session.url,
      sessionId: session.id 
    });

  } catch (error) {
    console.error('❌ ERROR COMPLETO:', {
      type: error.type,
      message: error.message,
      code: error.code,
      rawType: error.rawType
    });
    
    res.status(500).json({ 
      error: error.message,
      type: error.type,
      code: error.code
    });
  }
});

// ============================================
// 🔍 VERIFICAR PAGO
// ============================================
app.get('/verify-payment', async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'Session ID requerido' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    res.json({
      status: session.payment_status,
      amount: session.metadata.amount || (session.amount_total / 100).toString(),
      tip: session.metadata.tip || '0',
      total: session.metadata.total || (session.amount_total / 100).toString(),
      sessionId: session.id,
      customerEmail: session.customer_details?.email || null,
      paid: session.payment_status === 'paid'
    });

  } catch (error) {
    console.error('❌ Error verificando:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 🔔 WEBHOOK
// ============================================
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('✅ PAGO EXITOSO:', {
      sessionId: session.id,
      amount: session.amount_total / 100,
      currency: session.currency,
      customerEmail: session.customer_details?.email,
      metadata: session.metadata
    });
  }

  res.json({ received: true });
});

// ============================================
// 🚀 INICIAR SERVIDOR
// ============================================
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║  🚀 Servidor Stripe corriendo            ║
  ║  📍 Puerto: ${PORT}                         ║
  ║  🌐 URL: https://stripe-backend-e2ig.onrender.com
  ╚══════════════════════════════════════════╝
  `);
});
