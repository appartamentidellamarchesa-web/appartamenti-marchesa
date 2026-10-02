// /functions/api/confirm-authentication.js
//
// Dopo che l'ospite ha completato l'autenticazione 3D Secure nel browser
// (tramite stripe.confirmCardPayment), questo endpoint verifica DIRETTAMENTE
// con Stripe che il pagamento sia davvero andato a buon fine, prima di
// aggiornare lo stato della prenotazione — non ci si fida del solo browser.

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: 'Configurazione mancante (STRIPE_SECRET_KEY).' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Richiesta non valida' }, 400);
  }
  const { token } = body;
  if (!token) return json({ error: 'Token mancante' }, 400);

  const booking = await env.DB.prepare(
    `SELECT id, stripe_payment_intent_id, status FROM bookings WHERE token = ?`
  )
    .bind(token)
    .first();
  if (!booking) return json({ error: 'Prenotazione non trovata' }, 404);
  if (!booking.stripe_payment_intent_id) {
    return json({ error: 'Nessun pagamento in sospeso per questa prenotazione.' }, 400);
  }

  try {
    const resp = await fetch(
      `https://api.stripe.com/v1/payment_intents/${booking.stripe_payment_intent_id}`,
      { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } }
    );
    const data = await resp.json();

    if (data.status === 'succeeded') {
      await env.DB.prepare(
        `UPDATE bookings SET status = 'addebitata', updated_at = datetime('now') WHERE id = ?`
      )
        .bind(booking.id)
        .run();
      return json({ ok: true, status: 'addebitata' });
    }

    return json({
      ok: false,
      status: data.status,
      error: 'Il pagamento non risulta ancora completato. Riprova o contatta l\'host.',
    }, 400);
  } catch (err) {
    return json({ error: String(err.message || err) }, 502);
  }
}
