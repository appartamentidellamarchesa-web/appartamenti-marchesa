// /functions/api/calendar.js
//
// Legge DIRETTAMENTE il calendario iCal di Booking.com (lato server) e restituisce
// solo gli intervalli di date occupate, senza nessun dato sull'ospite (niente nomi,
// niente dettagli prenotazione) — esattamente come richiesto per la privacy.
//
// Variabile d'ambiente richiesta:
//   BOOKING_ICAL_URL -> il link iCal che trovi nell'extranet Booking.com
//                       (Tariffe e disponibilità > Calendario > Sincronizza i calendari > Esporta calendario)

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      // cache breve lato browser/CDN: abbastanza corta da restare "sempre aggiornato",
      // abbastanza lunga da non martellare Booking.com ad ogni singola visita
      'Cache-Control': 'public, max-age=300',
    },
  });
}

function unfoldICal(text) {
  // nelle righe iCal, una riga che inizia con uno spazio o un tab è la continuazione
  // della riga precedente (sintassi di "line folding" dello standard iCal)
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function parseICalDate(value) {
  // formati gestiti: YYYYMMDD (giornata intera) oppure YYYYMMDDTHHMMSSZ (con orario)
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    return `${y}-${m}-${d}`;
  }
  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T/);
  if (dateTime) {
    const [, y, m, d] = dateTime;
    return `${y}-${m}-${d}`;
  }
  return null;
}

function parseICalEvents(icalText) {
  const text = unfoldICal(icalText);
  const lines = text.split('\n');
  const events = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT') {
      if (current && current.start && current.end) {
        events.push({ start: current.start, end: current.end });
      }
      current = null;
    } else if (current) {
      if (line.startsWith('DTSTART')) {
        const value = line.split(':').pop();
        current.start = parseICalDate(value);
      } else if (line.startsWith('DTEND')) {
        const value = line.split(':').pop();
        current.end = parseICalDate(value);
      }
      // nota: ignoriamo volutamente SUMMARY, DESCRIPTION e ogni altro campo
      // che potrebbe contenere il nome dell'ospite o dettagli della prenotazione
    }
  }
  return events;
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
  const { env } = context;

  if (!env.BOOKING_ICAL_URL) {
    return json({ error: 'Configurazione mancante (BOOKING_ICAL_URL).' }, 500);
  }

  try {
    const resp = await fetch(env.BOOKING_ICAL_URL);
    if (!resp.ok) {
      return json({ error: 'Impossibile leggere il calendario Booking.com in questo momento.' }, 502);
    }
    const icalText = await resp.text();
    const events = parseICalEvents(icalText);

    return json({ busy: events, updatedAt: new Date().toISOString() });
  } catch (err) {
    return json({ error: 'Errore nel recupero del calendario', detail: String(err) }, 502);
  }
}
