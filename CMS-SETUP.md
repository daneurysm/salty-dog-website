# Salty Dog CMS: deployment and operation

This adds a separate management portal for authorized staff. The public website
never links to it. The portal serves a login screen, and API requests require a
valid Supabase user session, an active D1 account, and the required role. A hidden
URL and noindex settings are not the authorization mechanism.

## Components

- Public site and API: existing Cloudflare Pages project, output `public`.
- Management site: separate Pages project, output `admin/public`.
- Login and optional MFA: Supabase Auth. Public sign-ups and anonymous sign-ins off.
- Dog records, permissions, and audit log: Cloudflare D1, binding `DB`.
- Uploaded images: private Cloudflare R2 bucket, binding `DOG_PHOTOS`.

## Already completed in this setup

- D1 database `salty-dog-cms` exists and is bound as `DB` in Production.
- The four tables and two superuser-protection triggers from
  `migrations/0001_cms.sql` have been created. Do not rerun this migration.
- Two initial Supabase accounts have corresponding active superuser records in D1.
- R2 bucket `salty-dog-photos` is bound as `DOG_PHOTOS` in Production.
- Public Supabase registration is disabled; Email/password login remains enabled.
- The Supabase URL, publishable key, and secret key have been entered in Cloudflare.

## 1. Finish public backend environment settings

In the EXISTING public Pages project's Production Variables and secrets:

| Name | Type | Value |
| --- | --- | --- |
| SUPABASE_URL | Text | Supabase project URL |
| SUPABASE_PUBLISHABLE_KEY | Text | sb_publishable_… |
| SUPABASE_SECRET_KEY | Secret | sb_secret_… |
| CMS_ORIGIN | Text | https://manage.saltydogrescue.org |
| CMS_ENABLED | Text | false initially |
| CMS_SMS_MFA_ENABLED | Text | false initially (optional; false is the default) |

These settings belong to the public API project, not the static management project.
Never add the secret key to source files or screenshots. Redeploy after changing
bindings, variables, or secrets so the deployed backend gets the new values.

## 2. Upload source changes to the existing GitHub repository

Keep the folder structure from this package. Add or replace the root-level files
and folders in the existing repository; do not put the entire package in `public`.
The `admin` folder must be beside `public`, not inside it. Existing photos and
contact-form backend are retained.

Public project build command remains `node build.js`; output remains `public`.
Cloudflare bundles Pages Functions automatically. The updated `public/_routes.json`
includes `/api/*` and `/media/*`. The API is not a standalone database endpoint:
only public dog fields are returned, and privileged actions check the signed-in user.

Do not enable CMS data yet: `CMS_ENABLED=false` preserves the file-based listings.
The public JavaScript and stylesheet URLs have a release version to avoid stale
browser caches when upgrading from the tabbed site.

## 3. Import existing dog profiles

The included `setup/import-dogs.sql` was generated from the repository profiles.
Run it in the `salty-dog-cms` D1 Console. It inserts only missing profiles and never
overwrites edits made through the CMS. Review imported adoption statuses before
activating database-driven listings. It preserves the repository's existing status;
it does not guess whether a dog has since been adopted.

The database user IDs must match the Supabase User UID exactly. Passwords are
held by Supabase Auth, never by the D1 tables.

## 4. Create the separate management Pages project

Create a second Cloudflare Pages project connected to the SAME GitHub repository:

- Project name: `salty-dog-management` (or another unused name).
- Production branch: `main`.
- Framework preset: None.
- Root directory: repository root (leave blank).
- Build command: `npm run build:admin`.
- Build output directory: `admin/public`.

Cloudflare installs the root package dependencies automatically. The build bundles
Supabase's browser SDK into `cms.js`; no service secret is included. The management
project does not need D1, R2, or secret bindings. Its `_routes.json` excludes all
Functions, so it serves static assets only.

Add the custom domain `manage.saltydogrescue.org` to this second project's Custom
domains tab. Follow Cloudflare's DNS prompts. The public site keeps its existing
domain. No link to the portal is added to public navigation.

`admin/public/config.js` points to the public API at `https://saltydogrescue.org`.
If you choose a different public API or management domain, update the config,
`CMS_ORIGIN`, the management `_headers` Content Security Policy, and Supabase URL
settings together. Do not use a wildcard management origin.

## 5. Supabase settings and MFA

Keep Data API disabled: this application uses the separate Auth API.
In Authentication URL Configuration, set the Site URL to
`https://manage.saltydogrescue.org` and allow that exact URL if redirect settings
are requested. No invitation or recovery redirect is required for ordinary
password sign-in in this release.

In Authentication's Multi-Factor settings, enable authenticator-app enrollment
and verification. Each user opts in through My account. The backend rejects
password-only (aal1) sessions after that user has enrolled MFA. Supabase verifies
the second factor and issues the upgraded (aal2) session.

Phone/SMS enrollment is implemented but hidden by default. Enabling it requires
Supabase Phone MFA to be available on the plan and a configured SMS provider.
Only after configuring those services, set `CMS_SMS_MFA_ENABLED=true` and redeploy
the public API. SMS costs and provider setup are separate from this application.

Supabase Free projects may pause after inactivity. Before launch, decide whether
that is acceptable for staff access or whether a non-pausing paid plan is needed.
The public dog listings use D1 and do not require Supabase login to be available.

## 6. Verify before activating database listings

Use only the two owner-controlled accounts for now. No additional staff need to
be added until the owner is ready.

1. Sign in on the management domain using each initial account.
2. Verify both show Superuser and can see Users.
3. Review imported dogs, photos, compatibility traits, and adoption status.
4. Preview an adopted profile: verify the ADOPTED photo overlay and status badge.
5. Test a temporary regular account when ready: it can add/edit dogs but cannot
   delete profiles, restore them, or manage users. Disabled accounts immediately
   lose API access on their next request.
6. Enroll MFA for an account and verify a fresh login requests its second factor.
7. Test photo uploads with a real JPG/PNG/WebP. Unpublished new uploads remain
   inaccessible through the public media route until a profile references them.

After review, set `CMS_ENABLED=true` and redeploy the public Pages project. The
public site now loads dog profiles from D1 on each page load. An API failure shows
an unavailable message instead of resurrecting outdated Available listings.

## Everyday use

- Add dog: fill in name/breed, choose gender/status, optionally enter age, check
  confirmed traits, enter up to 1,000 words, and upload 1–12 photos.
- The first photo is the main photo; use Make main photo to change it.
- Preview before saving. Saving publishes immediately once CMS mode is enabled.
- Unchecked compatibility traits are omitted, not described as unsafe.
- Delete: superusers only; type the dog's name. This is a recoverable deletion.
  Deleted profiles remain in the superuser list with Restore profile.
- Users: superusers can create users, edit names/roles, disable accounts, and set
  temporary passwords. New and reset passwords must be replaced at first login.
- The last two active superusers cannot be disabled, demoted, or deleted.
- Password reset does not remove MFA. Lost-MFA recovery needs the Supabase project
  owner to verify identity and use the provider's recovery/admin tools.
- Source changes and old file-based dog folders are no longer needed for routine
  profile updates after activation.

## Validation and limitations

`npm test` checks authorization, MFA enforcement, account deactivation,
concurrent edit conflicts, word limits, upload validation, public projection,
recoverable deletion, and preservation of two active superusers. Auth-provider
responses are mocked in automated tests. Browser QA uses synthetic local accounts
and an in-memory database, never the owner's real passwords or secrets.

`npm run build:admin` bundles the frontend. `wrangler pages functions build`
checks the production Functions bundle. Live Supabase login, live R2 uploads,
real SMS delivery, and custom-domain deployment require the owner's environment
and must be checked during the activation walkthrough.

The portal currently manages dog profiles and accounts. General website-copy
editing can be added later without changing this authentication structure.

Uploads removed from a profile are not immediately erased from R2; this avoids
breaking other profiles. Unreferenced uploads should be periodically reviewed and
cleaned up. The public media route refuses unreferenced uploads and deleted dogs.
Backups/exports should cover D1 and R2 separately.

The local `npm run dev` command is a SYNTHETIC TEST HARNESS, not a production
server and not a way to sign in to live accounts. Never deploy `tests/preview.mjs`.
