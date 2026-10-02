// /functions/api/confirm-booking.js
//
// Dopo che Stripe.js ha confermato il SetupIntent lato browser (carta salvata),
// questo endpoint registra il metodo di pagamento e conferma definitivamente
// la prenotazione (status -> 'attiva').

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

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Richiesta non valida' }, 400);
  }
  const { token, paymentMethodId } = body;
  if (!token || !paymentMethodId) {
    return json({ error: 'Dati mancanti' }, 400);
  }

  const booking = await env.DB.prepare(`SELECT id, status FROM bookings WHERE token = ?`)
    .bind(token)
    .first();
  if (!booking) return json({ error: 'Prenotazione non trovata' }, 404);
  if (booking.status === 'cancellata') {
    return json({ error: 'Questa prenotazione è stata cancellata.' }, 400);
  }

  await env.DB.prepare(
    `UPDATE bookings SET stripe_payment_method_id = ?, status = 'attiva', updated_at = datetime('now') WHERE id = ?`
  )
    .bind(paymentMethodId, booking.id)
    .run();

  return json({ ok: true });
}
