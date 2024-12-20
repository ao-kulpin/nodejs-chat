import express from 'express';
import http from 'node:http';
import https from 'node:https';
import fs  from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Server } from 'socket.io';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { availableParallelism } from 'node:os';
//import cluster from 'node:cluster';
//import { createAdapter, setupPrimary } from '@socket.io/cluster-adapter';

console.log('server starts...');

const argv = process.argv;
const protocol = argv.length < 3 ? "http": argv[2];
const port = argv.length < 4 ? 80 : parseInt(argv[3]);

//if (cluster.isPrimary) {
//  const numCPUs = availableParallelism();
//  for (let i = 0; i < numCPUs; i++) {
//    cluster.fork({
//      PORT: 3000 + i
//    });
//  }

//  setupPrimary();
//////////} else {
  const db = await open({
    filename: 'chat.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_offset TEXT UNIQUE,
      content TEXT
    );
  `);

  const options = {
    key: fs.readFileSync(
        "certbot/akulpin2.ru/privkey.pem"
    ),
    cert: fs.readFileSync(
        "certbot/akulpin2.ru/fullchain.pem"
    ),
  };


  const app = express();
  const __dirname = dirname(fileURLToPath(import.meta.url));
  app.use(express.static(__dirname, { dotfiles: 'allow' } ));

  const server = (protocol == "https" ? https: http).createServer(options, app);
  const io = new Server(server, {
    connectionStateRecovery: {},
    /////////// adapter: createAdapter()
  });

  app.get('/', (req, res) => {
    res.sendFile(join(__dirname, 'index.html'));
  });

  io.on('connection', async (socket) => {
    socket.on('chat message', async (_msg, clientOffset, callback) => {
      let result;
      const msg = socket.handshake.address + "(" + socket.handshake.url + ")==>" + _msg;
      try {
        result = await db.run('INSERT INTO messages (content, client_offset) VALUES (?, ?)', msg, clientOffset);
      } catch (e) {
        if (e.errno === 19 /* SQLITE_CONSTRAINT */ ) {
          callback();
        } else {
          // nothing to do, just let the client retry
        }
        return;
      }
      io.emit('chat message', msg, result.lastID);
      callback();
    });

    if (!socket.recovered) {
      try {
        await db.each('SELECT id, content FROM messages WHERE id > ?',
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit('chat message', row.content, row.id);
          }
        )
      } catch (e) {
        // something went wrong
      }
    }
  });

//////////  const port = process.env.PORT;
///////  const port = 8088;

  server.listen(port, () => {
    console.log(`server running at ${protocol}://localhost:${port}`);
  });
///////}
