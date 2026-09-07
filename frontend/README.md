# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.


## SpillTrace frontend integration

Run the backend first:

```powershell
cd backend
uvicorn app.main:app --reload
```

Then:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

The frontend uses the real scene, manifest, compatibility, upload, detection, hindcast and forecast APIs exposed by the current backend. AIS and candidate GET discovery are intentionally disabled unless their environment URLs are configured.

### Important current-backend behavior

- `/api/spills/{spill_id}/detect` is a mock endpoint and is labeled as such in the UI.
- Real detection uses the uploaded server-side `saved_path` and `/api/v1/detections`.
- The current detection response can return server-local artifact paths. A browser cannot display those paths unless the backend serves them through HTTP; the UI therefore does not fabricate artifact URLs.
- AIS remains unavailable when no AIS endpoint is configured.
- Candidate ranking only uses real AIS `candidate_input` records; it never invents vessels.
- A backend HTTP 409 is surfaced as a blocked candidate-attribution state with the backend reason.
