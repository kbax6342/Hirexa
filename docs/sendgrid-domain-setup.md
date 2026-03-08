# SendGrid Domain Setup (Hirexa AI)

## Authenticate a subdomain
1. In SendGrid, go to **Settings ? Sender Authentication ? Authenticate Your Domain**.
2. Choose a dedicated subdomain for email (recommended):
   - `mail.hirexa.ai` (transactional)
   - `updates.hirexa.ai` (marketing/promotional)
3. SendGrid will generate CNAME records for DKIM and a branding record.
4. Add the **exact** CNAME records SendGrid provides to your DNS.

## Automated Security
- Enable **SendGrid Automated Security** if available.
- Follow the dashboard-generated SPF/DKIM instructions first.

## SPF / DKIM / DMARC
- SPF is often handled by SendGrid during domain authentication. Use the dashboard-provided record.
- DKIM must be the SendGrid-provided CNAME values.
- DMARC example (start in monitoring mode):
  - `v=DMARC1; p=none; rua=mailto:dmarc@hirexa.ai; ruf=mailto:dmarc@hirexa.ai; fo=1`
  - Move to `p=quarantine` or `p=reject` after monitoring.

## Sender separation
- **Transactional**: verification codes, account security
  - Example: `Hirexa AI <no-reply@mail.hirexa.ai>`
- **Marketing/Promotional**: welcome and updates
  - Example: `Hirexa AI <hello@updates.hirexa.ai>`

## Testing
- Use Mail-Tester: https://www.mail-tester.com/
- Monitor Gmail Postmaster Tools: https://postmaster.google.com/
- Seed test to Gmail/Outlook/Yahoo for real-world placement checks.

## Environment variables
Set these for production:
- `SENDGRID_API_KEY`
- `EMAIL_FROM` (e.g., `Hirexa AI <no-reply@mail.hirexa.ai>`)
- `EMAIL_REPLY_TO` (e.g., `support@hirexa.ai`)
- `EMAIL_SUPPORT` (e.g., `support@hirexa.ai`)
- `APP_URL` (e.g., `https://hirexa.ai`)

## Notes
- One-click unsubscribe headers should only be used for promotional mail.
- OTP/verification emails must remain strictly transactional.
