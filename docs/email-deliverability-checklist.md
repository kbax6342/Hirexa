# Email Deliverability Checklist (Hirexa AI)

This checklist is for improving inbox placement for verification codes and welcome emails.

## Domain setup (required)
- Verify your sending domain with SendGrid.
- Use a dedicated sending subdomain, such as:
  - `mail.hirexa.ai` or `updates.hirexa.ai`
- Make sure the From address matches the verified domain.

## DNS records to configure
- SPF: include SendGrid
  - Example: `v=spf1 include:sendgrid.net -all`
- DKIM: add the SendGrid-provided CNAME records
- DMARC: start with monitoring, then tighten
  - Example: `v=DMARC1; p=none; rua=mailto:dmarc@hirexa.ai; ruf=mailto:dmarc@hirexa.ai; fo=1`
  - Move to `p=quarantine` or `p=reject` after monitoring

## Sender alignment
- Use a branded sender name: **Hirexa AI**
- Use a verified sending address like `no-reply@mail.hirexa.ai`
- Set Reply-To to a monitored address (e.g., `support@hirexa.ai`)

## Transactional vs marketing streams
- **Transactional**: verification codes, account security
- **Marketing/Promotional**: welcome and product updates
- Keep separate sender addresses and, if possible, separate subdomains

## Unsubscribe guidance
- Only include **List-Unsubscribe** headers for marketing/promotional emails
- Do **not** add unsubscribe headers to verification/OTP emails
- One-click unsubscribe should only apply to promotional mail

## Testing tools
- Mail-Tester: https://www.mail-tester.com/
- Gmail Postmaster Tools: https://postmaster.google.com/
- Send a seed email to Gmail, Outlook, and Yahoo to verify placement

## Recommended environment variables
- `SENDGRID_API_KEY`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO`
- `EMAIL_SUPPORT`
- `APP_URL`

## Notes
- Keep HTML minimal and accessible (avoid image-only emails)
- Always include a text/plain fallback
- Keep the subject line concise and non-spammy
