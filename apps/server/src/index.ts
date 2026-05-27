import 'dotenv/config';
import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { Server as SocketServer } from 'socket.io';

import authRouter from './routes/auth';
import workspacesRouter from './routes/workspaces';
import projectsRouter from './routes/projects';
import tasksRouter from './routes/tasks';
import notificationsRouter from './routes/notifications';
import presenceRouter from './routes/presence';
import wikiRouter from './routes/wiki';
import snippetsRouter from './routes/snippets';
import activityRouter from './routes/activity';
import uploadsRouter from './routes/uploads';
import stripeRouter from './routes/stripe';
import { aiRouter } from './routes/ai';
import { setupBoardSocket } from './socket/board';
import { setupNotificationSocket } from './socket/notifications';
import { setupPresenceSocket } from './socket/presence';

const app: express.Application = express();
const httpServer = http.createServer(app);

// =============================================
// SOCKET.IO — Phase 2 will expand this
// =============================================

export const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`[socket] disconnected: ${socket.id}`);
  });
});

// =============================================
// MIDDLEWARE
// =============================================

app.use(helmet());
app.use(
  cors({
    origin: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    credentials: true,
  })
);
app.use(morgan('dev'));

// Stripe Webhook MUST be placed before express.json() because it needs the raw body
import Stripe from 'stripe';
import { prisma } from './lib/prisma';
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', { apiVersion: '2024-04-10' });
  
  try {
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET || ''
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      
      if (userId) {
        await prisma.user.update({
          where: { id: userId },
          data: { plan: 'PRO' },
        });
        console.log(`[Stripe] Upgraded user ${userId} to PRO`);
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error('[Stripe Webhook Error]', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Strict auth rate limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many auth attempts, please try again later.',
});

// =============================================
// ROUTES
// =============================================

app.use('/api/auth', authLimiter, authRouter);
app.use('/api/workspaces', workspacesRouter);
app.use('/api/workspaces/:workspaceId/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/presence', presenceRouter);
app.use('/api/wiki', wikiRouter);
app.use('/api/snippets', snippetsRouter);
app.use('/api/activity', activityRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/stripe', stripeRouter);

setupBoardSocket(io);
setupNotificationSocket(io);
setupPresenceSocket(io);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[error]', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
);

// =============================================
// START SERVER
// =============================================

const PORT = process.env.SERVER_PORT || 4000;

httpServer.listen(PORT, () => {
  console.log(`\n🚀 DevCollab Server running on http://localhost:${PORT}`);
  console.log(`📡 Socket.IO ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}\n`);
});

export default app;
