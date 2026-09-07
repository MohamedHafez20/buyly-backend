import "dotenv/config";
import http from "http";
import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { initSocket } from "./src/realtime/socket.js";

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  // Wrap Express in a raw HTTP server so Socket.IO can share the same port.
  const server = http.createServer(app);
  initSocket(server);
  server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
