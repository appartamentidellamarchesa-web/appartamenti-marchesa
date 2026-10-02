// /functions/api/create-setup-intent.js
//
// Crea (o riusa) un Cliente Stripe per la prenotazione e un SetupIntent,
// che permette di salvare la carta dell'ospite SENZA addebitare nulla subito.
// Il client_secret restituito viene usato da Stripe.js nella pagina pagamento.html.
//
// Variabili d'ambiente richieste:
//   STRIPE_SECRET_KEY -> chiave segreta del tuo account Stripe (dashboard Stripe > Developers > API keys)

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

async function stripeFetch(env, path, params) {
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(params).toString(),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(data.error?.message || 'Errore Stripe');
  }
  return data;
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
    `SELECT id, guest_name, guest_email, stripe_customer_id, status FROM bookings WHERE token = ?`
  )
    .bind(token)
    .first();

  if (!booking) return json({ error: 'Prenotazione non trovata' }, 404);
  if (booking.status === 'cancellata') {
    return json({ error: 'Questa prenotazione è stata cancellata.' }, 400);
  }

  try {
    let customerId = booking.stripe_customer_id;
    if (!customerId) {
      const customer = await stripeFetch(env, 'customers', {
        name: booking.guest_name,
        email: booking.guest_email,
      });
      customerId = customer.id;
      await env.DB.prepare(`UPDATE bookings SET stripe_customer_id = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(customerId, booking.id)
        .run();
    }

    const setupIntent = await stripeFetch(env, 'setup_intents', {
      customer: customerId,
      'payment_method_types[]': 'card',
      usage: 'off_session',
    });

    return json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    return json({ error: String(err.message || err) }, 502);
  }
}
