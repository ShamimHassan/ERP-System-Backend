import app from './app';
import { env } from './config/env';

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`[server] NODE_ENV=${env.NODE_ENV}`);
  console.log(`[server] Server is running on port ${PORT}`);
  console.log(`[server] Health:   http://localhost:${PORT}/health`);
  console.log(`[server] Hello:    http://localhost:${PORT}/`);
});

export default app;
