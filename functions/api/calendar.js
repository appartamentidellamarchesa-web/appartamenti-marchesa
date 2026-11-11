// /functions/api/calendar.js
//
// Legge DIRETTAMENTE i calendari iCal di Booking.com e Airbnb (lato server), li unisce
// e restituisce solo gli intervalli di date occupate, senza nessun dato sull'ospite (niente nomi,
// niente dettagli prenotazione) — esattamente come richiesto per la privacy.
//
// Variabili d'ambiente (almeno una delle due):
//   BOOKING_ICAL_URL -> il link iCal dell'extranet Booking.com
//   AIRBNB_ICAL_URL  -> il link iCal di Airbnb (Calendario > Disponibilità > Sincronizza calendari > Esporta)
//                       contiene un codice segreto: va salvato come Secret su Cloudflare, mai nel codice

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

async function fetchFeed(name, url) {
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (calendar-sync)' } });
  if (!resp.ok) throw new Error(`${name}: HTTP ${resp.status}`);
  return parseICalEvents(await resp.text());
}

export async function onRequestGet(context) {
  const { env } = context;

  // Calendari da unire: ognuno è opzionale, ma ne serve almeno uno.
  const feeds = [
    ['Booking.com', env.BOOKING_ICAL_URL],
    ['Airbnb', env.AIRBNB_ICAL_URL],
  ].filter(([, url]) => url);

  if (feeds.length === 0) {
    return json({ error: 'Configurazione mancante (BOOKING_ICAL_URL / AIRBNB_ICAL_URL).' }, 500);
  }

  const results = await Promise.allSettled(feeds.map(([name, url]) => fetchFeed(name, url)));

  const busy = [];
  const failed = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') busy.push(...r.value);
    else failed.push(feeds[i][0]);
  });

  if (failed.length === feeds.length) {
    return json({ error: 'Impossibile leggere i calendari in questo momento.' }, 502);
  }

  // Se un solo calendario non risponde mostriamo comunque l'altro, ma segnaliamo
  // il problema e non lo teniamo in cache a lungo.
  const body = { busy, updatedAt: new Date().toISOString() };
  if (failed.length) body.warning = 'Calendario non raggiungibile: ' + failed.join(', ');
  return json(body, 200);
}
