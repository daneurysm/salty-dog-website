# Activate the Salty Dog contact form

The website changes are complete, but email sending requires configuration in your accounts. Until configured, Send stays disabled and visitors see an email/phone fallback. This package has not been deployed to your live domain.

## 1. Set up the sender

Create a Resend account at https://resend.com and add `saltydogrescue.org` as a sending domain. Add the exact verification DNS records Resend supplies in Cloudflare and wait for Resend to mark it verified. Preserve existing mail records; follow Resend's instructions for the sending subdomain it specifies. Create an API key with sending access to this domain. Do not upload the key to GitHub or paste it into public website files.

The suggested From address is `Salty Dog website <website@saltydogrescue.org>`. A mailbox at that address is not needed for sending; replies go to the visitor's email through Reply-To. Choose the destination inbox that should receive volunteer/support messages. The site's existing public inbox is `saltydoganimalrescue2025@yahoo.com`.

## 2. Add spam protection

In Cloudflare, create a Managed Turnstile widget. Allow `saltydogrescue.org` and `www.saltydogrescue.org`, plus your actual Pages hostname if you want to use the form there. Copy its site key and secret key. The form verifies the token on the server and checks the hostname and action before sending email.

## 3. Configure the Pages project

Open **Workers & Pages → your Pages project → Settings → Variables and Secrets** (the wording may appear as Environment variables). Add these to **Production**:

| Name | Value | Type |
| --- | --- | --- |
| `RESEND_API_KEY` | The Resend sending API key | Secret |
| `CONTACT_FROM` | `Salty Dog website <website@saltydogrescue.org>` after domain verification | Text |
| `CONTACT_TO` | The inbox you want to receive messages | Text |
| `TURNSTILE_SITE_KEY` | Your widget's site key | Text |
| `TURNSTILE_SECRET_KEY` | Your widget's secret key | Secret |

No credentials belong in GitHub. Preview deployments need separate environment configuration if you want email enabled there; otherwise leave them unconfigured.

## 4. Upload and deploy

Upload the contents of the unzipped update folder to the **root** of the GitHub repository, where `build.js` already lives. Preserve the directory structure. In particular, `functions` belongs beside `public`, not inside it. This update contains only changed/new site files, so it won't overwrite your dog folders.

Keep the existing build command `node build.js` and output directory `public`. Commit the changes. The Git connection deploys the Pages Function alongside the site. If you add or change environment values afterward, redeploy for them to take effect.

## 5. Confirm delivery

After deployment and configuration, submit a message using your own email address, confirm that it arrives in the destination inbox (check spam), and confirm Reply addresses the sender. The on-page confirmation means the email service accepted the message, not proof of inbox delivery. Real delivery was not tested while preparing this update because account credentials were not available.

Both links open the same form and preselect the relevant interest. The form sends plain-text email, never writes dog profiles, and preserves entered text on failure. Visitor messages pass through Cloudflare and Resend. Turnstile and the hidden honeypot reduce automated submissions; monitor Resend usage and add Cloudflare rate limiting if abuse appears.

Official references:
- Pages Functions: https://developers.cloudflare.com/pages/functions/get-started/
- Pages environment variables: https://developers.cloudflare.com/pages/functions/bindings/#environment-variables
- Resend sending domains: https://resend.com/docs/dashboard/domains/introduction
- Resend email API: https://resend.com/docs/api-reference/emails/send-email
- Turnstile validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
