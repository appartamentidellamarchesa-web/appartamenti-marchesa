// /functions/api/checkin-submit.js
//
// Riceve il modulo di check-in (dati testuali + foto documenti) e lo inoltra
// via email tramite Resend, invece di affidarsi a un servizio terzo come
// FormSubmit. Il vantaggio principale: questo endpoint restituisce una vera
// risposta di successo/errore, quindi il sito può dire con certezza all'ospite
// (e registrare per l'host) se l'invio è andato a buon fine oppure no.
//
// Variabile d'ambiente richiesta:
//   RESEND_API_KEY -> la tua chiave API Resend (dashboard Resend > API Keys)

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.RESEND_API_KEY) {
    return json({ error: 'Configurazione mancante lato server (RESEND_API_KEY).' }, 500);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch (err) {
    return json({ error: 'Richiesta non valida' }, 400);
  }

  // anti-spam: se il campo nascosto "_honey" è compilato, è quasi certamente un bot.
  // Rispondiamo "ok" senza mandare nulla, così il bot non capisce di essere stato bloccato.
  const honey = formData.get('_honey');
  if (honey) {
    return json({ ok: true });
  }

  const textRows = [];
  const attachments = [];
  let totalAttachmentBytes = 0;
  const MAX_TOTAL_BYTES = 35 * 1024 * 1024; // margine di sicurezza sotto il limite di Resend

  for (const [key, value] of formData.entries()) {
    if (key === '_honey') continue;
    if (value instanceof File) {
      if (value.size === 0) continue;
      totalAttachmentBytes += value.size;
      if (totalAttachmentBytes > MAX_TOTAL_BYTES) {
        return json({ error: 'Gli allegati superano la dimensione massima consentita. Riprova con foto più leggere.' }, 400);
      }
      const buf = await value.arrayBuffer();
      attachments.push({
        filename: value.name || `${key}.jpg`,
        content: arrayBufferToBase64(buf),
      });
    } else {
      textRows.push([key, value]);
    }
  }

  const htmlRows = textRows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 12px;color:#5B5142;font-family:Arial,sans-serif;font-size:13px;border-bottom:1px solid #eee;white-space:nowrap;">${escapeHtml(k)}</td><td style="padding:6px 12px;font-weight:600;color:#3B342B;font-family:Arial,sans-serif;font-size:13px;border-bottom:1px solid #eee;">${escapeHtml(v)}</td></tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,sans-serif; max-width:600px;">
      <h2 style="color:#3B342B;">Dati check-in ospiti — Appartamenti della Marchesa</h2>
      <table style="border-collapse:collapse; width:100%;">${htmlRows}</table>
      <p style="color:#5B5142; font-size:12px; margin-top:16px;">
        Allegati: ${attachments.length} file (${(totalAttachmentBytes / (1024 * 1024)).toFixed(1)} MB totali)
      </p>
    </div>
  `;

  try {
    const resendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Check-in online <checkin@appartamentidellamarchesa.it>',
        to: ['appartamentidellamarchesa@gmail.com'],
        subject: 'Dati check-in ospiti — Appartamenti della Marchesa',
        html,
        attachments,
      }),
    });

    if (!resendResp.ok) {
      const detail = await resendResp.text();
      return json({ error: 'Invio email non riuscito. Riprova o contattaci direttamente.', detail }, 502);
    }
  } catch (err) {
    return json({ error: 'Errore di connessione al servizio email. Riprova tra poco.', detail: String(err) }, 502);
  }

  return json({ ok: true });
}
