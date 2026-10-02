// /functions/api/booking-info.js
//
// Restituisce i dati essenziali di una prenotazione dato il suo token segreto.
// Usata dalle pagine pagamento.html e cancella.html per mostrare date e importo
// senza fidarsi di parametri nell'URL (che l'ospite potrebbe alterare).

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

  if (!token) {
    return json({ error: 'Token mancante' }, 400);
  }

  const row = await env.DB.prepare(
    `SELECT guest_name, checkin_date, checkout_date, amount_cents, currency, status
     FROM bookings WHERE token = ?`
  )
    .bind(token)
    .first();

  if (!row) {
    return json({ error: 'Prenotazione non trovata' }, 404);
  }

  // calcola se siamo entro il termine di cancellazione (48 ore prima del check-in, a mezzanotte UTC)
  const checkinMidnightUTC = new Date(row.checkin_date + 'T00:00:00Z').getTime();
  const cutoff = checkinMidnightUTC - 48 * 60 * 60 * 1000;
  const cancellable = Date.now() < cutoff && row.status === 'attiva';

  return json({
    guestName: row.guest_name,
    checkinDate: row.checkin_date,
    checkoutDate: row.checkout_date,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    cancellable,
  });
}
