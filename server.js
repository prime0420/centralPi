const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // Socket.io connection handler
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Start machine timeout checker after Next.js is ready
  // We'll use an internal API endpoint to trigger the timeout check
  let timeoutCheckInterval = null;
  
  setTimeout(() => {
    // Start periodic timeout checking by calling our internal endpoint
    timeoutCheckInterval = setInterval(async () => {
      try {
        // Call the timeout check API endpoint
        const response = await fetch(`http://localhost:${port}/api/machine-timeout-check`, {
          method: 'POST',
        }).catch((err) => {
          console.error('Error calling timeout check endpoint:', err.message);
          return null;
        });
        
        if (response) {
          const data = await response.json().catch(() => null);
          // Status is now derived from last_updated, so no database updates needed
          // The endpoint broadcasts updates via Socket.io for machines that have timed out
        }
      } catch (error) {
        console.error('Error in timeout check interval:', error);
      }
    }, 1000); // Check every 1 second
    
    console.log('Machine timeout checker started (checking every 1 second)');
  }, 2000);

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });

  // Export io for use in API routes
  global.io = io;
});

