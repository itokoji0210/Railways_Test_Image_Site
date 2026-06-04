# Rail Photo Tiles

Rail Photo Tiles is a lightweight photo log for railway snapshots. The gallery highlights photos automatically, moves the linked map as the current photo changes, and opens a larger overlay viewer when a photo is clicked.

## Files

- `index.html` - page structure
- `style.css` - gallery, responsive layout, and viewer styling
- `app.js` - filters, auto-flow, viewer, and Leaflet map behavior
- `photos.json` - photo metadata
- `assets/photos/` - compressed display photos
- `assets/photos/thumbs/` - small thumbnails for the gallery and preview panel

## Local Preview

Use a local server because the site fetches `photos.json`.

```powershell
cd "C:\Users\itoko\Documents\Codex\2026-06-04\c-users-itoko-onedrive-desktop-photo"
python -m http.server 5500
```

Then open:

```text
http://127.0.0.1:5500/index.html
```

VS Code Live Server also works.

## GitHub Pages

Upload this folder to a GitHub repository, then enable Pages from the repository settings.

Recommended Pages setting:

- Source: Deploy from a branch
- Branch: `main`
- Folder: `/root`

The original high-resolution photos were backed up outside this project folder. The files inside `assets/photos/` are compressed for web display.
