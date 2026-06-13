app.post('/create-checkout-session', async (req, res) => {
  try {
    const { amount, tip, total, campaignName } = req.body;

    if (!amount || amount < 5) {
      return res.status(400).json({ error: 'La donación mínima es de $5.00' });
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
      
      // ✅ URLs CORREGIDAS
      success_url: `https://gohelpyou.com/gracias`,
      cancel_url: `https://gohelpyou.com/?canceled=true`,
      
      metadata: {
        amount: amount.toString(),
        tip: (tip || 0).toString(),
        total: (total || amount).toString(),
        campaignName: campaignName || 'Donación',
      },
      locale: 'es-419',
    });

    res.json({ 
      url: session.url,
      sessionId: session.id 
    });

  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message });
  }
});
