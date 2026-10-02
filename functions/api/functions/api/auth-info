// /functions/api/auth-info.js
//
// Restituisce i dati necessari alla pagina autentica.html per completare
// un pagamento che richiede autenticazione 3D Secure: il client_secret
// del PaymentIntent già creato dal Worker di addebito automatico.

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
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return json({ error: 'Token mancante' }, 400);

  const row = await env.DB.prepare(
    `SELECT guest_name, checkin_date, checkout_date, amount_cents, currency, status, stripe_client_secret
     FROM bookings WHERE token = ?`
  )
    .bind(token)
    .first();

  if (!row) return json({ error: 'Prenotazione non trovata' }, 404);

  if (row.status !== 'richiede_autenticazione') {
    return json({
      status: row.status,
      guestName: row.guest_name,
      needsAuth: false,
    });
  }

  return json({
    status: row.status,
    guestName: row.guest_name,
    checkinDate: row.checkin_date,
    checkoutDate: row.checkout_date,
    amountCents: row.amount_cents,
    currency: row.currency,
    clientSecret: row.stripe_client_secret,
    needsAuth: true,
  });
}
