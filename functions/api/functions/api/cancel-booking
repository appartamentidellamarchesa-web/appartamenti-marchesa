// /functions/api/cancel-booking.js
//
// L'ospite cancella la propria prenotazione tramite il link segreto (token).
// Se mancano più di 48 ore al check-in, la cancellazione va a buon fine e
// nessun addebito verrà effettuato. Se mancano meno di 48 ore, la richiesta
// viene rifiutata con un messaggio chiaro: il soggiorno verrà comunque addebitato.

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
  const { token } = body;
  if (!token) return json({ error: 'Token mancante' }, 400);

  const booking = await env.DB.prepare(
    `SELECT id, checkin_date, status FROM bookings WHERE token = ?`
  )
    .bind(token)
    .first();

  if (!booking) return json({ error: 'Prenotazione non trovata' }, 404);

  if (booking.status === 'cancellata') {
    return json({ ok: true, alreadyCancelled: true });
  }
  if (booking.status === 'addebitata' || booking.status === 'addebito_fallito' || booking.status === 'richiede_autenticazione') {
    return json({
      error: 'Il soggiorno risulta già in fase di addebito: non è più possibile cancellare questa prenotazione autonomamente. Contattaci direttamente per qualsiasi necessità.',
    }, 400);
  }

  const checkinMidnightUTC = new Date(booking.checkin_date + 'T00:00:00Z').getTime();
  const cutoff = checkinMidnightUTC - 48 * 60 * 60 * 1000;

  if (Date.now() >= cutoff) {
    return json({
      error:
        'Il termine per cancellare gratuitamente (48 ore prima del check-in) è scaduto. Il soggiorno verrà addebitato regolarmente.',
      pastDeadline: true,
    }, 400);
  }

  await env.DB.prepare(
    `UPDATE bookings SET status = 'cancellata', updated_at = datetime('now') WHERE id = ?`
  )
    .bind(booking.id)
    .run();

  return json({ ok: true });
}
