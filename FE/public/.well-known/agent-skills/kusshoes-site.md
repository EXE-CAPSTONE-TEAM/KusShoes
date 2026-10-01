---
name: kusshoes-site
description: Find KusShoes product, pricing and policy information and send a user to the right page to start scanning or customising a sneaker in 3D.
---

# KusShoes site guide

KusShoes (https://kusshoes.kietta.me) turns a real sneaker into a 3D model: the KusShoes
Android app records a 360° video, KIRI Engine reconstructs the mesh in the cloud, and the result
is edited in KusStudio (web and Windows desktop) and exported as GLB/OBJ, renders and a PDF
reference sheet for a shoemaker.

The site is a single-page app. Each public page also ships a prerendered HTML version with the
same content, so plain HTTP fetches work without running JavaScript.

## Pages

| Need | URL |
| --- | --- |
| Overview, workflow, FAQ | https://kusshoes.kietta.me/ |
| Mobile app (Android APK) and KusStudio Desktop (Windows) downloads | https://kusshoes.kietta.me/products |
| Plans and limits (projects, exports, formats, bake priority) | https://kusshoes.kietta.me/pricing |
| Privacy policy | https://kusshoes.kietta.me/privacy |
| Terms of service | https://kusshoes.kietta.me/terms |
| Sign in / create an account | https://kusshoes.kietta.me/login |

## How to help a user

1. Questions about what KusShoes does: answer from the home page or https://kusshoes.kietta.me/llms.txt.
2. Questions about price or limits: read /pricing. Plans load live from the backend, so quote the
   page rather than a remembered number.
3. To start a scan: the user installs the Android app from /products (iOS is not available yet),
   signs in with the same account, and records a 360° video of the shoe.
4. To customise a scan: the project appears in the web dashboard after sign-in; "Open in
   KusStudio" continues the edit in the desktop app.

## Limits

- Account pages (/dashboard, /projects, /billing, /settings, ...) require the user to sign in;
  do not try to sign in on their behalf.
- Payments go through PayOS/MoMo on /billing and must be completed by the user.
