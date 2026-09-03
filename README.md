# The Salty Dog Animal Rescue website

This folder is ready to deploy through Cloudflare Pages.

## Publish through GitHub and Cloudflare Pages

1. Create a new GitHub repository, such as `salty-dog-website`.
2. Upload `README.md` and the complete `public` folder to the repository's `main` branch.
3. In Cloudflare, open **Workers & Pages** and select **Create application**.
4. Choose **Pages**, then **Connect to Git**.
5. Authorize GitHub and select the new repository.
6. Use these build settings:
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: leave blank
   - Build output directory: `public`
7. Select **Save and Deploy**.

Cloudflare will create a free `*.pages.dev` address. Every later change pushed to the GitHub `main` branch will deploy automatically.

## Current prototype behavior

The public site and Wiggles gallery are fully static. The **Staff demo** lets someone select a photo and edit the profile in the browser, but it intentionally does not save changes. Persistent staff logins, image uploads, profile storage, and publishing will be added later using Cloudflare Workers, R2, and D1.
