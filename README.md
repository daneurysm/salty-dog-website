# The Salty Dog Animal Rescue website

This folder is ready to deploy through Cloudflare Pages.

## Publish through GitHub and Cloudflare Pages

1. Create a new GitHub repository, such as `salty-dog-website`.
2. Upload `README.md`, `CONTACT-SETUP.md`, `build.js`, and the complete `public` and `functions` folders to the repository's `main` branch.
3. In Cloudflare, open **Workers & Pages** and select **Create application**.
4. Choose **Pages**, then **Connect to Git**.
5. Authorize GitHub and select the new repository.
6. Use these build settings:
   - Production branch: `main`
   - Framework preset: `None`
   - Build command: `node build.js`
   - Build output directory: `public`
7. Select **Save and Deploy**.

Cloudflare will create a free `*.pages.dev` address. Every later change pushed to the GitHub `main` branch will deploy automatically.

## Profile management

The public site builds animal profiles from the folders beneath `public/assets/dogs/`. Profiles are managed only through repository files; there is no public profile editor. Volunteer and Support links now lead to the contact form. Follow `CONTACT-SETUP.md` to activate email delivery.

## Dog profile assets

Each dog has a web-safe, lowercase folder beneath `public/assets/dogs/`. Photographs are stored in that dog's `photos` subfolder. For example:

```text
public/assets/dogs/wiggles/
  profile.txt
  photos/
    wiggles-1.webp
    wiggles-2.webp
    wiggles-3.webp
    wiggles-4.webp
```

Use the same pattern for new profiles, such as `public/assets/dogs/marleigh/`. Avoid spaces and capital letters in folder names because website paths are case-sensitive.

The `profile.txt` format is:

```text
Name: Wiggles
Age: 1 year old
Sex: Female
Breed: Staffordshire mix
Status: Available
Featured photo: wiggles-3.webp
Health: Spayed | Vaccinations current | Dog friendly

Description:
Write the complete public description here. It may continue across multiple lines.
```

`Name`, `Age`, `Sex`, `Breed`, and `Description` are required. `Status` defaults to `Available`. `Featured photo` selects the main image; otherwise the first photograph alphabetically is used. Separate the `Health` labels with vertical bars (`|`). Every supported image in the `photos` folder is automatically included in the gallery.

To add a dog, copy an existing dog folder, rename it using lowercase letters and hyphens, replace its photographs, and edit `profile.txt`. Commit the folder to GitHub. Cloudflare runs `build.js`, discovers every dog folder, and republishes the profiles automatically.
