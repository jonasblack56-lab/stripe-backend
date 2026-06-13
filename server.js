// ============================================
// 🎯 CREAR SESIÓN DE PAGO (CON VALIDACIÓN)
// ============================================
app.post('/create-checkout-session', async (req, res) => {
  try {
    // ✅ VALIDAR QUE LA CLAVE API EXISTA
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('❌ STRIPE_SECRET_KEY no está configurada');
      return res.status(500).json({ 
        error: 'Clave API de Stripe no configurada. Contacta al administrador.' 
      });
    }

    // ✅ VALIDAR FORMATO DE LA CLAVE
    const apiKey = process.env.STRIPE_SECRET_KEY.trim();
    if (!apiKey.startsWith('sk_')) {
      console.error('❌ Clave API inválida:', apiKey.substring(0, 10) + '...');
      return res.status(500).json({ 
        error: 'Formato de clave API inválido. Debe empezar con sk_test_ o sk_live_' 
      });
    }

    const { amount, tip, total, campaignName } = req.body;

    if (!amount || amount < 5) {
      return res.status(400).json({ 
        error: 'La donación mínima es de $5.00' 
      });
    }

    const lineItems = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: campaignName || 'Donación',
            description: 'Tu generosidad hace la diferencia',
          },
          unit_amount: Math.round(amount * 100),
        },
        quantity: 1,
      }
    ];

    if (tip && tip > 0) {
      lineItems.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Aporte voluntario a GoFundMe',
          },
          unit_amount: Math.round(tip * 100),
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: `https://gohelpyou.com/graciasportudonativo?session_id={CHECKOUT_SESSION_ID}&amount=${amount}`,
      cancel_url: `https://gohelpyou.com/?canceled=true`,
      metadata: {
        amount: amount.toString(),
        tip: (tip || 0).toString(),
        total: (total || amount).toString(),
        campaignName: campaignName || 'Donación',
      },
      locale: 'es-419',
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
    console.error('❌ Error creando sesión:', {
      message: error.message,
      type: error.type,
      code: error.code
    });
    
    // ✅ MENSAJES DE ERROR MÁS CLAROS
    if (error.type === 'StripeAuthenticationError') {
      return res.status(401).json({ 
        error: 'Clave API de Stripe inválida. Verifica la configuración en Render.' 
      });
    }
    
    if (error.type === 'StripePermissionError') {
      return res.status(403).json({ 
        error: 'Permisos insuficientes. Verifica que la clave API tenga los permisos correctos.' 
      });
    }
    
    res.status(500).json({ 
      error: error.message || 'Error al crear la sesión de pago' 
    });
  }
});
