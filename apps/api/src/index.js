import { initDb } from './db.js';
import { seed } from './seed.js';
import { createApp } from './server.js';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('JWT_SECRET is required in production');
  process.exit(1);
}

const port = Number(process.env.PORT || 4000);
await initDb();
await seed();
createApp().listen(port, () => {
  console.log(`Milap API listening on http://localhost:${port}`);
});
