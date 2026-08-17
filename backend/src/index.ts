import { httpServer } from "./app.js";

const PORT = Number(process.env.PORT) || 4000;
httpServer.listen(PORT, () => {
  console.log(`HIS backend listening on :${PORT}`);
});
