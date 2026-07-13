'use strict';

const SITE_URL = process.env.SITE_URL || 'https://chunkzthebrand.com';

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function rawFirst(fullName) {
  return String((fullName || 'friend').split(' ')[0]).slice(0, 40);
}

function htmlFirst(fullName) {
  return escHtml(rawFirst(fullName));
}

function fmtNGN(amount) {
  return '&#8358;' + Number(amount || 0).toLocaleString('en-NG');
}

function primaryItem(items) {
  return (Array.isArray(items) && items.length > 0 && items[0]) || {};
}

function ctaButton(label, url, bgColor) {
  const bg = bgColor || '#e63946';
  const textColor = bgColor ? '#aaaaaa' : '#ffffff';
  return `
<tr>
  <td align="center" style="padding:10px 32px 0;">
    <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;max-width:496px;">
      <tr>
        <td align="center" bgcolor="${bg}" style="border-radius:6px;${bgColor ? 'border:1px solid #333333;' : ''}">
          <a href="${url}" target="_blank" style="display:block;padding:15px 28px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${textColor};text-decoration:none;">${label}</a>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

function emailWrapper({ preheader, token, bodyRows }) {
  const unsubUrl = SITE_URL + '/api/opt-out-confirm?token=' + token;
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>Chunkz</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
* { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }
body { margin:0; padding:0; background-color:#0a0a0a; word-break:break-word; }
table, td { mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse; }
a[x-apple-data-detectors] { color:inherit!important; text-decoration:none!important; }
@media only screen and (max-width:600px) {
  .ew { padding:0!important; }
  .ec { border-radius:0!important; }
  .cp { padding-left:20px!important; padding-right:20px!important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0a0a0a;">${escHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#0a0a0a;">
  <tr>
    <td align="center" class="ew" style="padding:32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:560px;" class="ec">

        <!-- brand header -->
        <tr>
          <td bgcolor="#e63946" style="border-radius:10px 10px 0 0;padding:18px 32px;text-align:center;">
            <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:22px;font-weight:900;letter-spacing:7px;color:#ffffff;text-transform:uppercase;">CHUNKZ</span>
          </td>
        </tr>

        <!-- card body -->
        <tr>
          <td bgcolor="#111111" style="border-radius:0 0 10px 10px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
              ${bodyRows}

              <!-- spacer -->
              <tr><td style="height:20px;"></td></tr>

              <!-- footer -->
              <tr>
                <td class="cp" style="padding:20px 32px;border-top:1px solid #1e1e1e;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                    <tr>
                      <td align="center">
                        <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#444444;line-height:1.5;">Chunkz &middot; Urban streetwear. Nationwide.</p>
                        <a href="${unsubUrl}" style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#444444;text-decoration:underline;">Unsubscribe from follow-up emails</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

// ── Day 0 — Delivered confirmation ────────────────────────────────────────────
function buildDay0({ token, customerName, orderRef, items, totalNGN, colourPreference }) {
  const name = htmlFirst(customerName);
  const item = primaryItem(items);
  const productName = escHtml(item.name || item.collection || 'your order');
  const size = item.size ? escHtml(item.size) : '';
  const colour = colourPreference ? escHtml(colourPreference) : '';
  const badge = [size, colour].filter(Boolean).join(' &middot; ');
  const followUpUrl = SITE_URL + '/follow-up/' + token;

  const itemRows = (Array.isArray(items) && items.length > 0)
    ? items.map(it => {
        const n = escHtml(it.name || it.collection || 'Item');
        const s = it.size ? ` &mdash; ${escHtml(it.size)}` : '';
        const q = (it.qty && it.qty > 1) ? ` &times;${it.qty}` : '';
        return `<tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#cccccc;padding:3px 0;line-height:1.5;">${n}${s}${q}</td></tr>`;
      }).join('')
    : `<tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#cccccc;padding:3px 0;">${productName}${badge ? ' &mdash; ' + badge : ''}</td></tr>`;

  const bodyRows = `
<tr>
  <td class="cp" style="padding:36px 32px 0;">
    <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#e63946;">IT&rsquo;S HERE.</p>
    <p style="margin:0 0 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.25;">${name}, your <span style="color:#e63946;">${productName}</span>${badge ? ' <span style="font-size:16px;color:#888888;font-weight:400;">(' + badge + ')</span>' : ''} has been delivered.</p>
    <p style="margin:0 0 28px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#888888;line-height:1.6;">Thank you for rocking with Chunkz &mdash; for real.</p>
  </td>
</tr>

<tr>
  <td class="cp" style="padding:0 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#181818;border-radius:8px;">
      <tr>
        <td style="padding:14px 18px 0;border-bottom:1px solid #222222;">
          <p style="margin:0 0 12px;font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#555555;">YOUR ORDER</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 18px;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation">
            ${itemRows}
          </table>
          <p style="margin:10px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#555555;">
            ${orderRef ? escHtml(String(orderRef)) + (totalNGN ? ' &middot; ' : '') : ''}${totalNGN ? fmtNGN(totalNGN) : ''}
          </p>
        </td>
      </tr>
    </table>
  </td>
</tr>

<tr>
  <td class="cp" style="padding:24px 32px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-left:3px solid #e63946;background-color:#141414;border-radius:0 6px 6px 0;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#e63946;">KEEP IT FRESH</p>
          <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#888888;line-height:1.65;">Cold wash, inside out and air dry. Iron on reverse. Treat it right and it&rsquo;ll outlast the hype.</p>
        </td>
      </tr>
    </table>
  </td>
</tr>

<tr>
  <td class="cp" style="padding:22px 32px 0;">
    <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#666666;line-height:1.6;">Wearing it? Tag us <a href="https://instagram.com/chunkz_thebrand" style="color:#e63946;text-decoration:none;font-weight:700;">@chunkz_thebrand</a> and we will repost.</p>
  </td>
</tr>

${ctaButton('VIEW YOUR ORDER &rarr;', followUpUrl)}`;

  return {
    subject: 'Your Chunkz just landed 📦',
    html: emailWrapper({ preheader: `Thanks for rocking with us, ${rawFirst(customerName)}.`, token, bodyRows }),
  };
}

// ── Day 3 — Check-in ──────────────────────────────────────────────────────────
function buildDay3({ token, customerName, items, colourPreference }) {
  const name = htmlFirst(customerName);
  const item = primaryItem(items);
  const productName = escHtml(item.name || item.collection || 'your order');
  const positiveUrl = SITE_URL + '/follow-up/' + token + '?r=positive';
  const negativeUrl = SITE_URL + '/follow-up/' + token + '?r=negative';

  const bodyRows = `
<tr>
  <td class="cp" style="padding:36px 32px 0;">
    <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#e63946;">3 DAYS IN.</p>
    <p style="margin:0 0 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.25;">${name}, how&rsquo;s the <span style="color:#e63946;">${productName}</span> working out?</p>
    <p style="margin:0 0 28px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#888888;line-height:1.6;">Fit right? Feeling good? Tap below and let us know &mdash; takes 10 seconds. If something&rsquo;s off, we want to hear it first.</p>
  </td>
</tr>

<tr>
  <td class="cp" style="padding:0 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
      <tr>
        <td width="49%" align="center">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;">
            <tr>
              <td align="center" bgcolor="#e63946" style="border-radius:6px;">
                <a href="${positiveUrl}" target="_blank" style="display:block;padding:14px 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:1.5px;color:#ffffff;text-decoration:none;text-align:center;">LOVING IT &#x1F525;</a>
              </td>
            </tr>
          </table>
        </td>
        <td width="2%"></td>
        <td width="49%" align="center">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation" style="width:100%;">
            <tr>
              <td align="center" bgcolor="#1a1a1a" style="border-radius:6px;border:1px solid #2a2a2a;">
                <a href="${negativeUrl}" target="_blank" style="display:block;padding:14px 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:700;letter-spacing:1.5px;color:#888888;text-decoration:none;text-align:center;">NOT QUITE &#x1F615;</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </td>
</tr>

<tr>
  <td class="cp" style="padding:20px 32px 0;">
    <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#444444;text-align:center;font-style:italic;">Real feedback from real people. That&rsquo;s how we get better.</p>
  </td>
</tr>`;

  const rawItem = item.name || item.collection || 'your order';
  return {
    subject: `How’s the ${rawItem} treating you? 👀`,
    html: emailWrapper({ preheader: 'Be honest — we can take it.', token, bodyRows }),
  };
}

// ── Day 6 — Review request ────────────────────────────────────────────────────
function buildDay6({ token, customerName, items }) {
  const name = htmlFirst(customerName);
  const item = primaryItem(items);
  const productName = escHtml(item.name || item.collection || 'your order');
  const followUpUrl = SITE_URL + '/follow-up/' + token;

  const bodyRows = `
<tr>
  <td class="cp" style="padding:36px 32px 0;">
    <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#e63946;">DROP US A REVIEW.</p>
    <p style="margin:0 0 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.25;">You&rsquo;ve had the <span style="color:#e63946;">${productName}</span> for about a week now.</p>
    <p style="margin:0 0 28px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#888888;line-height:1.6;">If it&rsquo;s been good to you, a quick review goes a long way. Thirty seconds. Star rating, few words. That&rsquo;s it.</p>
  </td>
</tr>

<tr>
  <td class="cp" style="padding:0 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#181818;border-radius:8px;">
      <tr>
        <td align="center" style="padding:22px 20px;">
          <p style="margin:0 0 8px;font-size:32px;letter-spacing:6px;line-height:1;">&#x2B50;&#x2B50;&#x2B50;&#x2B50;&#x2B50;</p>
          <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#555555;">Tap the button below to leave your rating</p>
        </td>
      </tr>
    </table>
  </td>
</tr>

${ctaButton('LEAVE A REVIEW &rarr;', followUpUrl)}

<tr>
  <td class="cp" style="padding:18px 32px 0;">
    <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#444444;text-align:center;font-style:italic;">Every review helps someone else find their fit.</p>
  </td>
</tr>`;

  return {
    subject: `Got 30 seconds, ${rawFirst(customerName)}? ⭐`,
    html: emailWrapper({ preheader: 'Your review helps the next person pull the trigger.', token, bodyRows }),
  };
}

// ── Day 8 — Upsell + promo ────────────────────────────────────────────────────
function buildDay8({ token, customerName, items, upsell, promo }) {
  const name = htmlFirst(customerName);
  const item = primaryItem(items);
  const productName = escHtml(item.name || item.collection || 'your order');
  const followUpUrl = SITE_URL + '/follow-up/' + token;

  const rec     = upsell || {};
  const recName = escHtml(rec.name || 'New Chunkz Drop');
  const pitch   = escHtml(rec.pitch || 'Something new just dropped in the store. Built with the same quality. Made to match.');
  const promoCode = escHtml((promo && promo.code) || 'CHUNKZ15');

  const priceRow = (promo && promo.originalPrice && promo.discountedPrice)
    ? `<p style="margin:4px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;"><s style="color:#555555;">${fmtNGN(promo.originalPrice)}</s>&nbsp;<span style="color:#2a9d8f;font-weight:700;">${fmtNGN(promo.discountedPrice)}</span></p>`
    : rec.priceNGN
      ? `<p style="margin:4px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#2a9d8f;font-weight:700;">${fmtNGN(rec.priceNGN)}</p>`
      : '';

  const productImageRow = rec.imageUrl ? `
<tr>
  <td class="cp" style="padding:0 32px 0;">
    <img src="${rec.imageUrl}" alt="${recName}" width="496" style="width:100%;max-width:496px;height:auto;border-radius:8px 8px 0 0;display:block;" />
  </td>
</tr>` : '';

  const bodyRows = `
<tr>
  <td class="cp" style="padding:36px 32px 0;">
    <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#e63946;">BUILT TO MATCH.</p>
    <p style="margin:0 0 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.25;">Since you copped the <span style="color:#e63946;">${productName}</span>, we think this is your next move.</p>
    <p style="margin:0 0 28px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#888888;line-height:1.6;">${pitch}</p>
  </td>
</tr>

${productImageRow}
<tr>
  <td class="cp" style="padding:0 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#181818;border-radius:${rec.imageUrl ? '0 0 8px 8px' : '8px'};">
      <tr>
        <td style="padding:18px 20px;">
          <p style="margin:0 0 2px;font-family:'Segoe UI',Arial,sans-serif;font-size:16px;font-weight:800;color:#ffffff;">${recName}</p>
          ${priceRow}
        </td>
      </tr>
    </table>
  </td>
</tr>

<tr>
  <td class="cp" style="padding:16px 32px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#0f1a18;border-radius:8px;border:1px solid #1a3a33;">
      <tr>
        <td align="center" style="padding:22px 20px;">
          <p style="margin:0 0 8px;font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#2a9d8f;">YOUR CODE</p>
          <p style="margin:0 0 8px;font-family:'Courier New',Courier,monospace;font-size:30px;font-weight:900;letter-spacing:8px;color:#ffffff;">${promoCode}</p>
          <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#555555;">15% off &middot; Expires in 72 hours &middot; One use</p>
        </td>
      </tr>
    </table>
  </td>
</tr>

${ctaButton('CLAIM 15% OFF &rarr;', followUpUrl)}

<tr>
  <td class="cp" style="padding:24px 32px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-top:1px solid #1e1e1e;">
      <tr>
        <td style="padding:20px 0 0;">
          <p style="margin:0 0 8px;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;font-weight:700;color:#888888;">NOT FOR YOU?</p>
          <p style="margin:0 0 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#555555;line-height:1.6;">Pass the code to a friend before it expires &mdash; they get 15% off, you look like the plug. One use, first come first served.</p>
        </td>
      </tr>
    </table>
  </td>
</tr>

${ctaButton('SHARE THE CODE &rarr;', followUpUrl, '#1a1a1a')}

<tr>
  <td class="cp" style="padding:16px 32px 0;">
    <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#444444;text-align:center;font-style:italic;">Once it&rsquo;s gone, it&rsquo;s gone.</p>
  </td>
</tr>`;

  const rawItem = item.name || item.collection || 'your order';
  return {
    subject: `${rawFirst(customerName)}, this pairs with your ${rawItem} 🔥 15% off`,
    html: emailWrapper({ preheader: 'Your code expires in 72 hours.', token, bodyRows }),
  };
}

// ── Transactional wrapper (no unsubscribe — order status emails) ───────────────
function transactionalWrapper({ preheader, bodyRows }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<title>Chunkz</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
* { -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%; }
body { margin:0; padding:0; background-color:#0a0a0a; word-break:break-word; }
table, td { mso-table-lspace:0; mso-table-rspace:0; border-collapse:collapse; }
a[x-apple-data-detectors] { color:inherit!important; text-decoration:none!important; }
@media only screen and (max-width:600px) {
  .ew { padding:0!important; }
  .ec { border-radius:0!important; }
  .cp { padding-left:20px!important; padding-right:20px!important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;">
<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#0a0a0a;">${escHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#0a0a0a;">
  <tr>
    <td align="center" class="ew" style="padding:32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="max-width:560px;" class="ec">

        <!-- brand header -->
        <tr>
          <td bgcolor="#e63946" style="border-radius:10px 10px 0 0;padding:18px 32px;text-align:center;">
            <span style="font-family:'Segoe UI',Arial,sans-serif;font-size:22px;font-weight:900;letter-spacing:7px;color:#ffffff;text-transform:uppercase;">CHUNKZ</span>
          </td>
        </tr>

        <!-- card body -->
        <tr>
          <td bgcolor="#111111" style="border-radius:0 0 10px 10px;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
              ${bodyRows}

              <!-- spacer -->
              <tr><td style="height:20px;"></td></tr>

              <!-- footer -->
              <tr>
                <td class="cp" style="padding:20px 32px;border-top:1px solid #1e1e1e;">
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation">
                    <tr>
                      <td align="center">
                        <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#444444;line-height:1.5;">Chunkz &middot; Urban streetwear. Nationwide.</p>
                        <a href="${SITE_URL}" style="font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#444444;text-decoration:underline;">Visit the store</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </table>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

function orderItemRows(items, fallbackName) {
  if (Array.isArray(items) && items.length > 0) {
    return items.map(it => {
      const n = escHtml(it.name || it.collection || 'Item');
      const s = it.size ? ` &mdash; ${escHtml(it.size)}` : '';
      const q = (it.qty && it.qty > 1) ? ` &times;${it.qty}` : '';
      return `<tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#cccccc;padding:3px 0;line-height:1.5;">${n}${s}${q}</td></tr>`;
    }).join('');
  }
  return `<tr><td style="font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#cccccc;padding:3px 0;">${escHtml(fallbackName || 'Your item')}</td></tr>`;
}

function orderSummaryBlock({ items, orderRef, totalNGN, label }) {
  const heading = label || 'YOUR ORDER';
  return `
<tr>
  <td class="cp" style="padding:0 32px;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#181818;border-radius:8px;">
      <tr>
        <td style="padding:14px 18px 0;border-bottom:1px solid #222222;">
          <p style="margin:0 0 12px;font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#555555;">${heading}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 18px;">
          <table cellpadding="0" cellspacing="0" border="0" role="presentation">
            ${orderItemRows(items)}
          </table>
          <p style="margin:10px 0 0;font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#555555;">
            ${orderRef ? escHtml(String(orderRef)) + (totalNGN ? ' &middot; ' : '') : ''}${totalNGN ? fmtNGN(totalNGN) : ''}
          </p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

// ── Awaiting Payment reminders — 1hr / 12hr / 24hr (cron-triggered) ──────────
const AWAITING_STAGE = {
  h1: {
    label:    'YOU LEFT SOMETHING.',
    headline: (name) => `${name}, you left an order behind.`,
    body:     'You started a Chunkz order but didn&rsquo;t complete payment. Your items are still here &mdash; grab them before they&rsquo;re gone.',
    subject:  (first) => `${first}, you left something behind 👋`,
    preheader: 'Your items are still waiting for you.',
  },
  h12: {
    label:    'STILL WAITING.',
    headline: (name) => `${name}, your order is waiting for payment.`,
    body:     'We received your order but haven&rsquo;t been able to confirm payment yet. Head back to complete your checkout.',
    subject:  (first) => `${first}, your order is waiting for payment 👀`,
    preheader: 'Complete your Chunkz order — we&rsquo;re holding your items.',
  },
  h24: {
    label:    'LAST CHANCE.',
    headline: (name) => `${name}, this is your final reminder.`,
    body:     'We&rsquo;ve been holding your order for 24 hours. Please complete your payment today, we dont want to lose your items.',
    subject:  (first) => `Hey Buddy — complete your Chunkz order today 🔥`,
    preheader: 'Reminder — Please complete your order today.',
  },
};

function buildAwaitingPaymentReminder({ customerName, orderRef, items, totalNGN, stage }) {
  const name  = htmlFirst(customerName);
  const cfg   = AWAITING_STAGE[stage] || AWAITING_STAGE.h12;

  const bodyRows = `
<tr>
  <td class="cp" style="padding:36px 32px 0;">
    <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#e63946;">${cfg.label}</p>
    <p style="margin:0 0 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.25;">${cfg.headline(name)}</p>
    <p style="margin:0 0 28px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#888888;line-height:1.6;">${cfg.body}</p>
  </td>
</tr>

${orderSummaryBlock({ items, orderRef, totalNGN, label: 'YOUR PENDING ORDER' })}

${ctaButton('COMPLETE YOUR ORDER &rarr;', SITE_URL)}

<tr>
  <td class="cp" style="padding:18px 32px 0;">
    <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#444444;text-align:center;line-height:1.6;">Questions? Reach us on Instagram <a href="https://instagram.com/chunkz_thebrand" style="color:#e63946;text-decoration:none;font-weight:700;">@chunkz_thebrand</a></p>
  </td>
</tr>`;

  return {
    subject: cfg.subject(rawFirst(customerName)),
    html: transactionalWrapper({ preheader: cfg.preheader, bodyRows }),
  };
}

// ── Confirmed ─────────────────────────────────────────────────────────────────
function buildConfirmed({ customerName, orderRef, items, totalNGN }) {
  const name = htmlFirst(customerName);

  const bodyRows = `
<tr>
  <td class="cp" style="padding:36px 32px 0;">
    <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#e63946;">CONFIRMED.</p>
    <p style="margin:0 0 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.25;">${name}, your order is confirmed. We&rsquo;ve got you.</p>
    <p style="margin:0 0 28px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#888888;line-height:1.6;">Payment received and order locked in. We&rsquo;ll start getting it ready and keep you posted every step of the way.</p>
  </td>
</tr>

${orderSummaryBlock({ items, orderRef, totalNGN })}

<tr>
  <td class="cp" style="padding:24px 32px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-left:3px solid #2a9d8f;background-color:#141414;border-radius:0 6px 6px 0;">
      <tr>
        <td style="padding:14px 16px;">
          <p style="margin:0 0 4px;font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#2a9d8f;">WHAT&rsquo;S NEXT</p>
          <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#888888;line-height:1.65;">We&rsquo;ll send another update when your order starts processing. Sit tight.</p>
        </td>
      </tr>
    </table>
  </td>
</tr>`;

  return {
    subject: `Order confirmed! We've got you 🙌`,
    html: transactionalWrapper({ preheader: `Your Chunkz order is confirmed — we're on it.`, bodyRows }),
  };
}

// ── Processing ────────────────────────────────────────────────────────────────
function buildProcessing({ customerName, orderRef, items, totalNGN }) {
  const name = htmlFirst(customerName);

  const bodyRows = `
<tr>
  <td class="cp" style="padding:36px 32px 0;">
    <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#e63946;">IN THE WORKS.</p>
    <p style="margin:0 0 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.25;">${name}, we&rsquo;re prepping your order right now.</p>
    <p style="margin:0 0 28px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#888888;line-height:1.6;">Your Chunkz is being packed and prepared. We&rsquo;ll hit you again the moment it ships.</p>
  </td>
</tr>

${orderSummaryBlock({ items, orderRef, totalNGN })}

<tr>
  <td class="cp" style="padding:24px 32px 0;">
    <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#666666;line-height:1.6;text-align:center;">Keep an eye on your inbox &mdash; dispatch update coming soon.</p>
  </td>
</tr>`;

  return {
    subject: `We're prepping your Chunkz order 🧢`,
    html: transactionalWrapper({ preheader: `Your order is being packed right now.`, bodyRows }),
  };
}

// ── Dispatched ────────────────────────────────────────────────────────────────
function buildDispatched({ customerName, orderRef, items, totalNGN, trackingNumber }) {
  const name = htmlFirst(customerName);
  const item = primaryItem(items);
  const productName = escHtml(item.name || item.collection || 'your order');

  const trackingBlock = trackingNumber ? `
<tr>
  <td class="cp" style="padding:16px 32px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" role="presentation" style="background-color:#0f1a18;border-radius:8px;border:1px solid #1a3a33;">
      <tr>
        <td align="center" style="padding:18px 20px;">
          <p style="margin:0 0 4px;font-family:'Segoe UI',Arial,sans-serif;font-size:9px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#2a9d8f;">TRACKING NUMBER</p>
          <p style="margin:0;font-family:'Courier New',Courier,monospace;font-size:20px;font-weight:900;letter-spacing:4px;color:#ffffff;">${escHtml(trackingNumber)}</p>
        </td>
      </tr>
    </table>
  </td>
</tr>` : '';

  const bodyRows = `
<tr>
  <td class="cp" style="padding:36px 32px 0;">
    <p style="margin:0 0 6px;font-family:'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#e63946;">ON ITS WAY.</p>
    <p style="margin:0 0 16px;font-family:'Segoe UI',Arial,sans-serif;font-size:24px;font-weight:800;color:#ffffff;line-height:1.25;">${name}, your <span style="color:#e63946;">${productName}</span> has been dispatched.</p>
    <p style="margin:0 0 28px;font-family:'Segoe UI',Arial,sans-serif;font-size:15px;color:#888888;line-height:1.6;">Your order is on its way. Expect delivery within the next few days.</p>
  </td>
</tr>

${orderSummaryBlock({ items, orderRef, totalNGN })}

${trackingBlock}

<tr>
  <td class="cp" style="padding:24px 32px 0;">
    <p style="margin:0;font-family:'Segoe UI',Arial,sans-serif;font-size:14px;color:#666666;line-height:1.6;">Once it lands, wear it with pride. Tag us <a href="https://instagram.com/chunkz_thebrand" style="color:#e63946;text-decoration:none;font-weight:700;">@chunkz_thebrand</a> 🔥</p>
  </td>
</tr>`;

  return {
    subject: `Your Chunkz is on its way 🚚`,
    html: transactionalWrapper({ preheader: `Your order has been dispatched. It's almost time.`, bodyRows }),
  };
}

module.exports = { buildDay0, buildDay3, buildDay6, buildDay8, buildAwaitingPaymentReminder, buildConfirmed, buildProcessing, buildDispatched };
