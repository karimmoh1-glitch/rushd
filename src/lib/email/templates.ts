// Plain, fast-loading emails in the Rushd identity: graphite text on paper, one
// saffron point. Every template returns matching HTML and text.

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escapes text for safe use inside HTML. */
function esc(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function layout(body: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f5f2;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1b19">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e6e3dc;border-radius:16px">
<tr><td style="padding:28px 28px 8px;font-family:Georgia,serif;font-size:20px">Rushd <span style="display:inline-block;width:8px;height:8px;border-radius:4px;background:#e5a63b;vertical-align:middle"></span></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.55">${body}</td></tr>
</table>
<p style="max-width:520px;font-size:12px;line-height:1.5;color:#6b675f;margin:16px auto 0">${footer}</p>
</td></tr></table></body></html>`;
}

function button(href: string, label: string): string {
  return `<a href="${esc(href)}" style="display:inline-block;background:#1c1b19;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:600;font-size:14px">${esc(label)}</a>`;
}

export function passwordResetEmail(link: string) {
  return {
    subject: "Reset your Rushd password",
    html: layout(
      `<p>Someone (hopefully you) asked to reset the password for this Rushd account.</p><p style="margin:24px 0">${button(link, "Choose a new password")}</p><p style="color:#6b675f;font-size:13px">The link works once and expires in an hour. If you didn't ask, ignore this email; your password stays the same.</p>`,
      "You're getting this because a password reset was requested on therushd.com.",
    ),
    text: `Reset your Rushd password: ${link}\n\nThe link works once and expires in an hour. If you didn't ask, ignore this email.`,
  };
}

export interface DigestItem {
  title: string;
  className: string;
  pulse: number;
  due: string;
}

const SAFFRON_DOT = '<span style="display:inline-block;width:7px;height:7px;border-radius:4px;background:#e5a63b;margin-right:6px;vertical-align:middle"></span>';

/** One table row of the digest. The first (top-ranked) item gets the saffron dot. */
function digestRow(item: DigestItem, isFirst: boolean): string {
  const dot = isFirst ? SAFFRON_DOT : "";
  return `<tr><td style="padding:10px 0;border-top:1px solid #eeebe4"><div style="font-weight:600">${dot}${esc(item.title)}</div><div style="font-size:13px;color:#6b675f">${esc(item.className)} · ${esc(item.due)}</div></td><td align="right" style="padding:10px 0;border-top:1px solid #eeebe4;font-family:Menlo,monospace;font-size:14px">${item.pulse}</td></tr>`;
}

export function weeklyDigestEmail(p: { name: string | null; items: DigestItem[]; plannedMinutes: number; streak: number; appUrl: string; unsubscribeUrl: string }) {
  const hours = Math.round((p.plannedMinutes / 60) * 10) / 10;
  const hasItems = p.items.length > 0;

  let rows = "";
  for (let n = 0; n < p.items.length; n++) rows += digestRow(p.items[n], n === 0);

  let intro: string;
  if (hasItems) {
    intro = "Here's your week, ranked by Pulse.";
    if (p.plannedMinutes) intro += ` About ${hours} hours of study is planned.`;
  } else {
    intro = "Nothing is due this week. A good week to get ahead, or to quiz yourself on last unit.";
  }

  const greeting = p.name ? `Hi ${esc(p.name)},` : "Hi,";
  const table = hasItems ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0">${rows}</table>` : "";
  const streakLine = p.streak >= 2 ? `<p style="color:#6b675f">You're on a ${p.streak}-day study streak.</p>` : "";
  const body = `<p>${greeting}</p><p>${intro}</p>${table}${streakLine}<p style="margin:24px 0 0">${button(`${p.appUrl}/dashboard`, "Open today's plan")}</p>`;
  const footer = `Sunday email from Rushd. <a href="${esc(p.unsubscribeUrl)}" style="color:#6b675f">Turn off study emails</a>.`;

  const textLines: string[] = [];
  for (const i of p.items) textLines.push(`${i.pulse}  ${i.title} (${i.className}, ${i.due})`);
  const text = `${intro}\n\n${textLines.join("\n")}\n\nOpen today's plan: ${p.appUrl}/dashboard\nTurn off study emails: ${p.unsubscribeUrl}`;

  return {
    subject: hasItems ? `Your week: start with ${p.items[0].title}` : "Your week is clear",
    html: layout(body, footer),
    text,
  };
}

export function streakNudgeEmail(p: { streak: number; next: string | null; appUrl: string; unsubscribeUrl: string }) {
  let nextLine = "A quick practice check or a tutor question counts.";
  let nextText = "";
  if (p.next) {
    nextLine = `Next up: <strong>${esc(p.next)}</strong>. Even 15 minutes counts.`;
    nextText = ` Next up: ${p.next}.`;
  }

  const body = `<p>You've studied ${p.streak} days in a row. Today isn't logged yet.</p><p>${nextLine}</p><p style="margin:24px 0 0">${button(`${p.appUrl}/dashboard`, "Study for 15 minutes")}</p>`;
  const footer = `Streak reminder from Rushd, sent at most once a day. <a href="${esc(p.unsubscribeUrl)}" style="color:#6b675f">Turn off study emails</a>.`;
  return {
    subject: `Keep your ${p.streak}-day streak`,
    html: layout(body, footer),
    text: `You've studied ${p.streak} days in a row. Today isn't logged yet.${nextText}\n\n${p.appUrl}/dashboard\nTurn off study emails: ${p.unsubscribeUrl}`,
  };
}
