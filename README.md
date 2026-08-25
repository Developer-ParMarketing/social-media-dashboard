# Social Media Analytics Dashboard

A Next.js dashboard for monitoring social media performance and analytics across Facebook, Instagram, and Ads.

## What’s Implemented

### Frontend
- **Home page** with a marketing dashboard landing card and navigation to Facebook accounts.
- **Facebook Accounts page** (`/accounts`)
  - Lists connected Facebook pages and accounts.
  - Shows page name, ID, category, and task tags.
  - Clicking a row opens the account detail page.
- **Facebook/Instagram Account Detail page** (`/accounts/[id]`)
  - Displays analytics charts for engagement, reach, content volume, and reel performance.
  - Uses Chart.js loaded dynamically in the browser.
- **Instagram Media page** (`/instagram`)
  - Fetches Instagram media from the backend.
  - Displays media entries in a reusable table.
  - Supports viewing detailed media insights in a modal.
- **Ads Insights page** (`/ads`)
  - Loads ad performance data from the backend.
  - Displays insights in a table.
- **Best Posts page** (`/best-posts`)
  - Shows top-performing Instagram posts.
  - Includes media preview, caption summary, likes, comments, shares, saves, reach, engagement rate, and score.
- Shared UI components:
  - `Table` for responsive data display.
  - `Modal` for viewing row-specific details.
  - `Navbar` and site-wide layout in `app/layout.js`.

### Backend
- Express server in `backend/index.js`.
- MongoDB integration via Mongoose.
- API routes mounted under `/api`:
  - `/api/ads`
  - `/api/instagram`
  - `/api/facebook`
  - `/api/sync`
- Backend currently connects to a local MongoDB instance at `mongodb://admin:Parmarketing%404545%23@localhost:27017/social_dashboard?authSource=admin`.

### API Client
- Frontend uses `services/api.js` to call the backend.
- Current base URL is configured as `https://social-backend.parmarketing.co.uk/api` with a commented local fallback.

## Run Locally

### Frontend
```bash
npm install
npm run dev
```
- App runs on `http://localhost:3000` by default.

### Backend
```bash
cd backend
npm install
node index.js
```
- Server listens on port `8019`.

## Project Structure

- `app/` - Next.js app router pages and UI.
- `components/` - Reusable React components like `Table`, `Modal`, `Navbar`, and `Loader`.
- `services/api.js` - Axios instance for backend API calls.
- `backend/` - Express API server, routes, controllers, and Mongoose models.
- `public/` - Static assets.

## Notes

- The frontend currently expects a backend API that serves Facebook, Instagram, and Ads analytics data.
- The repo includes both the Next.js frontend and the Express backend, but the backend URL is configurable in `services/api.js`.
