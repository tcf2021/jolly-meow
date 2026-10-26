/* oxlint-disable no-console -- command-line utilities report results to the operator */
import { createHash, randomBytes } from "node:crypto";

const email = process.env.ADMIN_EMAIL;
if (!email) throw new Error("Set ADMIN_EMAIL before running this script.");
const password =
  process.env.ADMIN_PASSWORD ?? randomBytes(18).toString("base64url");
const url = process.env.DDP_URL ?? "ws://127.0.0.1:13110/websocket";
const socket = new WebSocket(url);
const pending = new Map();
let nextId = 0;
const timeout = setTimeout(() => {
  console.error("Admin bootstrap timed out.");
  process.exit(1);
}, 60000);

const connected = new Promise((resolve, reject) => {
  socket.addEventListener("open", () => {
    socket.send(
      JSON.stringify({ msg: "connect", version: "1", support: ["1"] }),
    );
  });
  socket.addEventListener("error", () =>
    reject(new Error("DDP connection failed")),
  );
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.msg === "ping") {
      socket.send(JSON.stringify({ msg: "pong", id: message.id }));
    } else if (message.msg === "connected") {
      resolve();
    } else if (message.msg === "result") {
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        if (message.error)
          waiter.reject(new Error(JSON.stringify(message.error)));
        else waiter.resolve(message.result);
      }
    }
  });
});

const call = (method, params) =>
  new Promise((resolve, reject) => {
    const id = String(++nextId);
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ msg: "method", id, method, params }));
  });

try {
  await connected;
  if (process.env.BOOTSTRAP_CREATE !== "false") {
    await call("Users.methods.provisionFirst", [{ email, password }]);
  }
  const login = await call("login", [
    {
      user: { email },
      password: {
        digest: createHash("sha256").update(password).digest("hex"),
        algorithm: "sha-256",
      },
    },
  ]);
  if (process.env.BOOTSTRAP_CREATE !== "false") {
    for (const name of [
      "disable.google",
      "disable.discord",
      "disable.webrtc",
    ]) {
      await call("FeatureFlags.methods.set", [{ name, type: "on" }]);
    }
    await call("Setup.methods.configureTeamName", [{ teamName: "Jolly Meow" }]);
    await call("Users.methods.updateProfile", [
      { displayName: email.split("@")[0], dingwords: [] },
    ]);
    console.log(JSON.stringify({ email, password, userId: login.id }));
  } else {
    console.log(JSON.stringify({ email, userId: login.id, login: "verified" }));
  }
} finally {
  clearTimeout(timeout);
  socket.close();
}
