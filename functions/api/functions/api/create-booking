// /functions/api/create-booking.js
//
// Uso: solo tu (l'host) chiami questo endpoint, dalla pagina admin.html,
// per registrare una prenotazione confermata con importo e date.
// Protetto da un codice segreto (ADMIN_SECRET) impostato come variabile d'ambiente.
//
// Variabili d'ambiente richieste:
//   ADMIN_SECRET  -> stringa segreta a tua scelta, la stessa che userai su admin.html

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function generateToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ADMIN_SECRET) {
    return json({ error: 'Configurazione mancante (ADMIN_SECRET).' }, 500);
  }
  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${env.ADMIN_SECRET}`) {
    return json({ error: 'Non autorizzato' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Richiesta non valida' }, 400);
  }

  const { guestName, guestEmail, checkinDate, checkoutDate, amountEuros } = body;

  if (!guestName || !guestEmail || !checkinDate || !checkoutDate || !amountEuros) {
    return json({ error: 'Compila tutti i campi richiesti.' }, 400);
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(guestEmail)) {
    return json({ error: 'Email non valida' }, 400);
  }
  const amountCents = Math.round(parseFloat(amountEuros) * 100);
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return json({ error: 'Importo non valido' }, 400);
  }
  if (checkoutDate <= checkinDate) {
    return json({ error: 'La data di partenza deve essere dopo l\'arrivo' }, 400);
  }

  const token = generateToken();

  try {
    await env.DB.prepare(
      `INSERT INTO bookings (token, guest_name, guest_email, checkin_date, checkout_date, amount_cents, status)
       VALUES (?, ?, ?, ?, ?, ?, 'in_attesa_carta')`
    )
      .bind(token, guestName, guestEmail, checkinDate, checkoutDate, amountCents)
      .run();
  } catch (err) {
    return json({ error: 'Errore nel salvataggio', detail: String(err) }, 500);
  }

  return json({
    token,
    paymentLink: `https://appartamentidellamarchesa.it/pagamento.html?token=${token}`,
    cancelLink: `https://appartamentidellamarchesa.it/cancella.html?token=${token}`,
  });
}
